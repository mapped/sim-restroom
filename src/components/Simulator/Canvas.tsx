// Copyright 2026 Mapped Inc.
// SPDX-License-Identifier: MIT
// See LICENSE at the repository root for full license text.

import React, { useEffect, useRef, useMemo, useState, useCallback } from "react";
import {
  SimState,
  Room,
  RoomType,
  NPC,
  RestroomStatus,
  RestroomPrediction,
  ScheduledMeeting,
  WorkOrder,
} from "@/types/sim";
import { JANITORIAL_RULES } from "@/simulation/engine";
import { WorkOrderTicket } from "@/components/Simulator/WorkOrderTicket";

interface RendererProps {
  state: SimState;
}

// Short formatter for "1h 23m" / "23m" / "45s"
function formatCountdown(mins: number): string {
  if (mins <= 0) return "0m";
  if (mins < 1) return `${Math.max(1, Math.round(mins * 60))}s`;
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

const TILE_WIDTH = 48;
const TILE_HEIGHT = 24;
const WALL_HEIGHT = 32;
const PADDING = 40;

function project(x: number, y: number) {
  return {
    px: (x - y) * (TILE_WIDTH / 2),
    py: (x + y) * (TILE_HEIGHT / 2),
  };
}

// Compute the bounding box of all rooms in projected (isometric) space.
// This runs once since room positions never change.
function computeViewBounds(rooms: Room[]) {
  let minPx = Infinity,
    maxPx = -Infinity;
  let minPy = Infinity,
    maxPy = -Infinity;

  for (const room of rooms) {
    const corners = [
      project(room.x, room.y),
      project(room.x + room.width, room.y),
      project(room.x + room.width, room.y + room.height),
      project(room.x, room.y + room.height),
    ];
    for (const { px, py } of corners) {
      minPx = Math.min(minPx, px - 30); // extra for NPC sprites / furniture overhang
      maxPx = Math.max(maxPx, px + 30);
      minPy = Math.min(minPy, py - WALL_HEIGHT - 25); // walls + labels above
      maxPy = Math.max(maxPy, py + 30); // NPC shadows / furniture below
    }
  }

  return { minPx, maxPx, minPy, maxPy };
}

export const IsometricRenderer: React.FC<RendererProps> = ({ state }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(1200);
  const [hover, setHover] = useState<{ roomId: string; sx: number; sy: number } | null>(null);

  // Compute projected bounds once (rooms don't move)
  const bounds = useMemo(() => computeViewBounds(state.rooms), [state.rooms]);
  const contentWidth = bounds.maxPx - bounds.minPx + PADDING * 2;
  const contentHeight = bounds.maxPy - bounds.minPy + PADDING * 2;

  // Projection params — kept in sync with the draw() transform so HTML
  // overlays can position themselves over world-space coordinates.
  const proj = useMemo(() => {
    const scale = Math.min(canvasWidth / contentWidth, contentHeight > 0 ? 1 : 1, 1);
    const scaledWidth = contentWidth * scale;
    const scaledHeight = contentHeight * scale;
    const offsetX = (canvasWidth - scaledWidth) / 2;
    const offsetY = (contentHeight - scaledHeight) / 2;
    const transX = PADDING - bounds.minPx;
    const transY = PADDING - bounds.minPy;
    return { scale, offsetX, offsetY, transX, transY };
  }, [canvasWidth, contentWidth, contentHeight, bounds]);

  const worldToScreen = useCallback(
    (wx: number, wy: number) => {
      const { px, py } = project(wx, wy);
      return {
        sx: (px + proj.transX) * proj.scale + proj.offsetX,
        sy: (py + proj.transY) * proj.scale + proj.offsetY,
      };
    },
    [proj]
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const px = (sx - proj.offsetX) / proj.scale - proj.transX;
      const py = (sy - proj.offsetY) / proj.scale - proj.transY;
      // Invert project(): px = (x-y)*TW/2, py = (x+y)*TH/2
      return {
        x: px / TILE_WIDTH + py / TILE_HEIGHT,
        y: py / TILE_HEIGHT - px / TILE_WIDTH,
      };
    },
    [proj]
  );

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    // Scale to fit: if the canvas is narrower than the content, scale down uniformly
    const scaleX = canvas.width / contentWidth;
    const scaleY = canvas.height / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1); // never scale up, only down

    // Center the scaled content
    const scaledWidth = contentWidth * scale;
    const scaledHeight = contentHeight * scale;
    const offsetX = (canvas.width - scaledWidth) / 2;
    const offsetY = (canvas.height - scaledHeight) / 2;

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Translate so that bounds.minPx/minPy map to (PADDING, PADDING)
    ctx.translate(PADDING - bounds.minPx, PADDING - bounds.minPy);

    // Draw Rooms
    state.rooms.forEach((room) => {
      const p1 = project(room.x, room.y);
      const p2 = project(room.x + room.width, room.y);
      const p3 = project(room.x + room.width, room.y + room.height);
      const p4 = project(room.x, room.y + room.height);

      let baseColor = "#ffffff";
      let floorPattern: "carpet" | "wood" | "tile" | "plain" = "plain";

      switch (room.type) {
        case RoomType.AUDITORIUM:
          baseColor = "#334155";
          floorPattern = "carpet";
          break;
        case RoomType.CAFETERIA:
          baseColor = "#fef3c7";
          floorPattern = "tile";
          break;
        case RoomType.RESTROOM_GN:
          baseColor = "#f1f5f9";
          floorPattern = "tile";
          break;
        case RoomType.RESTROOM_FAM:
          baseColor = "#eff6ff";
          floorPattern = "tile";
          break;
        case RoomType.DESK:
          baseColor = "#ffffff";
          floorPattern = "wood";
          break;
        case RoomType.MEETING_ROOM:
          baseColor = "#faf5ff";
          floorPattern = "carpet";
          break;
        case RoomType.BREAK_AREA:
          baseColor = "#fff7ed";
          floorPattern = "wood";
          break;
        case RoomType.JANITOR_CLOSET:
          baseColor = "#e2e8f0";
          floorPattern = "plain";
          break;
        case RoomType.LOBBY:
          baseColor = "#dbeafe"; // light blue entrance
          floorPattern = "tile";
          break;
      }

      // Restroom being cleaned — pulsing red-to-white
      const restroomStatus = state.restroomStatuses?.find((s) => s.roomId === room.id);
      if (restroomStatus?.isBeingCleaned) {
        const pulse = (Math.sin(Date.now() / 400) + 1) / 2; // 0..1 oscillation
        const alpha = 0.15 + pulse * 0.25; // pulses between 0.15 and 0.40
        baseColor = `rgba(239, 68, 68, ${alpha})`;
      }

      if (room.flashColor && room.flashTimer! > 0) {
        const alpha = (room.flashTimer! / 1000) * 0.5;
        baseColor =
          room.flashColor === "green"
            ? `rgba(34, 197, 94, ${alpha})`
            : `rgba(239, 68, 68, ${alpha})`;
      }

      // Floor
      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
      ctx.lineTo(p3.px, p3.py);
      ctx.lineTo(p4.px, p4.py);
      ctx.closePath();
      ctx.fillStyle = baseColor;
      ctx.fill();

      // Floor patterns
      if (floorPattern !== "plain" && (!room.flashColor || room.flashTimer === 0)) {
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = "rgba(0,0,0,0.05)";
        ctx.lineWidth = 0.5;

        if (floorPattern === "tile") {
          for (let ix = 0; ix <= room.width; ix += 0.5) {
            const start = project(room.x + ix, room.y);
            const end = project(room.x + ix, room.y + room.height);
            ctx.beginPath();
            ctx.moveTo(start.px, start.py);
            ctx.lineTo(end.px, end.py);
            ctx.stroke();
          }
          for (let iy = 0; iy <= room.height; iy += 0.5) {
            const start = project(room.x, room.y + iy);
            const end = project(room.x + room.width, room.y + iy);
            ctx.beginPath();
            ctx.moveTo(start.px, start.py);
            ctx.lineTo(end.px, end.py);
            ctx.stroke();
          }
        } else if (floorPattern === "wood") {
          ctx.strokeStyle = "rgba(139, 69, 19, 0.1)";
          for (let ix = 0; ix <= room.width; ix += 0.2) {
            const start = project(room.x + ix, room.y);
            const end = project(room.x + ix, room.y + room.height);
            ctx.beginPath();
            ctx.moveTo(start.px, start.py);
            ctx.lineTo(end.px, end.py);
            ctx.stroke();
          }
        } else if (floorPattern === "carpet") {
          ctx.fillStyle = "rgba(0,0,0,0.03)";
          for (let i = 0; i < 100; i++) {
            const rx = room.x + Math.random() * room.width;
            const ry = room.y + Math.random() * room.height;
            const rp = project(rx, ry);
            ctx.fillRect(rp.px, rp.py, 1, 1);
          }
        }
        ctx.restore();
      }

      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Left wall
      const gradL = ctx.createLinearGradient(p1.px, p1.py - WALL_HEIGHT, p4.px, p4.py);
      gradL.addColorStop(0, "#94a3b8");
      gradL.addColorStop(1, "#475569");
      ctx.fillStyle = gradL;
      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p1.px, p1.py - WALL_HEIGHT);
      ctx.lineTo(p4.px, p4.py - WALL_HEIGHT);
      ctx.lineTo(p4.px, p4.py);
      ctx.fill();

      // Right wall
      const gradR = ctx.createLinearGradient(p4.px, p4.py - WALL_HEIGHT, p3.px, p3.py);
      gradR.addColorStop(0, "#64748b");
      gradR.addColorStop(1, "#334155");
      ctx.fillStyle = gradR;
      ctx.beginPath();
      ctx.moveTo(p4.px, p4.py);
      ctx.lineTo(p4.px, p4.py - WALL_HEIGHT);
      ctx.lineTo(p3.px, p3.py - WALL_HEIGHT);
      ctx.lineTo(p3.px, p3.py);
      ctx.fill();

      // Top of walls
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py - WALL_HEIGHT);
      ctx.lineTo(p2.px, p2.py - WALL_HEIGHT);
      ctx.lineTo(p3.px, p3.py - WALL_HEIGHT);
      ctx.lineTo(p4.px, p4.py - WALL_HEIGHT);
      ctx.fill();

      // Restroom fixtures
      if (room.type === RoomType.RESTROOM_GN) {
        for (let i = 0; i < 5; i++) {
          const sp = project(room.x + 0.2 + i * 0.7, room.y + 0.2);
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.ellipse(sp.px, sp.py + 8, 4, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillRect(sp.px - 4, sp.py + 2, 8, 4);
        }
        for (let i = 0; i < 3; i++) {
          const sp = project(room.x + 0.5 + i * 1.2, room.y + room.height - 0.5);
          ctx.fillStyle = "#f8fafc";
          ctx.beginPath();
          ctx.ellipse(sp.px, sp.py + 6, 8, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#94a3b8";
          ctx.stroke();
          ctx.fillStyle = "#64748b";
          ctx.fillRect(sp.px - 1, sp.py + 1, 2, 4);
        }
      }

      // Desk furniture
      if (room.type === RoomType.DESK) {
        const cp = project(room.x + 1, room.y + 0.5);
        ctx.fillStyle = "#78350f";
        ctx.fillRect(cp.px - 14, cp.py + 6, 28, 8);
        ctx.strokeStyle = "#451a03";
        ctx.strokeRect(cp.px - 14, cp.py + 6, 28, 8);
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(cp.px - 8, cp.py + 2, 16, 6);
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(cp.px - 6, cp.py + 10, 12, 2);
      }

      // Cafeteria furniture
      if (room.type === RoomType.CAFETERIA) {
        for (let i = 0; i < 4; i++) {
          const tp = project(room.x + 1 + (i % 2) * 4, room.y + 1 + Math.floor(i / 2) * 4);
          ctx.fillStyle = "#b45309";
          ctx.beginPath();
          ctx.ellipse(tp.px, tp.py + 12, 18, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#78350f";
          ctx.stroke();
          for (let j = 0; j < 4; j++) {
            const angle = (j * Math.PI) / 2;
            ctx.fillStyle = "#475569";
            ctx.beginPath();
            ctx.arc(
              tp.px + Math.cos(angle) * 22,
              tp.py + 12 + Math.sin(angle) * 12,
              4,
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
        }
      }

      // Break area furniture
      if (room.type === RoomType.BREAK_AREA) {
        const rp = project(room.x + 2, room.y + 2);
        ctx.fillStyle = "#991b1b";
        ctx.beginPath();
        ctx.ellipse(rp.px, rp.py + 15, 40, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        const pp = project(room.x + 0.5, room.y + 0.5);
        ctx.fillStyle = "#065f46";
        ctx.beginPath();
        ctx.arc(pp.px, pp.py + 5, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#78350f";
        ctx.fillRect(pp.px - 3, pp.py + 10, 6, 6);
      }

      // Labels
      if (room.label && room.type !== RoomType.DESK) {
        ctx.save();
        const center = project(room.x + room.width / 2, room.y + room.height / 2);
        ctx.translate(center.px, center.py - WALL_HEIGHT - 10);

        ctx.font = 'bold 14px "Inter", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const textWidth = ctx.measureText(room.label.toUpperCase()).width;
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fillRect(-textWidth / 2 - 4, -10, textWidth + 8, 20);

        ctx.fillStyle = "#1e293b";
        ctx.fillText(room.label.toUpperCase(), 0, 0);

        // Meeting room countdown (black → next meeting; green → current ends in)
        if (room.type === RoomType.MEETING_ROOM) {
          const roomMeetings = state.meetings.filter((m) => m.roomId === room.id);
          const active = roomMeetings.find(
            (m) => state.time >= m.startTime && state.time < m.endTime
          );
          const next = !active
            ? roomMeetings
                .filter((m) => m.startTime > state.time)
                .sort((a, b) => a.startTime - b.startTime)[0]
            : null;

          let cdText: string | null = null;
          let cdColor = "#0f172a";
          if (active) {
            cdText = `Ends in ${formatCountdown(active.endTime - state.time)}`;
            cdColor = "#15803d"; // green-700
          } else if (next) {
            cdText = `Next in ${formatCountdown(next.startTime - state.time)}`;
            cdColor = "#0f172a"; // slate-900 (black-ish)
          }

          if (cdText) {
            ctx.font = 'bold 10px "Inter", sans-serif';
            const cdWidth = ctx.measureText(cdText).width;
            ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
            ctx.fillRect(-cdWidth / 2 - 3, 8, cdWidth + 6, 14);
            ctx.fillStyle = cdColor;
            ctx.fillText(cdText, 0, 15);
          }
        }

        // Prediction ETA for restrooms
        const prediction = state.predictions?.find((p) => p.roomId === room.id);
        if (prediction?.predictedThresholdTime && !restroomStatus?.isBeingCleaned) {
          const etaMins = prediction.predictedThresholdTime - state.time;
          const etaH = Math.floor(prediction.predictedThresholdTime / 60);
          const etaM = Math.floor(prediction.predictedThresholdTime % 60);
          const ampm = etaH >= 12 ? "PM" : "AM";
          const displayH = etaH % 12 || 12;
          const etaStr = `ETA ${displayH}:${etaM.toString().padStart(2, "0")} ${ampm}`;

          ctx.font = 'bold 10px "Inter", sans-serif';
          const etaWidth = ctx.measureText(etaStr).width;

          // Color by urgency
          let etaColor = "#16a34a"; // green: > 30 min
          if (etaMins <= 10)
            etaColor = "#dc2626"; // red: < 10 min
          else if (etaMins <= 30) etaColor = "#ca8a04"; // yellow: 10-30 min

          ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
          ctx.fillRect(-etaWidth / 2 - 3, 8, etaWidth + 6, 14);
          ctx.fillStyle = etaColor;
          ctx.fillText(etaStr, 0, 15);

          // Surge warning
          if (prediction.surgeExpected) {
            ctx.fillStyle = "#f97316";
            ctx.font = 'bold 8px "Inter", sans-serif';
            ctx.fillText("SURGE", 0, 27);
          }
        }

        ctx.restore();
      }

      // Sad face emoji when restroom is dirty (usage >= dirtyThreshold, not being cleaned)
      if (
        restroomStatus &&
        restroomStatus.usageCount >= JANITORIAL_RULES.dirtyThreshold &&
        !restroomStatus.isBeingCleaned
      ) {
        const center = project(room.x + room.width / 2, room.y + room.height / 2);
        ctx.save();
        ctx.font = "28px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("\u{1F61E}", center.px, center.py);
        ctx.restore();
      }
    });

    // Draw NPCs
    state.npcs.forEach((npc) => {
      // Skip NPCs not in the building
      if (npc.state === "AWAY") return;

      const { px, py } = project(npc.x, npc.y);
      const h = 24 * npc.size;
      const w = 12 * npc.size;
      const isJanitor = npc.npcType === "JANITOR";
      const isGuest = npc.npcType === "GUEST";
      const isMeetingGuest = npc.npcType === "MEETING_GUEST";

      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(px, py + TILE_HEIGHT / 2, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = npc.color;
      ctx.beginPath();
      ctx.roundRect(px - w / 2, py + TILE_HEIGHT / 2 - h, w, h * 0.75, 4);
      ctx.fill();

      // Janitor: white stripe on body (apron look)
      if (isJanitor) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(px - w / 4, py + TILE_HEIGHT / 2 - h + 4, w / 2, h * 0.5);
      }

      // Guest: yellow badge on chest
      if (isGuest) {
        ctx.fillStyle = "#facc15";
        ctx.fillRect(px - w / 3, py + TILE_HEIGHT / 2 - h + 6, (w * 2) / 3, 5);
        ctx.strokeStyle = "#713f12";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px - w / 3, py + TILE_HEIGHT / 2 - h + 6, (w * 2) / 3, 5);
      }

      // Meeting Guest: badge collar line at neckline
      if (isMeetingGuest) {
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px - w / 2, py + TILE_HEIGHT / 2 - h);
        ctx.lineTo(px + w / 2, py + TILE_HEIGHT / 2 - h);
        ctx.stroke();
      }

      // Head
      ctx.fillStyle = npc.skinColor;
      ctx.beginPath();
      ctx.arc(px, py + TILE_HEIGHT / 2 - h - w / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();

      // Janitor: hat
      if (isJanitor) {
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(px - w / 2 - 1, py + TILE_HEIGHT / 2 - h - w / 2 - w / 2 - 2, w + 2, 4);
      }

      // Meeting Guest: visitor lanyard and diamond badge
      if (isMeetingGuest) {
        const neckX = px;
        const neckY = py + TILE_HEIGHT / 2 - h - w / 2 + w / 2; // bottom of head
        // Lanyard cord
        ctx.strokeStyle = "#374151";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(neckX, neckY);
        ctx.lineTo(neckX, neckY + 6);
        ctx.stroke();
        // Diamond badge
        ctx.fillStyle = npc.color;
        ctx.strokeStyle = "#1f2937";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(neckX, neckY + 6); // top
        ctx.lineTo(neckX + 3, neckY + 9); // right
        ctx.lineTo(neckX, neckY + 12); // bottom
        ctx.lineTo(neckX - 3, neckY + 9); // left
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Eyes
      ctx.fillStyle = "#000000";
      const eyeOffset = npc.targetX > npc.x ? 2 : -2;
      ctx.beginPath();
      ctx.arc(px + eyeOffset - 2, py + TILE_HEIGHT / 2 - h - w / 2, 1, 0, Math.PI * 2);
      ctx.arc(px + eyeOffset + 2, py + TILE_HEIGHT / 2 - h - w / 2, 1, 0, Math.PI * 2);
      ctx.fill();

      // Urgency indicator (employees only, not janitors or meeting guests)
      if (!isJanitor && !isMeetingGuest && npc.restroomUrgency > 0.5) {
        const pulse = Math.sin(Date.now() / 150) * 3;
        ctx.fillStyle = npc.restroomUrgency > 0.8 ? "#ef4444" : "#f59e0b";
        ctx.beginPath();
        ctx.arc(px + w / 2 + 6, py + TILE_HEIGHT / 2 - h - w - pulse, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Cleaning indicator (janitor working)
      if (isJanitor && npc.state === "CLEANING") {
        const pulse = Math.sin(Date.now() / 200) * 2;
        ctx.font = "14px serif";
        ctx.textAlign = "center";
        ctx.fillText("\u{1F9F9}", px + w / 2 + 8, py + TILE_HEIGHT / 2 - h - w / 2 + pulse); // broom emoji
      }

      // Waving goodbye (janitor at the end of the day)
      if (isJanitor && npc.state === "WAVING") {
        const wiggle = Math.sin(Date.now() / 120) * 5;
        const headY = py + TILE_HEIGHT / 2 - h - w / 2;

        // Waving hand — emoji, offset toward the wave side
        ctx.save();
        ctx.font = "18px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("\u{1F44B}", px + w / 2 + 8 + wiggle * 0.5, headY - 2);
        ctx.restore();

        // Cute speech bubble: "Bye!"
        const bubbleText = "Bye!";
        ctx.save();
        ctx.font = "bold 10px system-ui, sans-serif";
        const metrics = ctx.measureText(bubbleText);
        const padX = 6,
          padY = 3;
        const bw = metrics.width + padX * 2;
        const bh = 14 + padY;
        const bx = px - bw / 2;
        const by = headY - w / 2 - bh - 8;

        // Bubble body
        ctx.fillStyle = "white";
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if ((ctx as any).roundRect) {
          (ctx as any).roundRect(bx, by, bw, bh, 6);
        } else {
          ctx.rect(bx, by, bw, bh);
        }
        ctx.fill();
        ctx.stroke();

        // Tail
        ctx.beginPath();
        ctx.moveTo(px - 3, by + bh);
        ctx.lineTo(px, by + bh + 5);
        ctx.lineTo(px + 3, by + bh);
        ctx.closePath();
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.strokeStyle = "#1e293b";
        ctx.stroke();
        // Cover the tail's top border with white
        ctx.beginPath();
        ctx.strokeStyle = "white";
        ctx.moveTo(px - 3, by + bh);
        ctx.lineTo(px + 3, by + bh);
        ctx.stroke();

        // Text
        ctx.fillStyle = "#1e293b";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(bubbleText, px, by + bh / 2);

        // Sparkles around janitor for cuteness
        const t = Date.now() / 300;
        ctx.fillStyle = "#fbbf24";
        for (let s = 0; s < 3; s++) {
          const ang = t + s * ((Math.PI * 2) / 3);
          const sx = px + Math.cos(ang) * 18;
          const sy = headY + Math.sin(ang) * 10;
          ctx.font = "10px serif";
          ctx.fillText("\u2728", sx, sy);
        }
        ctx.restore();
      }
    });

    ctx.restore();
  };

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        const w = canvasRef.current.parentElement?.clientWidth || 1200;
        canvasRef.current.width = w;
        canvasRef.current.height = Math.round(contentHeight);
        setCanvasWidth(w);
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [contentHeight]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // Map CSS px to internal canvas coords (width might be stretched by CSS).
      const sx = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const sy = ((e.clientY - rect.top) / rect.height) * canvas.height;
      const { x, y } = screenToWorld(sx, sy);
      const room = state.rooms.find(
        (r) =>
          r.type === RoomType.MEETING_ROOM &&
          x >= r.x &&
          x < r.x + r.width &&
          y >= r.y &&
          y < r.y + r.height
      );
      if (room) {
        setHover({ roomId: room.id, sx: e.clientX - rect.left, sy: e.clientY - rect.top });
      } else if (hover) {
        setHover(null);
      }
    },
    [screenToWorld, state.rooms, hover]
  );

  const handleMouseLeave = useCallback(() => setHover(null), []);

  useEffect(() => {
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [state]);

  // Janitor closet screen anchor — top-center used for stacking work order tickets
  const closet = state.rooms.find((r) => r.id === JANITORIAL_RULES.janitorClosetId);
  const closetAnchor = closet ? worldToScreen(closet.x + closet.width / 2, closet.y) : null;

  // Active + recently completed work orders, newest first
  const visibleOrders = state.workOrders
    .filter(
      (wo) =>
        wo.status !== "COMPLETED" || (wo.completedAt != null && state.time - wo.completedAt < 2)
    )
    .slice(-4)
    .reverse();

  const hoveredRoom = hover ? state.rooms.find((r) => r.id === hover.roomId) : null;
  const hoveredMeetings = hover
    ? state.meetings
        .filter((m) => m.roomId === hover.roomId && m.endTime > state.time)
        .sort((a, b) => a.startTime - b.startTime)
    : [];

  return (
    <div ref={containerRef} className="w-full relative">
      <canvas
        ref={canvasRef}
        className="w-full image-pixelated"
        style={{ height: contentHeight }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />

      {/* Meeting room hover tooltip — today's schedule for that room */}
      {hover && hoveredRoom && (
        <MeetingTooltip
          anchorX={hover.sx}
          anchorY={hover.sy}
          roomLabel={(hoveredRoom.label || "").split(" (")[0].split(" [")[0]}
          meetings={hoveredMeetings}
          currentTime={state.time}
        />
      )}

      {/* CMMS work order tickets stacked above the janitor closet */}
      {closetAnchor && visibleOrders.length > 0 && (
        <div
          className="absolute pointer-events-none flex flex-col-reverse gap-1.5"
          style={{
            // Anchor the stack just above the closet and extend rightward.
            // The closet sits in the far-left corner of the isometric view,
            // so centering would push tickets off-screen.
            left: closetAnchor.sx - 10,
            top: closetAnchor.sy - 12,
            transform: "translateY(-100%)",
          }}
        >
          {visibleOrders.map((wo, i) => (
            <WorkOrderTicket key={wo.id} wo={wo} now={state.time} isNew={i === 0} />
          ))}
        </div>
      )}

      {/* Legend — types of people */}
      <PeopleLegend />

      {state.isResetting && (
        <div className="absolute inset-0 bg-white flex items-center justify-center animate-in fade-in duration-1000">
          <div className="text-slate-900 font-mono text-2xl animate-pulse">NEXT DAY LOADING...</div>
        </div>
      )}

      {/* End-of-day: janitor is waving — wait for user to continue to next day */}
      {!state.isResetting && state.endOfDayPhase === "JANITOR_WAVING" && (
        <div className="absolute inset-x-0 bottom-[12%] flex items-center justify-center pointer-events-none">
          <div className="bg-white/95 border-2 border-slate-800 shadow-[4px_4px_0px_0px_rgba(30,41,59,1)] px-6 py-3 font-mono text-slate-900 text-lg animate-pulse">
            Press any key to continue...
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Legend — people types, bottom-left corner of the canvas
// ============================================================================

/**
 * Little person SVG matching the NPC sprite rendered on the canvas: rounded
 * rectangle body (in `color`), circular head (in `skin`), plus optional type
 * adornments — a janitor's green cap, a guest's yellow chest badge, a meeting
 * guest's lanyard and diamond badge. Kept tight (24×28) for an inline legend.
 */
const MiniPerson: React.FC<{ variant: "EMPLOYEE" | "JANITOR" | "GUEST" | "MEETING_GUEST" }> = ({
  variant,
}) => {
  // Colors chosen to match the on-canvas sprites in draw() above.
  const palette = {
    EMPLOYEE: { body: "#3357FF", skin: "#F1C27D" },
    JANITOR: { body: "#22c55e", skin: "#F1C27D" },
    GUEST: { body: "#64748b", skin: "#F1C27D" },
    MEETING_GUEST: { body: "#f97316", skin: "#F1C27D" },
  }[variant];

  return (
    <svg width="20" height="26" viewBox="0 0 20 26" className="shrink-0">
      {/* shadow */}
      <ellipse cx="10" cy="25" rx="6" ry="1.5" fill="rgba(0,0,0,0.2)" />
      {/* body */}
      <rect
        x="4"
        y="12"
        width="12"
        height="11"
        rx="3"
        fill={palette.body}
        stroke="#1e293b"
        strokeWidth="0.5"
      />
      {/* janitor apron stripe */}
      {variant === "JANITOR" && (
        <rect x="7" y="13" width="6" height="8" fill="rgba(255,255,255,0.55)" />
      )}
      {/* guest chest badge */}
      {variant === "GUEST" && (
        <rect x="6" y="14" width="8" height="3" fill="#facc15" stroke="#713f12" strokeWidth="0.5" />
      )}
      {/* head */}
      <circle cx="10" cy="8" r="4" fill={palette.skin} stroke="#1e293b" strokeWidth="0.5" />
      {/* janitor hat */}
      {variant === "JANITOR" && (
        <rect
          x="5"
          y="3.5"
          width="10"
          height="2"
          fill="#22c55e"
          stroke="#166534"
          strokeWidth="0.4"
        />
      )}
      {/* eyes */}
      <circle cx="8.5" cy="8" r="0.7" fill="#000" />
      <circle cx="11.5" cy="8" r="0.7" fill="#000" />
      {/* meeting guest lanyard + diamond */}
      {variant === "MEETING_GUEST" && (
        <>
          <line x1="10" y1="12" x2="10" y2="16" stroke="#374151" strokeWidth="0.8" />
          <polygon
            points="10,15 12,17 10,19 8,17"
            fill={palette.body}
            stroke="#1f2937"
            strokeWidth="0.5"
          />
        </>
      )}
    </svg>
  );
};

const PeopleLegend: React.FC = () => {
  const items: { label: string; variant: "EMPLOYEE" | "JANITOR" | "GUEST" | "MEETING_GUEST" }[] = [
    { label: "Employee", variant: "EMPLOYEE" },
    { label: "Janitor", variant: "JANITOR" },
    { label: "Guest", variant: "GUEST" },
    { label: "Meeting Guest", variant: "MEETING_GUEST" },
  ];

  return (
    <div className="absolute bottom-[8%] left-3 bg-white/90 backdrop-blur-sm border-2 border-slate-800 shadow-[3px_3px_0px_0px_rgba(30,41,59,1)] px-3 py-1.5 font-mono z-10">
      <div className="flex items-center gap-4">
        <div className="text-[9px] text-slate-500 uppercase tracking-wider">Legend</div>
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-1.5 text-[10px] text-slate-800">
            <MiniPerson variant={it.variant} />
            <span className="font-bold whitespace-nowrap">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// Meeting schedule tooltip — appears on hover over a meeting room
// ============================================================================

function formatRange(start: number, end: number): string {
  const fmt = (t: number) => {
    const h = Math.floor(t / 60),
      m = Math.floor(t % 60);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")}${ampm === "PM" ? "p" : "a"}`;
  };
  return `${fmt(start)}–${fmt(end)}`;
}

interface MeetingTooltipProps {
  anchorX: number;
  anchorY: number;
  roomLabel: string;
  meetings: ScheduledMeeting[];
  currentTime: number;
}

const MeetingTooltip: React.FC<MeetingTooltipProps> = ({
  anchorX,
  anchorY,
  roomLabel,
  meetings,
  currentTime,
}) => {
  return (
    <div
      className="absolute pointer-events-none z-20 bg-white border-2 border-slate-800 shadow-[3px_3px_0px_0px_rgba(30,41,59,1)] font-mono"
      style={{
        left: anchorX + 14,
        top: anchorY + 14,
        width: 220,
      }}
    >
      <div className="bg-slate-800 text-slate-100 px-2 py-0.5 flex items-center justify-between">
        <span className="text-[9px] tracking-[0.15em] font-bold">TODAY&apos;S SCHEDULE</span>
        <span className="text-[9px] text-slate-400">ROOM</span>
      </div>
      <div className="px-2 py-1 border-b border-slate-300 text-[11px] font-bold text-slate-900">
        {roomLabel}
      </div>
      <div className="p-1 max-h-[240px] overflow-y-auto">
        {meetings.length === 0 && (
          <div className="text-[10px] text-slate-500 italic px-1 py-1">No meetings scheduled</div>
        )}
        {meetings.map((m) => {
          const isActive = currentTime >= m.startTime && currentTime < m.endTime;
          const attendees = m.attendeeIds.length;
          const guests = m.guestIds?.length ?? 0;
          return (
            <div
              key={m.id}
              className={[
                "flex items-center justify-between gap-2 px-1 py-1 text-[10px] border-b last:border-b-0 border-slate-200",
                isActive ? "bg-green-50 border-l-2 border-l-green-600" : "",
              ].join(" ")}
            >
              <div className="flex flex-col">
                <span className={`font-bold ${isActive ? "text-green-700" : "text-slate-800"}`}>
                  {formatRange(m.startTime, m.endTime)}
                </span>
                <span className="text-[9px] text-slate-500">{m.id}</span>
              </div>
              <div className="flex items-center gap-1 text-[9px]">
                <span
                  title="employees"
                  className="bg-slate-200 text-slate-700 px-1 border border-slate-400 flex items-center gap-0.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
                  {attendees}
                </span>
                {guests > 0 && (
                  <span
                    title="external guests"
                    className="bg-orange-100 text-orange-700 px-1 border border-orange-400 flex items-center gap-0.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />+
                    {guests}
                  </span>
                )}
                {isActive && (
                  <span className="bg-green-300 text-green-900 px-1 border border-green-600 font-bold animate-pulse">
                    NOW
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
