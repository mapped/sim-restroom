/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { SimState, SimEvent, Room, NPCState } from '@/types/sim';
import { INITIAL_ROOMS, createNPC, updateSimulation, getDeskIdForNPC } from '@/simulation/engine';
import { IsometricRenderer } from '@/components/Simulator/Canvas';
import { Controls } from '@/components/Simulator/Controls';
import { Badge } from '@/components/ui/badge';

const getInitialSettings = () => {
  const stored = localStorage.getItem('mappedSimSettings');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        population: parsed.population || 20,
        speed: parsed.speed || 60
      };
    } catch {
      return { population: 20, speed: 60 };
    }
  }
  return { population: 20, speed: 60 };
};

function makeCleanRooms(): Room[] {
  return INITIAL_ROOMS.map(r => ({ ...r, occupancy: [], flashColor: null as Room['flashColor'], flashTimer: 0 }));
}

export default function App() {
  const [state, setState] = useState<SimState>(() => {
    const settings = getInitialSettings();
    return {
      time: 360,
      day: 1,
      npcs: Array.from({ length: settings.population }).map((_, i) => createNPC(i)),
      rooms: makeCleanRooms(),
      meetings: [],
      speedMultiplier: settings.speed,
      isResetting: false
    };
  });

  const [events, setEvents] = useState<SimEvent[]>([]);
  const lastUpdateRef = useRef<number>(performance.now());
  const requestRef = useRef<number>(null);
  const pendingEventsRef = useRef<SimEvent[]>([]);

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const animate = useCallback((time: number) => {
    const deltaTime = time - lastUpdateRef.current;
    lastUpdateRef.current = time;

    setState(prev => {
      if (prev.isResetting) return prev;
      const { nextState, events: newEvents } = updateSimulation(prev, deltaTime);
      pendingEventsRef.current = newEvents;
      return nextState;
    });

    if (pendingEventsRef.current.length > 0) {
      const batch = pendingEventsRef.current;
      pendingEventsRef.current = [];
      setEvents(e => [...e, ...batch]);
    }

    requestRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  useEffect(() => {
    if (state.isResetting) {
      const timer = setTimeout(() => {
        setState(prev => {
          const cleanRooms = makeCleanRooms();
          return {
            ...prev,
            time: 360,
            day: prev.day + 1,
            isResetting: false,
            rooms: cleanRooms,
            meetings: [],
            npcs: prev.npcs.map(npc => {
              const deskId = getDeskIdForNPC(npc.id);
              const desk = cleanRooms.find(r => r.id === deskId);
              return {
                ...npc,
                x: desk ? desk.x + 0.5 : npc.x,
                y: desk ? desk.y + 0.5 : npc.y,
                targetX: desk ? desk.x + 0.5 : npc.x,
                targetY: desk ? desk.y + 0.5 : npc.y,
                state: NPCState.WORKING,
                path: [],
                restroomUrgency: Math.random() * 0.3,
                currentRoomId: deskId,
                targetRoomId: undefined,
                leaveTime: undefined,
              };
            })
          };
        });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state.isResetting]);

  const handleApplySettings = (count: number, speed: number) => {
    localStorage.setItem('mappedSimSettings', JSON.stringify({ population: count, speed }));
    setEvents([]);
    setState(() => ({
      time: 360,
      day: 1,
      speedMultiplier: speed,
      isResetting: false,
      rooms: makeCleanRooms(),
      meetings: [],
      npcs: Array.from({ length: count }).map((_, i) => createNPC(i)),
    }));
  };

  const skipToAllHands = () => {
    setEvents([]);
    setState(prev => {
      let nextDay = prev.day;
      const dow = prev.day % 7;

      if (dow < 2) nextDay = prev.day + (2 - dow);
      else if (dow === 2) nextDay = prev.time < 780 ? prev.day : prev.day + 2;
      else if (dow < 4) nextDay = prev.day + (4 - dow);
      else if (dow === 4) nextDay = prev.time < 780 ? prev.day : prev.day + 5;
      else nextDay = prev.day + (9 - dow);

      const cleanRooms = makeCleanRooms();
      return {
        ...prev,
        day: nextDay,
        time: 775,
        rooms: cleanRooms,
        meetings: [],
        npcs: prev.npcs.map(npc => {
          const deskId = getDeskIdForNPC(npc.id);
          const desk = cleanRooms.find(r => r.id === deskId);
          return {
            ...npc,
            x: desk ? desk.x + 0.5 : npc.x,
            y: desk ? desk.y + 0.5 : npc.y,
            targetX: desk ? desk.x + 0.5 : npc.x,
            targetY: desk ? desk.y + 0.5 : npc.y,
            restroomUrgency: 0.4 + Math.random() * 0.4,
            state: NPCState.WORKING,
            currentRoomId: deskId,
            targetRoomId: undefined,
            leaveTime: undefined,
            path: [],
          };
        })
      };
    });
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      <div className="max-w-[1400px] mx-auto">
        <main>
          <div className="relative">
            <IsometricRenderer state={state} />

            {/* Time & day overlay */}
            <div className="absolute top-[8%] right-[4%] flex flex-col items-end gap-2 z-10">
              <div className="text-3xl font-mono font-bold text-slate-800 bg-white/90 backdrop-blur-sm px-3 py-1.5 border-2 border-slate-800 shadow-[3px_3px_0px_0px_rgba(30,41,59,1)]">
                {formatTime(state.time)}
              </div>
              <div className="flex gap-2">
                <Badge className="bg-slate-800 text-white font-mono px-3 py-1">
                  DAY {state.day}
                </Badge>
                <Badge className="bg-blue-600 text-white font-mono px-3 py-1">
                  {state.day % 7 === 2 || state.day % 7 === 4 ? 'ALL-HANDS DAY' : 'REGULAR DAY'}
                </Badge>
              </div>
            </div>
          </div>

          <div className="px-4 md:px-8">
            <Controls
              npcCount={state.npcs.length}
              speed={state.speedMultiplier}
              onApplySettings={handleApplySettings}
              onSkipToAllHands={skipToAllHands}
              events={events}
            />
          </div>
        </main>

        <footer className="mt-12 pt-8 px-4 md:px-8 border-t border-slate-200 text-center text-slate-400 font-mono text-xs">
          <p>&copy; 2026 MAPPED.COM // DATA PLATFORM FOR THE BUILT WORLD</p>
        </footer>
      </div>
    </div>
  );
}
