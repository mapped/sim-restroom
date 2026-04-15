// Copyright 2026 Mapped Inc.
// SPDX-License-Identifier: MIT
// See LICENSE at the repository root for full license text.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, FastForward, List, ShieldCheck } from "lucide-react";
import { WorkOrder } from "@/types/sim";
import { WorkOrderTicket } from "@/components/Simulator/WorkOrderTicket";

interface ControlsProps {
  speed: number;
  predictiveMode: boolean;
  onSetSpeed: (speed: number) => void;
  onSkipToAllHands: () => void;
  onTogglePredictive: (enabled: boolean) => void;
  events: any[];
  workOrders: WorkOrder[];
  simTime: number;
}

const SPEED_OPTIONS = [
  { label: "Real Time", value: 1 },
  { label: "Fast (1m/s)", value: 60 },
  { label: "Lightning (5m/s)", value: 300 },
];

const EVENT_BADGE_STYLES: Record<string, string> = {
  ENTER: "border-green-500 text-green-400",
  EXIT: "border-red-500 text-red-400",
  WORK_ORDER_CREATED: "border-yellow-500 text-yellow-400",
  CLEANING_STARTED: "border-orange-500 text-orange-400",
  CLEANING_COMPLETED: "border-emerald-500 text-emerald-400",
  OCCUPANCY_COUNT: "border-blue-500 text-blue-400",
};

const EVENT_FILTERS: { key: string; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ENTER", label: "Enter" },
  { key: "EXIT", label: "Exit" },
  { key: "WORK_ORDER_CREATED", label: "Work Order" },
  { key: "CLEANING_STARTED", label: "Cleaning" },
  { key: "CLEANING_COMPLETED", label: "Done" },
  { key: "OCCUPANCY_COUNT", label: "Occupancy" },
];

export const Controls: React.FC<ControlsProps> = ({
  speed,
  predictiveMode,
  onSetSpeed,
  onSkipToAllHands,
  onTogglePredictive,
  events,
  workOrders,
  simTime,
}) => {
  // Hover state for WORK_ORDER_CREATED rows — reveals the CMMS ticket popup
  const [hoveredWO, setHoveredWO] = useState<{ wo: WorkOrder; x: number; y: number } | null>(null);
  const woById = useMemo(() => {
    const map = new Map<string, WorkOrder>();
    for (const wo of workOrders) map.set(wo.id, wo);
    return map;
  }, [workOrders]);
  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  const [filter, setFilter] = useState<string>("ALL");
  const filteredEvents = useMemo(
    () => (filter === "ALL" ? events : events.filter((e) => e.type === filter)),
    [events, filter]
  );

  // Newest-first, cap history at 200 for scroll performance
  const visible = useMemo(() => filteredEvents.slice(-200).reverse(), [filteredEvents]);

  // Scroll lock: when user scrolls away from the top (newest), suppress the
  // automatic snap-back so they can keep reading older events. When they scroll
  // back to the top, follow-mode re-engages and new events appear normally.
  const logRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);
  const [followMode, setFollowMode] = useState(true);
  const followModeRef = useRef(followMode);
  useEffect(() => {
    followModeRef.current = followMode;
  }, [followMode]);

  useLayoutEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const prev = prevScrollHeightRef.current;
    const next = el.scrollHeight;
    const delta = next - prev;
    if (!followModeRef.current && delta > 0 && el.scrollTop > 0) {
      // Preserve viewing position: newest items added at top push content down;
      // compensate so the user keeps seeing the same row.
      el.scrollTop += delta;
    }
    prevScrollHeightRef.current = next;
  }, [visible]);

  const handleScroll = () => {
    const el = logRef.current;
    if (!el) return;
    const atTop = el.scrollTop <= 2;
    setFollowMode(atTop);
  };

  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Settings */}
      <Card className="bg-white border-2 border-slate-800 shadow-[4px_4px_0px_0px_rgba(30,41,59,1)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <Zap className="w-4 h-4" /> SIMULATION CONTROLS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Speed */}
          <div className="space-y-2 px-2">
            <div className="flex justify-between items-center">
              <span className="font-mono text-sm font-bold flex items-center gap-2">
                <Zap className="w-3 h-3" /> SIM SPEED
              </span>
              <span className="font-mono text-xs font-bold text-blue-600">
                {SPEED_OPTIONS.find((o) => o.value === speed)?.label || `${speed}x`}
              </span>
            </div>
            <div className="flex gap-2">
              {SPEED_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={speed === opt.value ? "default" : "outline"}
                  size="sm"
                  className="flex-1 font-mono text-[10px]"
                  onClick={() => onSetSpeed(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Cleaning mode */}
          <div className="space-y-2 px-2">
            <div className="flex justify-between items-center">
              <span className="font-mono text-sm font-bold flex items-center gap-2">
                <ShieldCheck className="w-3 h-3" /> CLEANING MODE
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant={predictiveMode ? "default" : "outline"}
                size="sm"
                className="flex-1 font-mono text-[10px]"
                onClick={() => onTogglePredictive(true)}
              >
                PREDICTIVE
              </Button>
              <Button
                variant={!predictiveMode ? "default" : "outline"}
                size="sm"
                className="flex-1 font-mono text-[10px]"
                onClick={() => onTogglePredictive(false)}
              >
                SCHEDULED (5 PM)
              </Button>
            </div>
          </div>

          {/* Skip to all-hands */}
          <div className="px-2 pt-2">
            <Button
              variant="outline"
              className="w-full border-2 border-slate-800 font-mono shadow-[2px_2px_0px_0px_rgba(30,41,59,1)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
              onClick={onSkipToAllHands}
            >
              <FastForward className="w-4 h-4 mr-2" /> SKIP TO ALL-HANDS
            </Button>
          </div>

          {/* Keyboard shortcut hints */}
          <div className="px-2 pt-1">
            <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">
              Shortcuts
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-slate-600">
              <span>
                <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-300 rounded text-[9px]">
                  Space
                </kbd>{" "}
                pause / resume
              </span>
              <span>
                <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-300 rounded text-[9px]">
                  A
                </kbd>{" "}
                jump to meeting
              </span>
              <span>
                <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-300 rounded text-[9px]">
                  S
                </kbd>{" "}
                cycle speed
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Event Log */}
      <Card className="bg-slate-900 border-2 border-slate-800 text-slate-100 shadow-[4px_4px_0px_0px_rgba(30,41,59,1)]">
        <CardHeader className="pb-2 border-b border-slate-800">
          <CardTitle className="text-xs font-mono flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <List className="w-3 h-3" /> EVENT LOG
            </span>
            {!followMode && (
              <button
                className="text-[9px] font-mono bg-yellow-500 text-black px-2 py-0.5 rounded hover:bg-yellow-400"
                onClick={() => {
                  const el = logRef.current;
                  if (el) el.scrollTop = 0;
                  setFollowMode(true);
                }}
                title="Resume follow mode"
              >
                PAUSED · JUMP TO TOP
              </button>
            )}
          </CardTitle>
          {/* Filter chips */}
          <div className="flex flex-wrap gap-1 pt-2">
            {EVENT_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                  filter === f.key
                    ? "bg-blue-500 border-blue-400 text-white"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div
            ref={logRef}
            onScroll={handleScroll}
            className="h-[250px] overflow-y-auto font-mono text-[10px] p-4 space-y-2"
          >
            {visible.length === 0 && (
              <div className="text-slate-500 italic">Waiting for events...</div>
            )}
            {visible.map((e, i) => {
              const isWO = e.type === "WORK_ORDER_CREATED";
              const wo = isWO && e.workOrderId ? woById.get(e.workOrderId) : null;
              return (
                <div
                  key={`${e.timestamp}-${i}-${e.type}`}
                  className={[
                    "flex items-center gap-2 border-b border-slate-800/50 pb-1",
                    isWO && wo ? "cursor-pointer hover:bg-slate-800/60 rounded px-1 -mx-1" : "",
                  ].join(" ")}
                  onMouseEnter={
                    isWO && wo
                      ? (ev) => {
                          const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                          setHoveredWO({ wo, x: rect.left, y: rect.top });
                        }
                      : undefined
                  }
                  onMouseLeave={isWO && wo ? () => setHoveredWO(null) : undefined}
                >
                  <span className="text-slate-500">[{formatTime(e.timestamp)}]</span>
                  <Badge
                    variant="outline"
                    className={`text-[8px] py-0 h-4 ${EVENT_BADGE_STYLES[e.type] || "border-slate-500 text-slate-400"}`}
                  >
                    {e.type.replace(/_/g, " ")}
                  </Badge>
                  {e.type === "OCCUPANCY_COUNT" ? (
                    <span className="text-slate-300 ml-auto">
                      EMP:{e.employeeCount} · GST:{e.guestCount}
                    </span>
                  ) : isWO ? (
                    <>
                      <span className="text-yellow-300 font-bold">
                        WO-{String(e.workOrderDailyNumber ?? 0).padStart(3, "0")}
                      </span>
                      <span className="text-blue-400">{e.restroomId}</span>
                      <span className="text-slate-400 truncate ml-auto" title={e.reasonDetail}>
                        {e.reasonDetail}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-300 truncate max-w-[60px]">{e.npcId}</span>
                      <span className="text-blue-400 ml-auto">{e.restroomId}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Hovering a WORK_ORDER_CREATED row reveals the same CMMS ticket card
          that floats above the janitor closet. Positioned in viewport space. */}
      {hoveredWO && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: Math.min(hoveredWO.x + 20, window.innerWidth - 260),
            top: Math.max(8, hoveredWO.y - 100),
          }}
        >
          <WorkOrderTicket wo={hoveredWO.wo} now={simTime} />
        </div>
      )}
    </div>
  );
};
