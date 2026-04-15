import React from 'react';
import { WorkOrder, WorkOrderPriority } from '@/types/sim';
import { restroomLabel } from '@/simulation/workorder';

// ============================================================================
// CMMS WORK ORDER TICKET
//
// Visual design inspired by real CMMS systems (Maximo, UpKeep, Fiix, Limble,
// ServiceNow FSM). The anatomy of a service ticket in those systems:
//   - WO number + priority pill (color-coded)
//   - Short task title + location/asset subtitle
//   - Status pill (PENDING / IN PROGRESS / COMPLETED)
//   - Optional short description / reason
//   - Footer: created timestamp, assignee
//
// The card uses the project's brutalist aesthetic (white bg, thick slate
// border, offset drop shadow) so it reads as part of the UI and not a stock
// CMMS screenshot.
// ============================================================================

const PRIORITY_STYLES: Record<WorkOrderPriority, string> = {
  LOW: 'bg-slate-200 text-slate-700 border-slate-400',
  MEDIUM: 'bg-amber-100 text-amber-800 border-amber-500',
  HIGH: 'bg-orange-100 text-orange-800 border-orange-500',
  CRITICAL: 'bg-red-100 text-red-800 border-red-600',
};

const STATUS_STYLES: Record<WorkOrder['status'], string> = {
  PENDING: 'bg-yellow-300 text-yellow-900 border-yellow-600',
  IN_PROGRESS: 'bg-blue-300 text-blue-900 border-blue-600 animate-pulse',
  COMPLETED: 'bg-emerald-300 text-emerald-900 border-emerald-600',
};

function formatTime(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

interface Props {
  wo: WorkOrder;
  /** sim time — used to format footer timestamps */
  now: number;
  /** true while the ticket is animating in (just-created) */
  isNew?: boolean;
}

export const WorkOrderTicket: React.FC<Props> = ({ wo, isNew }) => {
  const idLabel = `WO-${wo.dailyNumber.toString().padStart(3, '0')}`;
  const statusLabel = wo.status.replace('_', ' ');

  return (
    <div
      className={[
        'w-[240px] bg-white border-2 border-slate-800 font-mono',
        'shadow-[3px_3px_0px_0px_rgba(30,41,59,1)]',
        isNew ? 'animate-in slide-in-from-bottom-2 fade-in duration-300' : '',
        wo.status === 'COMPLETED' ? 'opacity-70' : '',
      ].join(' ')}
    >
      {/* Header band — emulates the "WORK ORDER" form strip */}
      <div className="bg-slate-800 text-slate-100 px-2 py-0.5 flex items-center justify-between">
        <span className="text-[9px] tracking-[0.15em] font-bold">WORK ORDER</span>
        <span className="text-[9px] text-slate-400">CMMS</span>
      </div>

      {/* ID row with priority + status pills */}
      <div className="px-2 py-1.5 flex items-center justify-between border-b border-slate-300">
        <span className="text-sm font-bold text-slate-900">{idLabel}</span>
        <div className="flex items-center gap-1">
          <span className={`text-[8px] px-1.5 py-0.5 border font-bold tracking-wider ${PRIORITY_STYLES[wo.priority]}`}>
            {wo.priority}
          </span>
          <span className={`text-[8px] px-1.5 py-0.5 border font-bold tracking-wider ${STATUS_STYLES[wo.status]}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Body: title + location */}
      <div className="px-2 py-1.5 space-y-0.5">
        <div className="text-[11px] font-bold text-slate-900 leading-tight">{wo.title}</div>
        <div className="text-[10px] text-slate-600 flex items-center gap-1">
          <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor" className="inline-block">
            <path d="M4 0C1.79 0 0 1.79 0 4c0 3 4 6 4 6s4-3 4-6c0-2.21-1.79-4-4-4zm0 5.5A1.5 1.5 0 1 1 4 2.5a1.5 1.5 0 0 1 0 3z" />
          </svg>
          <span className="font-semibold">{restroomLabel(wo.restroomId)}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500">{wo.restroomId}</span>
        </div>
      </div>

      {/* Reason / description */}
      <div className="px-2 pb-1.5 text-[9px] leading-snug text-slate-700 border-t border-dashed border-slate-300 pt-1">
        <span className="text-slate-500 uppercase tracking-wider text-[7px]">Reason </span>
        {wo.reasonDetail}
      </div>

      {/* Footer — created, assignee */}
      <div className="bg-slate-100 border-t border-slate-300 px-2 py-1 flex items-center justify-between text-[9px] text-slate-600">
        <span>
          <span className="text-slate-400">OPENED</span> {formatTime(wo.createdAt)}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          JAN-01
        </span>
      </div>
    </div>
  );
};
