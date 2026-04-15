// Copyright 2026 Mapped Inc.
// SPDX-License-Identifier: MIT
// See LICENSE at the repository root for full license text.

export type Point = { x: number; y: number };

export enum RoomType {
  DESK = "DESK",
  CAFETERIA = "CAFETERIA",
  AUDITORIUM = "AUDITORIUM",
  RESTROOM_GN = "RESTROOM_GN", // Gender Neutral
  RESTROOM_FAM = "RESTROOM_FAM", // Family
  MEETING_ROOM = "MEETING_ROOM",
  BREAK_AREA = "BREAK_AREA",
  JANITOR_CLOSET = "JANITOR_CLOSET",
  LOBBY = "LOBBY",
  PATH = "PATH",
}

export interface Room {
  id: string;
  type: RoomType;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  capacity?: number;
  occupancy?: string[]; // Derived from registry each tick — never set directly
  flashColor?: "green" | "red" | null;
  flashTimer?: number;
  door: Point; // Entry/Exit point
}

export enum NPCState {
  IDLE = "IDLE",
  WALKING = "WALKING",
  WORKING = "WORKING",
  EATING = "EATING",
  RESTROOM = "RESTROOM",
  MEETING = "MEETING",
  CLEANING = "CLEANING",
  BREAK = "BREAK",
  WAVING = "WAVING", // janitor waving goodbye before leaving for the day
  AWAY = "AWAY", // not in the building (before arrival or after departure)
}

export interface NPC {
  id: string;
  name: string;
  npcType?: "EMPLOYEE" | "JANITOR" | "GUEST" | "MEETING_GUEST"; // defaults to EMPLOYEE
  meetingId?: string; // For MEETING_GUEST: which ScheduledMeeting they belong to
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  state: NPCState;
  speed: number;
  color: string;
  skinColor: string;
  size: number;
  restroomUrgency: number; // 0 to 1
  lastRestroomTime: number;
  currentRoomId?: string; // Synced from RoomRegistry — read-only outside engine
  targetRoomId?: string; // Room this NPC is walking toward
  leaveTime?: number; // Sim-time when NPC should leave current room
  arrivalTime?: number; // Sim-time when NPC should arrive at office (employees/guests)
  departureTime?: number; // Sim-time when NPC should leave office
  isExiting?: boolean; // Walking toward exit (will despawn on arrival)
  path: Point[];
}

export interface ScheduledMeeting {
  id: string; // unique meeting ID, e.g. "MTG-001"
  roomId: string;
  startTime: number; // sim minutes from midnight
  endTime: number; // sim minutes from midnight
  attendeeIds: string[]; // Employee NPC IDs assigned to this meeting
  guestIds?: string[]; // MEETING_GUEST NPC IDs (external visitors)
  hasGuests: boolean; // true if this meeting was scheduled with external guests
}

export type WorkOrderReason =
  | "THRESHOLD_REACHED" // reactive: usage hit cleaning threshold
  | "SCHEDULED_DAILY" // non-predictive: 5 PM daily cleaning
  | "PREDICTIVE_SURGE" // predictive: upcoming all-hands/meeting surge
  | "PREDICTIVE_ETA" // predictive: usage rate will breach threshold soon
  | "END_OF_DAY"; // office emptied — final sanitation pass before janitor leaves

export type WorkOrderPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface WorkOrder {
  id: string; // e.g. "WO-001" (unique across the run)
  dailyNumber: number; // sequential per-day (resets each new day)
  restroomId: string; // which restroom needs cleaning
  createdAt: number; // sim time when created
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  startedAt?: number; // sim time when IN_PROGRESS began
  completedAt?: number; // sim time when COMPLETED
  title: string; // short work summary, e.g. "Restroom cleaning"
  description: string; // longer human-readable work description
  reason: WorkOrderReason;
  reasonDetail: string; // plain-english reason (for tickets + event log)
  priority: WorkOrderPriority;
}

export interface RestroomStatus {
  roomId: string;
  usageCount: number; // ENTER events since last cleaning
  lastCleanedAt: number; // sim time of last clean completion
  isBeingCleaned: boolean; // true while janitor is cleaning
}

export interface RestroomPrediction {
  roomId: string;
  predictedThresholdTime: number | null; // sim-minutes when threshold will be hit
  suggestedCleanTime: number | null; // sim-minutes when janitor should be dispatched
  baseRate: number; // uses per sim-minute (rolling average)
  surgeExpected: boolean; // upcoming all-hands will cause a rush
  confidence: "low" | "medium" | "high";
}

export interface SimState {
  time: number; // minutes from midnight
  day: number;
  npcs: NPC[];
  rooms: Room[];
  meetings: ScheduledMeeting[]; // Daily fixed schedule (generated at day start)
  workOrders: WorkOrder[];
  restroomStatuses: RestroomStatus[];
  predictions: RestroomPrediction[];
  predictiveMode: boolean;
  speedMultiplier: number;
  preCleaningSpeed?: number; // speed to restore after cleaning slowdown
  isPaused?: boolean;
  isResetting: boolean;
  dailyScheduleDay?: number; // Which day the current schedule was generated for
  // End-of-day lifecycle: IDLE (normal), JANITOR_DISPATCHED (final cleaning
  // orders issued), JANITOR_WAVING (janitor at lobby waving goodbye),
  // JANITOR_LEAVING (janitor walking out), DONE (ready to reset).
  endOfDayPhase?: "IDLE" | "JANITOR_DISPATCHED" | "JANITOR_WAVING" | "JANITOR_LEAVING" | "DONE";
  endOfDayPhaseDay?: number; // Day the phase belongs to (resets each new day)
  waveEndTime?: number; // Sim-time when the goodbye wave ends
}

export type SimEvent = {
  type:
    | "ENTER"
    | "EXIT"
    | "WORK_ORDER_CREATED"
    | "CLEANING_STARTED"
    | "CLEANING_COMPLETED"
    | "OCCUPANCY_COUNT";
  restroomId: string; // also used for roomId/location ID
  npcId: string;
  timestamp: number;
  employeeCount?: number; // for OCCUPANCY_COUNT
  guestCount?: number; // for OCCUPANCY_COUNT
  // For WORK_ORDER_CREATED:
  workOrderId?: string;
  workOrderDailyNumber?: number;
  reason?: WorkOrderReason;
  reasonDetail?: string;
  priority?: WorkOrderPriority;
};
