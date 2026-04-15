import { WorkOrder, WorkOrderReason, WorkOrderPriority, SimEvent } from '@/types/sim';

// ============================================================================
// WORK ORDER FACTORY
//
// Centralizes: sequential ID issuance (global + daily), human-readable copy
// (title/description/reasonDetail) and priority assignment. Both the reactive
// engine path and the predictive dispatcher use this so the event log and the
// CMMS ticket dialog stay in sync.
// ============================================================================

// Short labels for restroom IDs. Kept here (not imported from engine) to avoid
// a circular import between engine.ts and prediction.ts.
const RESTROOM_LABELS: Record<string, string> = {
  'REST-001': 'Restroom A',
  'REST-002': 'Restroom B',
};

function roomLabelFor(restroomId: string): string {
  return RESTROOM_LABELS[restroomId] ?? restroomId;
}

function fmt(t: number) {
  const h = Math.floor(t / 60), m = Math.floor(t % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

interface ReasonCtx {
  usageCount?: number;
  thresholdTime?: number | null;
  meetingTime?: number | null;
}

function buildCopy(
  restroomId: string,
  reason: WorkOrderReason,
  ctx: ReasonCtx,
): { title: string; description: string; reasonDetail: string; priority: WorkOrderPriority } {
  const loc = roomLabelFor(restroomId);
  switch (reason) {
    case 'THRESHOLD_REACHED':
      return {
        title: 'Restroom Sanitation',
        description: `Deep clean & restock ${loc}. Usage meter exceeded threshold (${ctx.usageCount ?? '?'} visits since last service).`,
        reasonDetail: `Usage threshold reached (${ctx.usageCount ?? '?'} visits)`,
        priority: 'HIGH',
      };
    case 'SCHEDULED_DAILY':
      return {
        title: 'End-of-Day Cleaning',
        description: `Scheduled end-of-day sanitation pass for ${loc}. Standard route on daily CMMS calendar.`,
        reasonDetail: 'Scheduled end-of-day cleaning (5:00 PM)',
        priority: 'MEDIUM',
      };
    case 'PREDICTIVE_SURGE':
      return {
        title: 'Pre-Surge Cleaning',
        description: `Pre-emptive sanitation of ${loc} ahead of forecasted restroom surge${ctx.meetingTime != null ? ` around ${fmt(ctx.meetingTime)}` : ''}. Dispatching now while occupancy is low.`,
        reasonDetail: `Sensor forecast: surge expected${ctx.meetingTime != null ? ` at ${fmt(ctx.meetingTime)}` : ''}`,
        priority: 'HIGH',
      };
    case 'PREDICTIVE_ETA':
      return {
        title: 'Preventive Sanitation',
        description: `Sensor trend forecasts ${loc} will reach the cleaning threshold${ctx.thresholdTime != null ? ` at ${fmt(ctx.thresholdTime)}` : ' soon'}. Dispatching janitor early to avoid a service gap.`,
        reasonDetail: `Predicted threshold ETA${ctx.thresholdTime != null ? ` ${fmt(ctx.thresholdTime)}` : ''}`,
        priority: 'MEDIUM',
      };
    case 'END_OF_DAY':
      return {
        title: 'End-of-Day Closeout',
        description: `Final sanitation of ${loc} after the office has emptied. Janitor locks up after both restrooms are serviced.`,
        reasonDetail: 'Office closed — final sanitation pass',
        priority: 'MEDIUM',
      };
  }
}

let globalCounter = 0;
let dailyCounter = 0;
let dailyCounterDay = -1;

export function createWorkOrder(
  restroomId: string,
  reason: WorkOrderReason,
  createdAt: number,
  day: number,
  ctx: ReasonCtx = {},
): WorkOrder {
  if (day !== dailyCounterDay) {
    dailyCounter = 0;
    dailyCounterDay = day;
  }
  const dailyNumber = ++dailyCounter;
  const globalId = ++globalCounter;
  const copy = buildCopy(restroomId, reason, ctx);
  return {
    id: `WO-${globalId}`,
    dailyNumber,
    restroomId,
    createdAt,
    status: 'PENDING',
    title: copy.title,
    description: copy.description,
    reason,
    reasonDetail: copy.reasonDetail,
    priority: copy.priority,
  };
}

export function resetWorkOrderDailyCounter(day: number) {
  dailyCounter = 0;
  dailyCounterDay = day;
}

export function emitWorkOrderCreated(events: SimEvent[], wo: WorkOrder, timestamp: number) {
  events.push({
    type: 'WORK_ORDER_CREATED',
    restroomId: wo.restroomId,
    npcId: 'JAN-01',
    timestamp,
    workOrderId: wo.id,
    workOrderDailyNumber: wo.dailyNumber,
    reason: wo.reason,
    reasonDetail: wo.reasonDetail,
    priority: wo.priority,
  });
}

export function formatDailyWorkOrderId(dailyNumber: number): string {
  return `WO-${dailyNumber.toString().padStart(3, '0')}`;
}

export function restroomLabel(restroomId: string): string {
  return roomLabelFor(restroomId);
}
