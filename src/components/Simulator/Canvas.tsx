import React, { useEffect, useRef, useMemo } from 'react';
import { SimState, Room, RoomType, NPC, RestroomStatus } from '@/types/sim';
import { JANITORIAL_RULES } from '@/simulation/engine';

interface RendererProps {
  state: SimState;
}

const TILE_WIDTH = 48;
const TILE_HEIGHT = 24;
const WALL_HEIGHT = 32;
const PADDING = 40;

function project(x: number, y: number) {
  return {
    px: (x - y) * (TILE_WIDTH / 2),
    py: (x + y) * (TILE_HEIGHT / 2)
  };
}

// Compute the bounding box of all rooms in projected (isometric) space.
// This runs once since room positions never change.
function computeViewBounds(rooms: Room[]) {
  let minPx = Infinity, maxPx = -Infinity;
  let minPy = Infinity, maxPy = -Infinity;

  for (const room of rooms) {
    const corners = [
      project(room.x, room.y),
      project(room.x + room.width, room.y),
      project(room.x + room.width, room.y + room.height),
      project(room.x, room.y + room.height),
    ];
    for (const { px, py } of corners) {
      minPx = Math.min(minPx, px - 30);            // extra for NPC sprites / furniture overhang
      maxPx = Math.max(maxPx, px + 30);
      minPy = Math.min(minPy, py - WALL_HEIGHT - 25); // walls + labels above
      maxPy = Math.max(maxPy, py + 30);               // NPC shadows / furniture below
    }
  }

  return { minPx, maxPx, minPy, maxPy };
}

export const IsometricRenderer: React.FC<RendererProps> = ({ state }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Compute projected bounds once (rooms don't move)
  const bounds = useMemo(() => computeViewBounds(state.rooms), [state.rooms]);
  const contentWidth = bounds.maxPx - bounds.minPx + PADDING * 2;
  const contentHeight = bounds.maxPy - bounds.minPy + PADDING * 2;

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
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
    state.rooms.forEach(room => {
      const p1 = project(room.x, room.y);
      const p2 = project(room.x + room.width, room.y);
      const p3 = project(room.x + room.width, room.y + room.height);
      const p4 = project(room.x, room.y + room.height);

      let baseColor = '#ffffff';
      let floorPattern: 'carpet' | 'wood' | 'tile' | 'plain' = 'plain';

      switch (room.type) {
        case RoomType.AUDITORIUM:
          baseColor = '#334155';
          floorPattern = 'carpet';
          break;
        case RoomType.CAFETERIA:
          baseColor = '#fef3c7';
          floorPattern = 'tile';
          break;
        case RoomType.RESTROOM_GN:
          baseColor = '#f1f5f9';
          floorPattern = 'tile';
          break;
        case RoomType.RESTROOM_FAM:
          baseColor = '#eff6ff';
          floorPattern = 'tile';
          break;
        case RoomType.DESK:
          baseColor = '#ffffff';
          floorPattern = 'wood';
          break;
        case RoomType.MEETING_ROOM:
          baseColor = '#faf5ff';
          floorPattern = 'carpet';
          break;
        case RoomType.BREAK_AREA:
          baseColor = '#fff7ed';
          floorPattern = 'wood';
          break;
        case RoomType.JANITOR_CLOSET:
          baseColor = '#e2e8f0';
          floorPattern = 'plain';
          break;
      }

      // Restroom being cleaned — persistent red tint (not fading flash)
      const restroomStatus = state.restroomStatuses?.find(s => s.roomId === room.id);
      if (restroomStatus?.isBeingCleaned) {
        baseColor = 'rgba(239, 68, 68, 0.25)';
      }

      if (room.flashColor && room.flashTimer! > 0) {
        const alpha = (room.flashTimer! / 1000) * 0.5;
        baseColor = room.flashColor === 'green' ? `rgba(34, 197, 94, ${alpha})` : `rgba(239, 68, 68, ${alpha})`;
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
      if (floorPattern !== 'plain' && (!room.flashColor || room.flashTimer === 0)) {
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 0.5;

        if (floorPattern === 'tile') {
          for (let ix = 0; ix <= room.width; ix += 0.5) {
            const start = project(room.x + ix, room.y);
            const end = project(room.x + ix, room.y + room.height);
            ctx.beginPath(); ctx.moveTo(start.px, start.py); ctx.lineTo(end.px, end.py); ctx.stroke();
          }
          for (let iy = 0; iy <= room.height; iy += 0.5) {
            const start = project(room.x, room.y + iy);
            const end = project(room.x + room.width, room.y + iy);
            ctx.beginPath(); ctx.moveTo(start.px, start.py); ctx.lineTo(end.px, end.py); ctx.stroke();
          }
        } else if (floorPattern === 'wood') {
          ctx.strokeStyle = 'rgba(139, 69, 19, 0.1)';
          for (let ix = 0; ix <= room.width; ix += 0.2) {
            const start = project(room.x + ix, room.y);
            const end = project(room.x + ix, room.y + room.height);
            ctx.beginPath(); ctx.moveTo(start.px, start.py); ctx.lineTo(end.px, end.py); ctx.stroke();
          }
        } else if (floorPattern === 'carpet') {
          ctx.fillStyle = 'rgba(0,0,0,0.03)';
          for (let i = 0; i < 100; i++) {
            const rx = room.x + Math.random() * room.width;
            const ry = room.y + Math.random() * room.height;
            const rp = project(rx, ry);
            ctx.fillRect(rp.px, rp.py, 1, 1);
          }
        }
        ctx.restore();
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Left wall
      const gradL = ctx.createLinearGradient(p1.px, p1.py - WALL_HEIGHT, p4.px, p4.py);
      gradL.addColorStop(0, '#94a3b8');
      gradL.addColorStop(1, '#475569');
      ctx.fillStyle = gradL;
      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p1.px, p1.py - WALL_HEIGHT);
      ctx.lineTo(p4.px, p4.py - WALL_HEIGHT);
      ctx.lineTo(p4.px, p4.py);
      ctx.fill();

      // Right wall
      const gradR = ctx.createLinearGradient(p4.px, p4.py - WALL_HEIGHT, p3.px, p3.py);
      gradR.addColorStop(0, '#64748b');
      gradR.addColorStop(1, '#334155');
      ctx.fillStyle = gradR;
      ctx.beginPath();
      ctx.moveTo(p4.px, p4.py);
      ctx.lineTo(p4.px, p4.py - WALL_HEIGHT);
      ctx.lineTo(p3.px, p3.py - WALL_HEIGHT);
      ctx.lineTo(p3.px, p3.py);
      ctx.fill();

      // Top of walls
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py - WALL_HEIGHT);
      ctx.lineTo(p2.px, p2.py - WALL_HEIGHT);
      ctx.lineTo(p3.px, p3.py - WALL_HEIGHT);
      ctx.lineTo(p4.px, p4.py - WALL_HEIGHT);
      ctx.fill();

      // Restroom fixtures
      if (room.type === RoomType.RESTROOM_GN) {
        for (let i = 0; i < 5; i++) {
          const sp = project(room.x + 0.2 + (i * 0.7), room.y + 0.2);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(sp.px, sp.py + 8, 4, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillRect(sp.px - 4, sp.py + 2, 8, 4);
        }
        for (let i = 0; i < 3; i++) {
          const sp = project(room.x + 0.5 + (i * 1.2), room.y + room.height - 0.5);
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.ellipse(sp.px, sp.py + 6, 8, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#94a3b8';
          ctx.stroke();
          ctx.fillStyle = '#64748b';
          ctx.fillRect(sp.px - 1, sp.py + 1, 2, 4);
        }
      }

      // Desk furniture
      if (room.type === RoomType.DESK) {
        const cp = project(room.x + 1, room.y + 0.5);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(cp.px - 14, cp.py + 6, 28, 8);
        ctx.strokeStyle = '#451a03';
        ctx.strokeRect(cp.px - 14, cp.py + 6, 28, 8);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(cp.px - 8, cp.py + 2, 16, 6);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(cp.px - 6, cp.py + 10, 12, 2);
      }

      // Cafeteria furniture
      if (room.type === RoomType.CAFETERIA) {
        for (let i = 0; i < 4; i++) {
          const tp = project(room.x + 1 + (i % 2) * 4, room.y + 1 + Math.floor(i / 2) * 4);
          ctx.fillStyle = '#b45309';
          ctx.beginPath();
          ctx.ellipse(tp.px, tp.py + 12, 18, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#78350f';
          ctx.stroke();
          for (let j = 0; j < 4; j++) {
            const angle = (j * Math.PI) / 2;
            ctx.fillStyle = '#475569';
            ctx.beginPath();
            ctx.arc(tp.px + Math.cos(angle) * 22, tp.py + 12 + Math.sin(angle) * 12, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Break area furniture
      if (room.type === RoomType.BREAK_AREA) {
        const rp = project(room.x + 2, room.y + 2);
        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.ellipse(rp.px, rp.py + 15, 40, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        const pp = project(room.x + 0.5, room.y + 0.5);
        ctx.fillStyle = '#065f46';
        ctx.beginPath();
        ctx.arc(pp.px, pp.py + 5, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(pp.px - 3, pp.py + 10, 6, 6);
      }

      // Labels
      if (room.label && room.type !== RoomType.DESK) {
        ctx.save();
        const center = project(room.x + room.width / 2, room.y + room.height / 2);
        ctx.translate(center.px, center.py - WALL_HEIGHT - 10);

        ctx.font = 'bold 14px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textWidth = ctx.measureText(room.label.toUpperCase()).width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(-textWidth / 2 - 4, -10, textWidth + 8, 20);

        ctx.fillStyle = '#1e293b';
        ctx.fillText(room.label.toUpperCase(), 0, 0);
        ctx.restore();
      }

      // Sad face emoji when restroom is dirty (usage >= dirtyThreshold, not being cleaned)
      if (restroomStatus && restroomStatus.usageCount >= JANITORIAL_RULES.dirtyThreshold && !restroomStatus.isBeingCleaned) {
        const center = project(room.x + room.width / 2, room.y + room.height / 2);
        ctx.save();
        ctx.font = '28px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u{1F61E}', center.px, center.py);
        ctx.restore();
      }
    });

    // Draw NPCs
    state.npcs.forEach(npc => {
      const { px, py } = project(npc.x, npc.y);
      const h = 24 * npc.size;
      const w = 12 * npc.size;
      const isJanitor = npc.npcType === 'JANITOR';

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
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
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(px - w / 4, py + TILE_HEIGHT / 2 - h + 4, w / 2, h * 0.5);
      }

      // Head
      ctx.fillStyle = npc.skinColor;
      ctx.beginPath();
      ctx.arc(px, py + TILE_HEIGHT / 2 - h - w / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();

      // Janitor: hat
      if (isJanitor) {
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(px - w / 2 - 1, py + TILE_HEIGHT / 2 - h - w / 2 - w / 2 - 2, w + 2, 4);
      }

      // Eyes
      ctx.fillStyle = '#000000';
      const eyeOffset = npc.targetX > npc.x ? 2 : -2;
      ctx.beginPath();
      ctx.arc(px + eyeOffset - 2, py + TILE_HEIGHT / 2 - h - w / 2, 1, 0, Math.PI * 2);
      ctx.arc(px + eyeOffset + 2, py + TILE_HEIGHT / 2 - h - w / 2, 1, 0, Math.PI * 2);
      ctx.fill();

      // Urgency indicator (employees only)
      if (!isJanitor && npc.restroomUrgency > 0.5) {
        const pulse = Math.sin(Date.now() / 150) * 3;
        ctx.fillStyle = npc.restroomUrgency > 0.8 ? '#ef4444' : '#f59e0b';
        ctx.beginPath();
        ctx.arc(px + w / 2 + 6, py + TILE_HEIGHT / 2 - h - w - pulse, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Cleaning indicator (janitor working)
      if (isJanitor && npc.state === 'CLEANING') {
        const pulse = Math.sin(Date.now() / 200) * 2;
        ctx.font = '14px serif';
        ctx.textAlign = 'center';
        ctx.fillText('\u{1F9F9}', px + w / 2 + 8, py + TILE_HEIGHT / 2 - h - w / 2 + pulse); // broom emoji
      }
    });

    ctx.restore();
  };

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = canvasRef.current.parentElement?.clientWidth || 1200;
        canvasRef.current.height = Math.round(contentHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [contentHeight]);

  useEffect(() => {
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [state]);

  return (
    <div className="w-full relative">
      <canvas ref={canvasRef} className="w-full image-pixelated" style={{ height: contentHeight }} />
      {state.isResetting && (
        <div className="absolute inset-0 bg-white flex items-center justify-center animate-in fade-in duration-1000">
          <div className="text-slate-900 font-mono text-2xl animate-pulse">
            NEXT DAY LOADING...
          </div>
        </div>
      )}
    </div>
  );
};
