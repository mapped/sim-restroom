import { Room, RoomType, NPC, NPCState, Point, SimState, SimEvent, ScheduledMeeting } from '@/types/sim';

// ============================================================================
// ROOM REGISTRY — Single source of truth for all room ↔ NPC relationships
// ============================================================================

interface RoomRegistry {
  npcToRoom: Map<string, string>;
  roomToNpcs: Map<string, Set<string>>;
}

function buildRegistry(npcs: NPC[], roomIds: string[]): RoomRegistry {
  const npcToRoom = new Map<string, string>();
  const roomToNpcs = new Map<string, Set<string>>();
  for (const id of roomIds) roomToNpcs.set(id, new Set());
  for (const npc of npcs) {
    if (npc.currentRoomId && roomToNpcs.has(npc.currentRoomId)) {
      npcToRoom.set(npc.id, npc.currentRoomId);
      roomToNpcs.get(npc.currentRoomId)!.add(npc.id);
    }
  }
  return { npcToRoom, roomToNpcs };
}

function registryEnter(reg: RoomRegistry, npcId: string, roomId: string): void {
  registryExit(reg, npcId);
  reg.npcToRoom.set(npcId, roomId);
  reg.roomToNpcs.get(roomId)?.add(npcId);
}

function registryExit(reg: RoomRegistry, npcId: string): string | undefined {
  const prev = reg.npcToRoom.get(npcId);
  if (prev !== undefined) {
    reg.npcToRoom.delete(npcId);
    reg.roomToNpcs.get(prev)?.delete(npcId);
  }
  return prev;
}

function registryGetRoom(reg: RoomRegistry, npcId: string): string | undefined {
  return reg.npcToRoom.get(npcId);
}

function registryOccupancy(reg: RoomRegistry, roomId: string): number {
  return reg.roomToNpcs.get(roomId)?.size ?? 0;
}

function registryValidate(reg: RoomRegistry): boolean {
  for (const [npcId, roomId] of reg.npcToRoom) {
    if (!reg.roomToNpcs.get(roomId)?.has(npcId)) {
      console.error(`REGISTRY: NPC ${npcId} → room ${roomId}, but room doesn't list NPC`);
      return false;
    }
  }
  for (const [roomId, npcs] of reg.roomToNpcs) {
    for (const npcId of npcs) {
      if (reg.npcToRoom.get(npcId) !== roomId) {
        console.error(`REGISTRY: Room ${roomId} lists NPC ${npcId}, but NPC says ${reg.npcToRoom.get(npcId)}`);
        return false;
      }
    }
  }
  return true;
}

// ============================================================================
// CONFIGURATION — All tunable rules in one place
// ============================================================================

const GRID_SIZE = 40;

export const SIM_CONFIG = {
  RESTROOM_VISITS_PER_DAY: 5,
  RESTROOM_DURATION_MIN: 3,
  RESTROOM_DURATION_MAX: 10,
  WORK_DAY_START: 360, // 6 AM
  WORK_DAY_END: 1080,  // 6 PM
  ALL_HANDS_TIME: 780,  // 1 PM
  ALL_HANDS_DURATION: 10,
  LOUNGE_PROBABILITY: 0.000001, // per NPC per tick (multiplied by speedMultiplier)
};

export const MEETING_RULES = {
  attendeesMin: 2,
  attendeesMax: 4,
  durations: [5, 15] as number[],  // minutes — randomly chosen per meeting
  boundaryInterval: 5,              // meetings start on 5-min marks (e.g. 9:00, 9:05, 9:10)
  roomIds: ['MEET-001', 'MEET-002'],
};

// ============================================================================
// ROOM LAYOUT
// ============================================================================

export const INITIAL_ROOMS: Room[] = [
  { id: 'REST-001', type: RoomType.RESTROOM_GN, x: 18, y: 14, width: 4, height: 4, label: 'RESTROOM A', capacity: 5, occupancy: [], door: { x: 20, y: 18 } },
  { id: 'REST-002', type: RoomType.RESTROOM_GN, x: 18, y: 22, width: 4, height: 4, label: 'RESTROOM B', capacity: 5, occupancy: [], door: { x: 20, y: 22 } },

  ...Array.from({ length: 10 }).map((_, i) => ({
    id: `DESK-${(i + 1).toString().padStart(3, '0')}`,
    type: RoomType.DESK, x: 10 + (i % 5) * 4, y: 4 + Math.floor(i / 5) * 4,
    width: 2, height: 1, label: 'D', occupancy: [] as string[],
    door: { x: 11 + (i % 5) * 4, y: 5 + Math.floor(i / 5) * 4 },
  })),
  ...Array.from({ length: 10 }).map((_, i) => ({
    id: `DESK-${(i + 11).toString().padStart(3, '0')}`,
    type: RoomType.DESK, x: 10 + (i % 5) * 4, y: 32 + Math.floor(i / 5) * 4,
    width: 2, height: 1, label: 'D', occupancy: [] as string[],
    door: { x: 11 + (i % 5) * 4, y: 32 + Math.floor(i / 5) * 4 },
  })),

  { id: 'CAF-001', type: RoomType.CAFETERIA, x: 30, y: 10, width: 8, height: 10, label: 'Cafeteria', occupancy: [], door: { x: 30, y: 15 } },
  { id: 'BREAK-001', type: RoomType.BREAK_AREA, x: 30, y: 22, width: 8, height: 8, label: 'Lounge', occupancy: [], door: { x: 30, y: 26 } },
  { id: 'AUD-001', type: RoomType.AUDITORIUM, x: 2, y: 10, width: 10, height: 12, label: 'Auditorium', occupancy: [], door: { x: 12, y: 16 } },
  { id: 'MEET-001', type: RoomType.MEETING_ROOM, x: 2, y: 24, width: 6, height: 4, label: 'Meeting A', capacity: 6, occupancy: [], door: { x: 8, y: 26 } },
  { id: 'MEET-002', type: RoomType.MEETING_ROOM, x: 2, y: 30, width: 6, height: 4, label: 'Meeting B', capacity: 6, occupancy: [], door: { x: 8, y: 32 } },
];

// ============================================================================
// NPC CREATION
// ============================================================================

const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#33FFF3', '#F3FF33'];
const SKIN_COLORS = ['#FFDBAC', '#F1C27D', '#E0AC69', '#8D5524', '#C68642'];

export function getDeskIdForNPC(npcId: string): string {
  return `DESK-${(parseInt(npcId.split('-')[1]) + 1).toString().padStart(3, '0')}`;
}

export function createNPC(id: number): NPC {
  const deskId = `DESK-${(id + 1).toString().padStart(3, '0')}`;
  const desk = INITIAL_ROOMS.find(r => r.id === deskId);
  return {
    id: `NPC-${id}`, name: `Employee ${id}`,
    x: desk?.x || 0, y: desk?.y || 0,
    targetX: desk?.x || 0, targetY: desk?.y || 0,
    state: NPCState.WORKING,
    speed: 0.05 + Math.random() * 0.05,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    skinColor: SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)],
    size: 0.8 + Math.random() * 0.4,
    restroomUrgency: Math.random() * 0.5,
    lastRestroomTime: SIM_CONFIG.WORK_DAY_START,
    path: [], currentRoomId: deskId, targetRoomId: undefined, leaveTime: undefined,
  };
}

// ============================================================================
// PATHFINDING
// ============================================================================

export function findPath(start: Point, end: Point): Point[] {
  const sx = Math.round(start.x), sy = Math.round(start.y);
  const ex = Math.round(end.x), ey = Math.round(end.y);
  if (sx === ex && sy === ey) return [end];

  const visited = new Set<string>([`${sx},${sy}`]);
  const queue: { x: number; y: number; path: Point[] }[] = [{ x: sx, y: sy, path: [] }];

  let iter = 0;
  while (queue.length > 0 && iter < 2000) {
    iter++;
    const { x, y, path } = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx === ex && ny === ey) return [...path, end];
      const key = `${nx},${ny}`;
      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && !visited.has(key)) {
        visited.add(key);
        queue.push({ x: nx, y: ny, path: [...path, { x: nx, y: ny }] });
      }
    }
  }
  return [end];
}

// ============================================================================
// MEETING SCHEDULER
//
// Keeps both meeting rooms continuously occupied. When a room becomes free,
// schedules the next meeting at the next 5-minute calendar boundary with a
// random subset of available (desk-sitting) NPCs.
// ============================================================================

function scheduleMeetings(
  currentMeetings: ScheduledMeeting[],
  newTime: number,
  npcs: NPC[],
  registry: RoomRegistry,
): ScheduledMeeting[] {
  // Keep meetings that haven't ended
  const live = currentMeetings.filter(m => newTime < m.endTime);

  // NPCs already assigned to a live meeting
  const assignedIds = new Set(live.flatMap(m => m.attendeeIds));

  for (const roomId of MEETING_RULES.roomIds) {
    // Skip if this room already has a meeting (active or upcoming)
    if (live.some(m => m.roomId === roomId)) continue;

    // Next 5-minute boundary
    const boundary = Math.ceil(newTime / MEETING_RULES.boundaryInterval) * MEETING_RULES.boundaryInterval;
    if (boundary + MEETING_RULES.durations[0] > SIM_CONFIG.WORK_DAY_END) continue; // too late in the day

    const duration = MEETING_RULES.durations[Math.floor(Math.random() * MEETING_RULES.durations.length)];

    // Available: at desk, not already assigned
    const available = npcs.filter(n =>
      n.state === NPCState.WORKING &&
      registryGetRoom(registry, n.id)?.startsWith('DESK') &&
      !assignedIds.has(n.id)
    );

    const count = MEETING_RULES.attendeesMin +
      Math.floor(Math.random() * (MEETING_RULES.attendeesMax - MEETING_RULES.attendeesMin + 1));
    const picked = [...available].sort(() => Math.random() - 0.5).slice(0, count);

    if (picked.length >= MEETING_RULES.attendeesMin) {
      const meeting: ScheduledMeeting = {
        roomId,
        startTime: boundary,
        endTime: boundary + duration,
        attendeeIds: picked.map(n => n.id),
      };
      live.push(meeting);
      for (const p of picked) assignedIds.add(p.id);
    }
  }

  return live;
}

function isMeetingActive(m: ScheduledMeeting, time: number): boolean {
  return time >= m.startTime && time < m.endTime;
}

function findActiveMeetingForNPC(meetings: ScheduledMeeting[], npcId: string, time: number): ScheduledMeeting | undefined {
  return meetings.find(m => isMeetingActive(m, time) && m.attendeeIds.includes(npcId));
}

function findActiveMeetingForRoom(meetings: ScheduledMeeting[], roomId: string, time: number): ScheduledMeeting | undefined {
  return meetings.find(m => isMeetingActive(m, time) && m.roomId === roomId);
}

// ============================================================================
// HELPERS
// ============================================================================

interface TickContext {
  newTime: number;
  deltaMins: number;
  deltaTime: number;
  speedMultiplier: number;
  isAllHandsTime: boolean;
}

function findAvailableRestroom(reg: RoomRegistry, roomsById: Map<string, Room>): string | null {
  const restrooms = Array.from(roomsById.values()).filter(r =>
    (r.type === RoomType.RESTROOM_GN || r.type === RoomType.RESTROOM_FAM) &&
    registryOccupancy(reg, r.id) < (r.capacity || 5)
  );
  if (restrooms.length === 0) return null;
  return restrooms[Math.floor(Math.random() * restrooms.length)].id;
}

function sendToRoom(npc: NPC, roomId: string, roomsById: Map<string, Room>): void {
  const room = roomsById.get(roomId);
  if (!room) return;
  npc.targetRoomId = roomId;
  npc.targetX = room.door.x;
  npc.targetY = room.door.y;
  npc.state = NPCState.WALKING;
  npc.path = findPath({ x: npc.x, y: npc.y }, room.door);
}

function decidePostExitDestination(
  npc: NPC,
  reg: RoomRegistry,
  roomsById: Map<string, Room>,
  meetings: ScheduledMeeting[],
  ctx: TickContext,
): string {
  if (ctx.isAllHandsTime) return 'AUD-001';
  if (npc.restroomUrgency > 0.8) {
    const r = findAvailableRestroom(reg, roomsById);
    if (r) return r;
  }
  const meeting = findActiveMeetingForNPC(meetings, npc.id, ctx.newTime);
  if (meeting) return meeting.roomId;
  return getDeskIdForNPC(npc.id);
}

// ============================================================================
// PROCESS SINGLE NPC
//
// Phases:
//   1. Update urgency
//   2. If in non-desk room & not walking → check if should leave → walk to door
//   3. Movement → door transitions (enter/exit via registry)
//   4. Desk decisions → assigned meeting? restroom? break?
//   5. IDLE recovery → go to desk
//   6. Sync currentRoomId from registry
// ============================================================================

function processNPC(
  npc: NPC,
  registry: RoomRegistry,
  roomsById: Map<string, Room>,
  meetings: ScheduledMeeting[],
  ctx: TickContext,
  events: SimEvent[],
  flashes: Map<string, { color: 'green' | 'red'; timer: number }>,
): NPC {
  const n: NPC = { ...npc, path: [...npc.path] };
  const currentRoomId = registryGetRoom(registry, n.id);
  const currentRoom = currentRoomId ? roomsById.get(currentRoomId) : undefined;
  const isInNonDeskRoom = currentRoomId != null && !currentRoomId.startsWith('DESK');

  // --- 1. Urgency ---
  n.restroomUrgency += ctx.deltaMins / 144;

  // --- 2. Should leave current room? ---
  if (isInNonDeskRoom && n.state !== NPCState.WALKING) {
    let shouldLeave = false;

    if (n.state === NPCState.RESTROOM) {
      shouldLeave = (n.leaveTime != null && ctx.newTime >= n.leaveTime) || ctx.isAllHandsTime;
      if (shouldLeave) { n.restroomUrgency = 0; n.lastRestroomTime = ctx.newTime; }
    } else if (n.state === NPCState.EATING) {
      shouldLeave = (n.leaveTime != null && ctx.newTime >= n.leaveTime) || ctx.isAllHandsTime;
    } else if (n.state === NPCState.MEETING) {
      if (currentRoomId!.startsWith('AUD')) {
        shouldLeave = !ctx.isAllHandsTime;
      } else if (currentRoomId!.startsWith('MEET')) {
        shouldLeave = (n.leaveTime != null && ctx.newTime >= n.leaveTime) || ctx.isAllHandsTime;
      }
    }

    if (shouldLeave && currentRoom) {
      n.targetRoomId = currentRoomId;
      n.targetX = currentRoom.door.x;
      n.targetY = currentRoom.door.y;
      n.state = NPCState.WALKING;
      n.leaveTime = undefined;
      n.path = findPath({ x: n.x, y: n.y }, currentRoom.door);
    }
  }

  // --- 3. Movement ---
  if (n.state === NPCState.WALKING) {
    let budget = Math.min(n.speed * (ctx.deltaTime / 16) * (ctx.speedMultiplier / 10 + 1), 1.5);
    while (budget > 0 && n.path.length > 0) {
      const next = n.path[0];
      const dx = next.x - n.x, dy = next.y - n.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= budget) {
        n.x = next.x; n.y = next.y; n.path.shift(); budget -= dist;
      } else {
        n.x += (dx / dist) * budget; n.y += (dy / dist) * budget; budget = 0;
      }
    }

    // Door transition
    if (n.path.length === 0 && n.targetRoomId) {
      const target = roomsById.get(n.targetRoomId);
      if (!target) { n.targetRoomId = undefined; n.state = NPCState.IDLE; }
      else {
        n.x = target.door.x; n.y = target.door.y;

        if (currentRoomId === n.targetRoomId) {
          // ── EXIT ──
          registryExit(registry, n.id);
          if (target.type === RoomType.RESTROOM_GN || target.type === RoomType.RESTROOM_FAM) {
            events.push({ type: 'EXIT', restroomId: target.id, npcId: n.id, timestamp: ctx.newTime });
            flashes.set(target.id, { color: 'red', timer: 1000 });
          }
          n.targetRoomId = undefined; n.leaveTime = undefined;
          const dest = decidePostExitDestination(n, registry, roomsById, meetings, ctx);
          sendToRoom(n, dest, roomsById);

        } else if (currentRoomId == null || currentRoomId.startsWith('DESK')) {
          // ── ENTER ──
          // Meeting room: only enter if meeting is still active
          if (target.type === RoomType.MEETING_ROOM) {
            const activeMeeting = findActiveMeetingForRoom(meetings, target.id, ctx.newTime);
            if (!activeMeeting) {
              // Meeting ended while walking — redirect to desk
              sendToRoom(n, getDeskIdForNPC(n.id), roomsById);
              n.currentRoomId = registryGetRoom(registry, n.id);
              return n;
            }
          }

          const capacity = target.capacity ?? (target.type === RoomType.DESK ? 1 : 999);
          if (registryOccupancy(registry, target.id) < capacity) {
            if (currentRoomId?.startsWith('DESK')) registryExit(registry, n.id);
            registryEnter(registry, n.id, target.id);
            n.targetRoomId = undefined;

            if (target.type === RoomType.RESTROOM_GN || target.type === RoomType.RESTROOM_FAM) {
              n.state = NPCState.RESTROOM;
              n.leaveTime = ctx.newTime + SIM_CONFIG.RESTROOM_DURATION_MIN +
                Math.random() * (SIM_CONFIG.RESTROOM_DURATION_MAX - SIM_CONFIG.RESTROOM_DURATION_MIN);
              events.push({ type: 'ENTER', restroomId: target.id, npcId: n.id, timestamp: ctx.newTime });
              flashes.set(target.id, { color: 'green', timer: 1000 });
            } else if (target.type === RoomType.AUDITORIUM) {
              n.state = NPCState.MEETING;
            } else if (target.type === RoomType.MEETING_ROOM) {
              n.state = NPCState.MEETING;
              const meeting = findActiveMeetingForRoom(meetings, target.id, ctx.newTime);
              n.leaveTime = meeting?.endTime ?? ctx.newTime + 5;
            } else if (target.type === RoomType.CAFETERIA || target.type === RoomType.BREAK_AREA) {
              n.state = NPCState.EATING;
              n.leaveTime = ctx.newTime + 5 + Math.random() * 10;
            } else if (target.type === RoomType.DESK) {
              n.state = NPCState.WORKING;
            }

            if (target.type !== RoomType.DESK) {
              const pad = 0.8;
              n.x = target.x + pad + Math.random() * (target.width - pad * 2);
              n.y = target.y + pad + Math.random() * (target.height - pad * 2);
            }
          } else {
            sendToRoom(n, getDeskIdForNPC(n.id), roomsById);
          }
        } else {
          console.error(`BUG: NPC ${n.id} in ${currentRoomId} trying to enter ${n.targetRoomId}`);
          n.targetRoomId = undefined; n.state = NPCState.IDLE;
        }
      }
    } else if (n.path.length === 0 && !n.targetRoomId) {
      n.state = NPCState.IDLE;
    }
  }

  // --- 4. Desk decisions ---
  if (n.state === NPCState.WORKING && registryGetRoom(registry, n.id)?.startsWith('DESK')) {
    let dest: string | null = null;

    if (ctx.isAllHandsTime) {
      dest = 'AUD-001';
    } else if (n.restroomUrgency > 0.8) {
      dest = findAvailableRestroom(registry, roomsById);
    } else {
      const meeting = findActiveMeetingForNPC(meetings, n.id, ctx.newTime);
      if (meeting) {
        dest = meeting.roomId;
      } else if (Math.random() < SIM_CONFIG.LOUNGE_PROBABILITY * ctx.speedMultiplier) {
        const social = Array.from(roomsById.values()).filter(r =>
          r.type === RoomType.CAFETERIA || r.type === RoomType.BREAK_AREA
        );
        if (social.length > 0) dest = social[Math.floor(Math.random() * social.length)].id;
      }
    }

    if (dest) {
      registryExit(registry, n.id);
      sendToRoom(n, dest, roomsById);
    }
  }

  // --- 5. IDLE recovery ---
  if (n.state === NPCState.IDLE) {
    sendToRoom(n, getDeskIdForNPC(n.id), roomsById);
  }

  // --- 6. Sync from registry ---
  n.currentRoomId = registryGetRoom(registry, n.id);
  return n;
}

// ============================================================================
// MAIN TICK
// ============================================================================

export function updateSimulation(
  state: SimState,
  deltaTime: number,
): { nextState: SimState; events: SimEvent[] } {
  if (state.isResetting) return { nextState: state, events: [] };

  const deltaMins = (deltaTime / 1000 / 60) * state.speedMultiplier;
  const newTime = state.time + deltaMins;

  if (newTime >= SIM_CONFIG.WORK_DAY_END) {
    return { nextState: { ...state, isResetting: true, time: SIM_CONFIG.WORK_DAY_END }, events: [] };
  }

  const registry = buildRegistry(state.npcs, state.rooms.map(r => r.id));
  const roomsById = new Map(state.rooms.map(r => [r.id, r]));

  const isAllHandsDay = (state.day % 7) === 2 || (state.day % 7) === 4;
  const isAllHandsTime = isAllHandsDay &&
    newTime >= SIM_CONFIG.ALL_HANDS_TIME &&
    newTime < SIM_CONFIG.ALL_HANDS_TIME + SIM_CONFIG.ALL_HANDS_DURATION;

  const ctx: TickContext = { newTime, deltaMins, deltaTime, speedMultiplier: state.speedMultiplier, isAllHandsTime };

  // Schedule meetings before processing NPCs so they can act on new schedules
  const updatedMeetings = scheduleMeetings(state.meetings, newTime, state.npcs, registry);

  const collectedEvents: SimEvent[] = [];
  const flashUpdates = new Map<string, { color: 'green' | 'red'; timer: number }>();

  const updatedNPCs = state.npcs.map(npc =>
    processNPC(npc, registry, roomsById, updatedMeetings, ctx, collectedEvents, flashUpdates)
  );

  if (!registryValidate(registry)) {
    console.error('REGISTRY VALIDATION FAILED at time', newTime);
  }

  const finalRooms = state.rooms.map(room => {
    let flashTimer = Math.max(0, (room.flashTimer || 0) - deltaTime);
    let flashColor: Room['flashColor'] = flashTimer > 0 ? room.flashColor ?? null : null;
    const flash = flashUpdates.get(room.id);
    if (flash) { flashColor = flash.color; flashTimer = flash.timer; }

    const count = registryOccupancy(registry, room.id);
    const baseLabel = (room.label || '').split(' (')[0];
    return {
      ...room,
      occupancy: Array.from(registry.roomToNpcs.get(room.id) || []),
      flashColor, flashTimer,
      label: count > 0 ? `${baseLabel} (${count})` : baseLabel,
    };
  });

  return {
    nextState: { ...state, time: newTime, npcs: updatedNPCs, rooms: finalRooms, meetings: updatedMeetings },
    events: collectedEvents,
  };
}
