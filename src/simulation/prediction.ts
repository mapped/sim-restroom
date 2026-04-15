// Copyright 2026 Mapped Inc.
// SPDX-License-Identifier: MIT
// See LICENSE at the repository root for full license text.

import {
  SimEvent,
  RestroomStatus,
  RestroomPrediction,
  WorkOrder,
  ScheduledMeeting,
} from "@/types/sim";
import { SIM_CONFIG, JANITORIAL_RULES } from "@/simulation/config";
import { createWorkOrder, emitWorkOrderCreated } from "@/simulation/workorder";

// ============================================================================
// PREDICTION MODEL — Two-layer calendar-aware usage forecasting
//
// Layer 1: Rolling usage rate from recent ENTER events → linear extrapolation
// Layer 2: Calendar surge overlay for all-hands meeting → piecewise rate boost
// ============================================================================

const POPULATION = 20;
const NUM_RESTROOMS = JANITORIAL_RULES.restroomIds.length;
const DAY_LENGTH = SIM_CONFIG.WORK_DAY_END - SIM_CONFIG.WORK_DAY_START;

// Default rate when insufficient data: population * visits/day / dayLength / numRestrooms
const DEFAULT_RATE = (POPULATION * SIM_CONFIG.RESTROOM_VISITS_PER_DAY) / DAY_LENGTH / NUM_RESTROOMS;

// Post-all-hands surge parameters
const SURGE_START = SIM_CONFIG.ALL_HANDS_TIME + SIM_CONFIG.ALL_HANDS_DURATION; // 1:10 PM
const SURGE_DURATION = 10; // minutes of elevated usage after meeting
const SURGE_END = SURGE_START + SURGE_DURATION;
const SURGE_RATE = 0.8; // uses per minute per restroom during surge

// How far ahead of predicted threshold to dispatch janitor
const TRAVEL_TIME = 3; // minutes for janitor to walk to restroom
const BUFFER_TIME = 2; // safety margin

const ROLLING_WINDOW = 10; // number of recent ENTER events to average

/**
 * Compute usage rate from recent ENTER events for a restroom.
 * Returns uses per sim-minute.
 */
function computeBaseRate(
  roomId: string,
  eventHistory: SimEvent[],
  lastCleanedAt: number,
  currentTime: number
): { rate: number; confidence: "low" | "medium" | "high" } {
  // Get ENTER events for this room since last cleaning
  const enters = eventHistory.filter(
    (e) => e.type === "ENTER" && e.restroomId === roomId && e.timestamp >= lastCleanedAt
  );

  if (enters.length < 3) {
    return { rate: DEFAULT_RATE, confidence: "low" };
  }

  // Use last N events for rolling window
  const recent = enters.slice(-ROLLING_WINDOW);
  const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp;

  if (timeSpan <= 0) {
    return { rate: DEFAULT_RATE, confidence: "low" };
  }

  const rate = (recent.length - 1) / timeSpan; // events per minute
  const confidence = enters.length >= 10 ? "high" : "medium";

  return { rate, confidence };
}

/**
 * Compute extra usage rate contributed by post-meeting restroom surges.
 * Each meeting whose 10-minute post-meeting window overlaps currentTime
 * contributes based on attendee + guest count.
 */
function computeMeetingSurgeRate(currentTime: number, meetings: ScheduledMeeting[]): number {
  const SURGE_WINDOW = 10; // minutes after meeting end
  const RATE_PER_PERSON = 0.08; // uses per minute per restroom per person

  let total = 0;
  for (const m of meetings) {
    if (currentTime >= m.endTime && currentTime < m.endTime + SURGE_WINDOW) {
      const size = m.attendeeIds.length + (m.guestIds?.length ?? 0);
      total += size * RATE_PER_PERSON;
    }
  }
  return total;
}

/**
 * Predict when usage will hit the cleaning threshold, accounting for
 * calendar-based surge events (all-hands meeting and scheduled meetings).
 */
function predictThresholdTime(
  usageCount: number,
  baseRate: number,
  currentTime: number,
  meetings: ScheduledMeeting[]
): number | null {
  const remaining = JANITORIAL_RULES.cleaningThreshold - usageCount;
  if (remaining <= 0) return currentTime; // already at threshold

  let accumulated = 0;
  let t = currentTime;
  const step = 1; // simulate in 1-minute steps

  // Walk forward in time, accumulating predicted usage
  while (accumulated < remaining && t < SIM_CONFIG.WORK_DAY_END) {
    let rate = baseRate;

    // Apply surge multiplier during post-all-hands window
    if (t >= SURGE_START && t < SURGE_END) {
      rate = Math.max(rate, SURGE_RATE);
    }

    // Apply meeting-based surge
    rate += computeMeetingSurgeRate(t, meetings);

    accumulated += rate * step;
    t += step;
  }

  if (accumulated >= remaining) return t;
  return null; // won't hit threshold today
}

/**
 * Determine when to dispatch the janitor for pre-emptive cleaning.
 * The magic: if all-hands is upcoming and threshold will be hit during/after
 * the post-meeting surge, clean DURING the meeting when restrooms are empty.
 * Also: if a large scheduled meeting is upcoming and the threshold is predicted
 * near that meeting, clean during the meeting when restrooms are likely empty.
 */
function computeSuggestedCleanTime(
  predictedThresholdTime: number | null,
  usageCount: number,
  currentTime: number,
  meetings: ScheduledMeeting[]
): number | null {
  if (!predictedThresholdTime) return null;

  // If threshold already hit, clean now
  if (usageCount >= JANITORIAL_RULES.cleaningThreshold) return currentTime;

  // All-hands scenario: if threshold will be hit during/after the surge,
  // and we're before the all-hands, suggest cleaning during the meeting
  const allHandsUpcoming = currentTime < SIM_CONFIG.ALL_HANDS_TIME;
  const thresholdDuringSurge =
    predictedThresholdTime >= SURGE_START && predictedThresholdTime <= SURGE_END + 15;
  const usageSignificant = usageCount >= JANITORIAL_RULES.cleaningThreshold * 0.4; // at least 40% used

  if (allHandsUpcoming && thresholdDuringSurge && usageSignificant) {
    // Clean during the meeting — restrooms will be empty
    return SIM_CONFIG.ALL_HANDS_TIME + 1;
  }

  // Meeting-based early clean: if threshold predicted during/near a large meeting,
  // clean during that meeting when restroom attendance is likely low
  const largeMeeting = meetings.find((m) => {
    const size = m.attendeeIds.length + (m.guestIds?.length ?? 0);
    return (
      size >= 4 &&
      currentTime < m.startTime &&
      predictedThresholdTime >= m.startTime - 5 &&
      predictedThresholdTime <= m.endTime + 20
    );
  });
  if (largeMeeting && usageCount >= JANITORIAL_RULES.cleaningThreshold * 0.4) {
    return largeMeeting.startTime + 1; // clean during the meeting
  }

  // Non-calendar scenario: dispatch early enough to finish before threshold
  const leadTime = JANITORIAL_RULES.cleaningDuration + TRAVEL_TIME + BUFFER_TIME;
  const suggested = predictedThresholdTime - leadTime;

  // Don't suggest a time in the past
  return suggested > currentTime ? suggested : currentTime;
}

/**
 * Main prediction function. Called each tick in predictive mode.
 *
 * NOTE: The call site in engine.ts must pass the `meetings` argument.
 * The engine.ts agent is handling that update separately.
 */
export function computePredictions(
  statuses: RestroomStatus[],
  eventHistory: SimEvent[],
  currentTime: number,
  meetings: ScheduledMeeting[]
): RestroomPrediction[] {
  return statuses.map((status) => {
    if (status.isBeingCleaned) {
      return {
        roomId: status.roomId,
        predictedThresholdTime: null,
        suggestedCleanTime: null,
        baseRate: 0,
        surgeExpected: false,
        confidence: "high" as const,
      };
    }

    const { rate, confidence } = computeBaseRate(
      status.roomId,
      eventHistory,
      status.lastCleanedAt,
      currentTime
    );

    const predictedThresholdTime = predictThresholdTime(
      status.usageCount,
      rate,
      currentTime,
      meetings
    );

    // Surge is relevant only if: we're before the surge window, the threshold
    // is predicted to be hit around the surge, AND usage is significant enough
    // that the surge actually matters (not freshly cleaned).
    const allHandsSurgeExpected =
      currentTime < SURGE_END &&
      predictedThresholdTime != null &&
      predictedThresholdTime >= SURGE_START - 30 &&
      status.usageCount >= JANITORIAL_RULES.cleaningThreshold * 0.3;

    // Also flag surge if a large meeting ends in the next 30 minutes
    const upcomingLargeMeeting = meetings.some((m) => {
      const size = m.attendeeIds.length + (m.guestIds?.length ?? 0);
      return size >= 3 && m.endTime > currentTime && m.endTime <= currentTime + 30;
    });

    const surgeExpected = allHandsSurgeExpected || upcomingLargeMeeting;

    const suggestedCleanTime = computeSuggestedCleanTime(
      predictedThresholdTime,
      status.usageCount,
      currentTime,
      meetings
    );

    return {
      roomId: status.roomId,
      predictedThresholdTime,
      suggestedCleanTime,
      baseRate: rate,
      surgeExpected,
      confidence,
    };
  });
}

/**
 * Create pre-emptive work orders when the suggested clean time arrives.
 * Does not replace the reactive threshold system — augments it.
 */
export function maybeCreatePreemptiveWorkOrders(
  predictions: RestroomPrediction[],
  workOrders: WorkOrder[],
  statuses: RestroomStatus[],
  currentTime: number,
  day: number,
  meetings: ScheduledMeeting[],
  events: SimEvent[]
): WorkOrder[] {
  const updated = [...workOrders];

  for (const pred of predictions) {
    if (!pred.suggestedCleanTime) continue;
    if (currentTime < pred.suggestedCleanTime) continue;

    const status = statuses.find((s) => s.roomId === pred.roomId);
    if (!status || status.isBeingCleaned) continue;
    // Don't dispatch if already under threshold (was already cleaned)
    if (status.usageCount < JANITORIAL_RULES.cleaningThreshold * 0.3) continue;

    const hasOrder = updated.some(
      (wo) =>
        wo.restroomId === pred.roomId && (wo.status === "PENDING" || wo.status === "IN_PROGRESS")
    );
    if (hasOrder) continue;

    // Pick a reason: surge-driven dispatch vs. ETA-driven dispatch.
    // If the suggested clean time aligns with a known meeting start (within a
    // few minutes), treat it as a surge-mitigation work order.
    const alignedMeeting = meetings.find(
      (m) =>
        Math.abs(m.startTime - pred.suggestedCleanTime!) <= 3 &&
        m.attendeeIds.length + (m.guestIds?.length ?? 0) >= 3
    );
    const reason = pred.surgeExpected || alignedMeeting ? "PREDICTIVE_SURGE" : "PREDICTIVE_ETA";

    const wo = createWorkOrder(pred.roomId, reason, currentTime, day, {
      thresholdTime: pred.predictedThresholdTime,
      meetingTime: alignedMeeting?.startTime ?? null,
    });
    updated.push(wo);
    emitWorkOrderCreated(events, wo, currentTime);
  }

  return updated;
}
