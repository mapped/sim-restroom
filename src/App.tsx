/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { SimState, SimEvent, Room, NPCState } from '@/types/sim';
import { INITIAL_ROOMS, createNPC, createJanitorNPC, createInitialRestroomStatuses, updateSimulation, getDeskIdForNPC, JANITORIAL_RULES, SIM_CONFIG } from '@/simulation/engine';
import { IsometricRenderer } from '@/components/Simulator/Canvas';
import { Controls } from '@/components/Simulator/Controls';
import { Badge } from '@/components/ui/badge';

const POPULATION = 20;
const FAST_FORWARD_SPEED = 10000; // hyper speed multiplier during fast-forward

function makeCleanRooms(): Room[] {
  return INITIAL_ROOMS.map(r => ({ ...r, occupancy: [], flashColor: null as Room['flashColor'], flashTimer: 0 }));
}

function makeInitialNPCs() {
  const employees = Array.from({ length: POPULATION }).map((_, i) => createNPC(i));
  return [...employees, createJanitorNPC()];
}

function resetNPC(npc: any, cleanRooms: Room[], urgencyRange: [number, number]) {
  if (npc.npcType === 'JANITOR') {
    const closet = cleanRooms.find(r => r.id === JANITORIAL_RULES.janitorClosetId);
    return {
      ...npc,
      x: closet ? closet.door.x : npc.x,
      y: closet ? closet.door.y : npc.y,
      targetX: closet ? closet.door.x : npc.x,
      targetY: closet ? closet.door.y : npc.y,
      state: NPCState.IDLE,
      path: [],
      currentRoomId: JANITORIAL_RULES.janitorClosetId,
      targetRoomId: undefined,
      leaveTime: undefined,
    };
  }
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
    restroomUrgency: urgencyRange[0] + Math.random() * (urgencyRange[1] - urgencyRange[0]),
    currentRoomId: deskId,
    targetRoomId: undefined,
    leaveTime: undefined,
  };
}

export default function App() {
  const [state, setState] = useState<SimState>(() => ({
    time: 360,
    day: 1,
    npcs: makeInitialNPCs(),
    rooms: makeCleanRooms(),
    meetings: [],
    workOrders: [],
    restroomStatuses: createInitialRestroomStatuses(),
    predictions: [],
    predictiveMode: true,
    speedMultiplier: 300,
    isResetting: false,
  }));

  const [events, setEvents] = useState<SimEvent[]>([]);
  const lastUpdateRef = useRef<number>(performance.now());
  const requestRef = useRef<number>(null);
  const pendingEventsRef = useRef<SimEvent[]>([]);
  const eventHistoryRef = useRef<SimEvent[]>([]);
  const fastForwardRef = useRef<{ target: number } | null>(null);

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const isFastForwarding = fastForwardRef.current !== null;

  const animate = useCallback((time: number) => {
    const realDelta = time - lastUpdateRef.current;
    lastUpdateRef.current = time;

    setState(prev => {
      if (prev.isResetting) return prev;

      // During fast-forward, override speed to hyper speed
      const ff = fastForwardRef.current;
      const simState = ff
        ? { ...prev, speedMultiplier: FAST_FORWARD_SPEED }
        : prev;

      const { nextState, events: newEvents } = updateSimulation(simState, realDelta, eventHistoryRef.current);
      pendingEventsRef.current = newEvents;

      // Restore actual speed multiplier (don't persist the hyper speed)
      const result = ff
        ? { ...nextState, speedMultiplier: prev.speedMultiplier }
        : nextState;

      // Check if fast-forward target reached
      if (ff && result.time >= ff.target) {
        fastForwardRef.current = null;
      }

      // Auto-slowdown during cleaning — entirely in state (refs don't survive
      // React's double-invocation of setState updaters).
      const anyCleaning = result.restroomStatuses.some(s => s.isBeingCleaned);

      if (anyCleaning && !result.preCleaningSpeed && result.speedMultiplier >= 300) {
        return { ...result, preCleaningSpeed: result.speedMultiplier, speedMultiplier: 60 };
      }
      if (!anyCleaning && result.preCleaningSpeed) {
        return { ...result, speedMultiplier: result.preCleaningSpeed, preCleaningSpeed: undefined };
      }

      return result;
    });

    if (pendingEventsRef.current.length > 0) {
      const batch = pendingEventsRef.current;
      pendingEventsRef.current = [];
      eventHistoryRef.current = [...eventHistoryRef.current, ...batch];
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

  // Day-end reset
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
            workOrders: [],
            restroomStatuses: createInitialRestroomStatuses(),
            predictions: [],
            npcs: prev.npcs.map(npc => resetNPC(npc, cleanRooms, [0, 0.3])),
          };
        });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state.isResetting]);

  const handleSetSpeed = (speed: number) => {
    setState(prev => ({ ...prev, speedMultiplier: speed, preCleaningSpeed: undefined }));
  };

  const handleTogglePredictive = (enabled: boolean) => {
    setState(prev => ({ ...prev, predictiveMode: enabled }));
  };

  const skipToAllHands = () => {
    const targetTime = SIM_CONFIG.ALL_HANDS_TIME - 5; // 5 min before all-hands

    setState(prev => {
      if (prev.time < targetTime) {
        // Future today — just fast-forward
        fastForwardRef.current = { target: targetTime };
        return prev;
      } else {
        // Past all-hands — reset to next day, then fast-forward
        const cleanRooms = makeCleanRooms();
        fastForwardRef.current = { target: targetTime };
        setEvents([]);
        eventHistoryRef.current = [];
        return {
          ...prev,
          day: prev.day + 1,
          time: 360,
          isResetting: false,
          rooms: cleanRooms,
          meetings: [],
          workOrders: [],
          restroomStatuses: createInitialRestroomStatuses(),
          predictions: [],
          npcs: prev.npcs.map(npc => resetNPC(npc, cleanRooms, [0, 0.3])),
        };
      }
    });
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      <div className="max-w-[1400px] mx-auto">
        <main>
          <div className="relative">
            <IsometricRenderer state={state} />

            {/* Time overlay */}
            <div className="absolute top-[8%] right-[4%] flex flex-col items-end gap-2 z-10">
              <div className="text-3xl font-mono font-bold text-slate-800 bg-white/90 backdrop-blur-sm px-3 py-1.5 border-2 border-slate-800 shadow-[3px_3px_0px_0px_rgba(30,41,59,1)]">
                {formatTime(state.time)}
              </div>
              {fastForwardRef.current && (
                <Badge className="bg-yellow-500 text-black font-mono px-3 py-1 animate-pulse">
                  FAST FORWARD
                </Badge>
              )}
            </div>
          </div>

          <div className="px-4 md:px-8">
            <Controls
              speed={state.speedMultiplier}
              predictiveMode={state.predictiveMode}
              onSetSpeed={handleSetSpeed}
              onSkipToAllHands={skipToAllHands}
              onTogglePredictive={handleTogglePredictive}
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
