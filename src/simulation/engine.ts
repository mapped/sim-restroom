import { Room, RoomType, NPC, NPCState, Point, SimState, SimEvent, ScheduledMeeting, WorkOrder, RestroomStatus, RestroomPrediction } from '@/types/sim';
import { SIM_CONFIG, MEETING_RULES, JANITORIAL_RULES, LIFECYCLE_RULES } from '@/simulation/config';
import { computePredictions, maybeCreatePreemptiveWorkOrders } from '@/simulation/prediction';

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

// Config is in config.ts (shared with prediction.ts to avoid circular imports)
// Re-export for backward compatibility with existing imports
export { SIM_CONFIG, MEETING_RULES, JANITORIAL_RULES, LIFECYCLE_RULES } from '@/simulation/config';

const GRID_SIZE = 40;

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
  { id: 'JAN-CLOSET', type: RoomType.JANITOR_CLOSET, x: 2, y: 36, width: 2, height: 2, label: 'Janitor', capacity: 1, occupancy: [], door: { x: 4, y: 37 } },
  { id: 'LOBBY', type: RoomType.LOBBY, x: 22, y: 38, width: 5, height: 2, label: 'Entrance', capacity: 0, occupancy: [], door: { x: 24, y: 38 } },
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
  // Employees arrive AWAY, with random arrival 6-9 AM and departure 4-6 PM
  const arrivalTime = LIFECYCLE_RULES.employeeArrivalStart +
    Math.random() * (LIFECYCLE_RULES.employeeArrivalEnd - LIFECYCLE_RULES.employeeArrivalStart);
  const departureTime = LIFECYCLE_RULES.employeeDepartureStart +
    Math.random() * (LIFECYCLE_RULES.employeeDepartureEnd - LIFECYCLE_RULES.employeeDepartureStart);
  return {
    id: `NPC-${id}`, name: `Employee ${id}`, npcType: 'EMPLOYEE',
    x: -100, y: -100, // off-screen while AWAY
    targetX: 0, targetY: 0,
    state: NPCState.AWAY,
    speed: 0.05 + Math.random() * 0.05,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    skinColor: SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)],
    size: 0.8 + Math.random() * 0.4,
    restroomUrgency: Math.random() * 0.5,
    lastRestroomTime: SIM_CONFIG.WORK_DAY_START,
    arrivalTime,
    departureTime,
    path: [], currentRoomId: undefined, targetRoomId: undefined, leaveTime: undefined,
  };
}

let guestCounter = 0;
export function createGuestNPC(currentTime: number): NPC {
  const stayMinutes = LIFECYCLE_RULES.guestStayMin +
    Math.random() * (LIFECYCLE_RULES.guestStayMax - LIFECYCLE_RULES.guestStayMin);
  return {
    id: `GUEST-${++guestCounter}`, name: `Guest ${guestCounter}`, npcType: 'GUEST',
    x: LIFECYCLE_RULES.entryPoint.x, y: LIFECYCLE_RULES.entryPoint.y,
    targetX: LIFECYCLE_RULES.entryPoint.x, targetY: LIFECYCLE_RULES.entryPoint.y,
    state: NPCState.IDLE,
    speed: 0.04 + Math.random() * 0.04,
    color: '#64748b', // neutral slate
    skinColor: SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)],
    size: 0.9 + Math.random() * 0.3,
    restroomUrgency: Math.random() * 0.3,
    lastRestroomTime: currentTime,
    arrivalTime: currentTime,
    departureTime: currentTime + stayMinutes,
    path: [], currentRoomId: undefined, targetRoomId: undefined, leaveTime: undefined,
  };
}

export function resetGuestCounter() {
  guestCounter = 0;
}

export function createJanitorNPC(): NPC {
  const closet = INITIAL_ROOMS.find(r => r.id === JANITORIAL_RULES.janitorClosetId)!;
  return {
    id: 'JAN-01', name: 'Janitor', npcType: 'JANITOR',
    x: closet.door.x, y: closet.door.y,
    targetX: closet.door.x, targetY: closet.door.y,
    state: NPCState.IDLE,
    speed: 0.06,
    color: '#22c55e',       // green uniform
    skinColor: '#F1C27D',
    size: 1.0,
    restroomUrgency: 0,
    lastRestroomTime: 0,
    path: [], currentRoomId: JANITORIAL_RULES.janitorClosetId, targetRoomId: undefined, leaveTime: undefined,
  };
}

export function createInitialRestroomStatuses(): RestroomStatus[] {
  return JANITORIAL_RULES.restroomIds.map(roomId => ({
    roomId,
    usageCount: 0,
    lastCleanedAt: SIM_CONFIG.WORK_DAY_START,
    isBeingCleaned: false,
  }));
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
// ============================================================================

function scheduleMeetings(
  currentMeetings: ScheduledMeeting[],
  newTime: number,
  npcs: NPC[],
  registry: RoomRegistry,
): ScheduledMeeting[] {
  const live = currentMeetings.filter(m => newTime < m.endTime);
  const assignedIds = new Set(live.flatMap(m => m.attendeeIds));

  for (const roomId of MEETING_RULES.roomIds) {
    if (live.some(m => m.roomId === roomId)) continue;
    const boundary = Math.ceil(newTime / MEETING_RULES.boundaryInterval) * MEETING_RULES.boundaryInterval;
    if (boundary + MEETING_RULES.durations[0] > SIM_CONFIG.WORK_DAY_END) continue;

    const duration = MEETING_RULES.durations[Math.floor(Math.random() * MEETING_RULES.durations.length)];
    const available = npcs.filter(n =>
      n.npcType === 'EMPLOYEE' &&
      n.state !== NPCState.AWAY &&
      n.state === NPCState.WORKING &&
      registryGetRoom(registry, n.id)?.startsWith('DESK') &&
      !assignedIds.has(n.id)
    );

    const count = MEETING_RULES.attendeesMin +
      Math.floor(Math.random() * (MEETING_RULES.attendeesMax - MEETING_RULES.attendeesMin + 1));
    const picked = [...available].sort(() => Math.random() - 0.5).slice(0, count);

    if (picked.length >= MEETING_RULES.attendeesMin) {
      const meeting: ScheduledMeeting = {
        roomId, startTime: boundary, endTime: boundary + duration,
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
// JANITORIAL SYSTEM
// ============================================================================

let workOrderCounter = 0;

function updateRestroomStatuses(
  statuses: RestroomStatus[],
  events: SimEvent[],
  workOrders: WorkOrder[],
  predictiveMode: boolean,
  newTime: number,
  newEvents: SimEvent[],
): { statuses: RestroomStatus[]; workOrders: WorkOrder[] } {
  const updated = statuses.map(s => ({ ...s }));
  const updatedOrders = [...workOrders];

  // Count ENTER events for restrooms
  for (const e of events) {
    if (e.type === 'ENTER') {
      const status = updated.find(s => s.roomId === e.restroomId);
      if (status) status.usageCount++;
    }
  }

  if (predictiveMode) {
    // Create work orders when threshold is hit
    for (const status of updated) {
      if (status.usageCount >= JANITORIAL_RULES.cleaningThreshold && !status.isBeingCleaned) {
        const hasOrder = updatedOrders.some(wo =>
          wo.restroomId === status.roomId && (wo.status === 'PENDING' || wo.status === 'IN_PROGRESS')
        );
        if (!hasOrder) {
          const wo: WorkOrder = {
            id: `WO-${++workOrderCounter}`,
            restroomId: status.roomId,
            createdAt: newTime,
            status: 'PENDING',
          };
          updatedOrders.push(wo);
          newEvents.push({ type: 'WORK_ORDER_CREATED', restroomId: status.roomId, npcId: 'JAN-01', timestamp: newTime });
        }
      }
    }
  }

  return { statuses: updated, workOrders: updatedOrders };
}

function checkScheduledCleaning(
  workOrders: WorkOrder[],
  newTime: number,
  prevTime: number,
  newEvents: SimEvent[],
): WorkOrder[] {
  const updated = [...workOrders];
  // Trigger at scheduled time — check if we just crossed the boundary
  if (prevTime < JANITORIAL_RULES.scheduledCleanTime && newTime >= JANITORIAL_RULES.scheduledCleanTime) {
    for (const roomId of JANITORIAL_RULES.restroomIds) {
      const hasOrder = updated.some(wo =>
        wo.restroomId === roomId && (wo.status === 'PENDING' || wo.status === 'IN_PROGRESS')
      );
      if (!hasOrder) {
        const wo: WorkOrder = {
          id: `WO-${++workOrderCounter}`,
          restroomId: roomId,
          createdAt: newTime,
          status: 'PENDING',
        };
        updated.push(wo);
        newEvents.push({ type: 'WORK_ORDER_CREATED', restroomId: roomId, npcId: 'JAN-01', timestamp: newTime });
      }
    }
  }
  return updated;
}

function processJanitorNPC(
  npc: NPC,
  registry: RoomRegistry,
  roomsById: Map<string, Room>,
  workOrders: WorkOrder[],
  restroomStatuses: RestroomStatus[],
  ctx: TickContext,
  events: SimEvent[],
  flashes: Map<string, { color: 'green' | 'red'; timer: number }>,
): NPC {
  const n: NPC = { ...npc, path: [...npc.path] };
  const currentRoomId = registryGetRoom(registry, n.id);

  // --- CLEANING: wait for leaveTime ---
  if (n.state === NPCState.CLEANING) {
    if (n.leaveTime != null && ctx.newTime >= n.leaveTime) {
      // Done cleaning — exit room
      const room = currentRoomId ? roomsById.get(currentRoomId) : undefined;
      if (room) {
        // Mark cleaning complete
        const status = restroomStatuses.find(s => s.roomId === currentRoomId);
        if (status) {
          status.usageCount = 0;
          status.lastCleanedAt = ctx.newTime;
          status.isBeingCleaned = false;
        }
        const wo = workOrders.find(w => w.restroomId === currentRoomId && w.status === 'IN_PROGRESS');
        if (wo) wo.status = 'COMPLETED';
        events.push({ type: 'CLEANING_COMPLETED', restroomId: currentRoomId!, npcId: n.id, timestamp: ctx.newTime });
        flashes.set(currentRoomId!, { color: 'green', timer: 1000 });

        // Walk to door to exit
        n.targetRoomId = currentRoomId;
        n.targetX = room.door.x;
        n.targetY = room.door.y;
        n.state = NPCState.WALKING;
        n.leaveTime = undefined;
        n.path = findPath({ x: n.x, y: n.y }, room.door);
      }
    }
    n.currentRoomId = registryGetRoom(registry, n.id);
    return n;
  }

  // --- WALKING ---
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

    if (n.path.length === 0 && n.targetRoomId) {
      const target = roomsById.get(n.targetRoomId);
      if (target) {
        n.x = target.door.x; n.y = target.door.y;

        if (currentRoomId === n.targetRoomId) {
          // Exiting a room (restroom after cleaning, or closet)
          registryExit(registry, n.id);
          n.targetRoomId = undefined;

          // Check for next pending work order
          const nextWo = workOrders.find(w => w.status === 'PENDING');
          if (nextWo) {
            sendToRoom(n, nextWo.restroomId, roomsById);
          } else {
            // Return to closet
            sendToRoom(n, JANITORIAL_RULES.janitorClosetId, roomsById);
          }
        } else {
          // Entering a room
          if (target.type === RoomType.RESTROOM_GN || target.type === RoomType.RESTROOM_FAM) {
            // Only enter if restroom is empty (wait at door if occupied)
            if (registryOccupancy(registry, target.id) === 0) {
              if (currentRoomId) registryExit(registry, n.id);
              registryEnter(registry, n.id, target.id);
              n.targetRoomId = undefined;
              n.state = NPCState.CLEANING;
              n.leaveTime = ctx.newTime + JANITORIAL_RULES.cleaningDuration;

              const status = restroomStatuses.find(s => s.roomId === target.id);
              if (status) status.isBeingCleaned = true;
              const wo = workOrders.find(w => w.restroomId === target.id && w.status === 'PENDING');
              if (wo) wo.status = 'IN_PROGRESS';

              events.push({ type: 'CLEANING_STARTED', restroomId: target.id, npcId: n.id, timestamp: ctx.newTime });

              const pad = 0.8;
              n.x = target.x + pad + Math.random() * (target.width - pad * 2);
              n.y = target.y + pad + Math.random() * (target.height - pad * 2);
            }
            // else: stay at door, wait — path is empty so we'll check again next tick
          } else if (target.type === RoomType.JANITOR_CLOSET) {
            if (currentRoomId) registryExit(registry, n.id);
            registryEnter(registry, n.id, target.id);
            n.targetRoomId = undefined;
            n.state = NPCState.IDLE;
          }
        }
      }
    }

    n.currentRoomId = registryGetRoom(registry, n.id);
    return n;
  }

  // --- IDLE: check for pending work orders ---
  if (n.state === NPCState.IDLE) {
    const nextWo = workOrders.find(w => w.status === 'PENDING');
    if (nextWo) {
      if (currentRoomId) registryExit(registry, n.id);
      sendToRoom(n, nextWo.restroomId, roomsById);
    }
  }

  n.currentRoomId = registryGetRoom(registry, n.id);
  return n;
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

function findAvailableRestroom(
  reg: RoomRegistry,
  roomsById: Map<string, Room>,
  restroomStatuses: RestroomStatus[],
): string | null {
  const restrooms = Array.from(roomsById.values()).filter(r =>
    (r.type === RoomType.RESTROOM_GN || r.type === RoomType.RESTROOM_FAM) &&
    registryOccupancy(reg, r.id) < (r.capacity || 5) &&
    !restroomStatuses.find(s => s.roomId === r.id)?.isBeingCleaned
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
  restroomStatuses: RestroomStatus[],
  ctx: TickContext,
): string {
  // Guests don't go to all-hands or meetings, don't have a desk
  if (npc.npcType === 'GUEST') {
    if (npc.restroomUrgency > 0.8) {
      const r = findAvailableRestroom(reg, roomsById, restroomStatuses);
      if (r) return r;
    }
    // Wander to a random common area
    const common = ['CAF-001', 'BREAK-001'];
    return common[Math.floor(Math.random() * common.length)];
  }

  if (ctx.isAllHandsTime) return 'AUD-001';
  if (npc.restroomUrgency > 0.8) {
    const r = findAvailableRestroom(reg, roomsById, restroomStatuses);
    if (r) return r;
  }
  const meeting = findActiveMeetingForNPC(meetings, npc.id, ctx.newTime);
  if (meeting) return meeting.roomId;
  return getDeskIdForNPC(npc.id);
}

// ============================================================================
// PROCESS SINGLE EMPLOYEE NPC
// ============================================================================

function processNPC(
  npc: NPC,
  registry: RoomRegistry,
  roomsById: Map<string, Room>,
  meetings: ScheduledMeeting[],
  restroomStatuses: RestroomStatus[],
  ctx: TickContext,
  events: SimEvent[],
  flashes: Map<string, { color: 'green' | 'red'; timer: number }>,
): NPC {
  const n: NPC = { ...npc, path: [...npc.path] };

  // --- 0. AWAY state: check if it's time to arrive ---
  if (n.state === NPCState.AWAY) {
    // Only spawn if we're within the work window: arrived but not yet departed
    const shouldBeInBuilding =
      n.arrivalTime != null &&
      ctx.newTime >= n.arrivalTime &&
      (n.departureTime == null || ctx.newTime < n.departureTime);

    if (shouldBeInBuilding) {
      n.x = LIFECYCLE_RULES.entryPoint.x;
      n.y = LIFECYCLE_RULES.entryPoint.y;
      n.isExiting = false;
      const deskId = getDeskIdForNPC(n.id);
      sendToRoom(n, deskId, roomsById);
    }
    n.currentRoomId = registryGetRoom(registry, n.id);
    return n;
  }

  const currentRoomId = registryGetRoom(registry, n.id);
  const currentRoom = currentRoomId ? roomsById.get(currentRoomId) : undefined;
  const isInNonDeskRoom = currentRoomId != null && !currentRoomId.startsWith('DESK');

  // --- 1. Urgency ---
  n.restroomUrgency += ctx.deltaMins / 144;

  // --- 1.5. Check departure time (employees) ---
  if (!n.isExiting && n.departureTime != null && ctx.newTime >= n.departureTime) {
    // Leave current room first, then head to exit
    if (isInNonDeskRoom && currentRoom && n.state !== NPCState.WALKING) {
      n.targetRoomId = currentRoomId;
      n.targetX = currentRoom.door.x;
      n.targetY = currentRoom.door.y;
      n.state = NPCState.WALKING;
      n.leaveTime = undefined;
      n.isExiting = true;
      n.path = findPath({ x: n.x, y: n.y }, currentRoom.door);
    } else if ((n.state === NPCState.WORKING || n.state === NPCState.IDLE)) {
      // At desk or idle — head straight to exit
      if (currentRoomId) registryExit(registry, n.id);
      n.isExiting = true;
      n.targetRoomId = undefined;
      n.targetX = LIFECYCLE_RULES.entryPoint.x;
      n.targetY = LIFECYCLE_RULES.entryPoint.y;
      n.state = NPCState.WALKING;
      n.path = findPath({ x: n.x, y: n.y }, LIFECYCLE_RULES.entryPoint);
    }
  }

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

          // If exiting the building, head to entry point (don't route to another room)
          if (n.isExiting) {
            n.targetX = LIFECYCLE_RULES.entryPoint.x;
            n.targetY = LIFECYCLE_RULES.entryPoint.y;
            n.state = NPCState.WALKING;
            n.path = findPath({ x: n.x, y: n.y }, LIFECYCLE_RULES.entryPoint);
          } else {
            const dest = decidePostExitDestination(n, registry, roomsById, meetings, restroomStatuses, ctx);
            sendToRoom(n, dest, roomsById);
          }

        } else if (currentRoomId == null || currentRoomId.startsWith('DESK')) {
          // ── ENTER ──
          // Meeting room: only enter if meeting still active
          if (target.type === RoomType.MEETING_ROOM) {
            const activeMeeting = findActiveMeetingForRoom(meetings, target.id, ctx.newTime);
            if (!activeMeeting) {
              sendToRoom(n, getDeskIdForNPC(n.id), roomsById);
              n.currentRoomId = registryGetRoom(registry, n.id);
              return n;
            }
          }

          // Restroom: don't enter if being cleaned
          if (target.type === RoomType.RESTROOM_GN || target.type === RoomType.RESTROOM_FAM) {
            const status = restroomStatuses.find(s => s.roomId === target.id);
            if (status?.isBeingCleaned) {
              // Try the other restroom, or go to desk
              const alt = findAvailableRestroom(registry, roomsById, restroomStatuses);
              if (alt) {
                sendToRoom(n, alt, roomsById);
              } else {
                sendToRoom(n, getDeskIdForNPC(n.id), roomsById);
              }
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
      if (n.isExiting) {
        // Arrived at exit — despawn
        if (currentRoomId) registryExit(registry, n.id);
        n.state = NPCState.AWAY;
        n.x = -100; n.y = -100;
        n.isExiting = false;
        n.currentRoomId = undefined;
        return n;
      }
      n.state = NPCState.IDLE;
    }
  }

  // --- 4. Desk decisions ---
  if (n.state === NPCState.WORKING && registryGetRoom(registry, n.id)?.startsWith('DESK')) {
    let dest: string | null = null;

    if (ctx.isAllHandsTime) {
      dest = 'AUD-001';
    } else if (n.restroomUrgency > 0.8) {
      dest = findAvailableRestroom(registry, roomsById, restroomStatuses);
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
    if (n.npcType === 'GUEST') {
      // Guests: wander to a random common area (cafeteria or lounge)
      const common = ['CAF-001', 'BREAK-001'];
      const dest = common[Math.floor(Math.random() * common.length)];
      sendToRoom(n, dest, roomsById);
    } else {
      sendToRoom(n, getDeskIdForNPC(n.id), roomsById);
    }
  }

  // --- 5b. Guest wandering decision (when "working"/idle in a common area done) ---
  // (No-op — handled via the state machine. Guests stay in EATING state until leaveTime.)

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
  eventHistory: SimEvent[] = [],
): { nextState: SimState; events: SimEvent[] } {
  if (state.isResetting) return { nextState: state, events: [] };

  const deltaMins = (deltaTime / 1000 / 60) * state.speedMultiplier;
  const newTime = state.time + deltaMins;

  if (newTime >= SIM_CONFIG.WORK_DAY_END) {
    return { nextState: { ...state, isResetting: true, time: SIM_CONFIG.WORK_DAY_END }, events: [] };
  }

  const registry = buildRegistry(state.npcs, state.rooms.map(r => r.id));
  const roomsById = new Map(state.rooms.map(r => [r.id, r]));

  const isAllHandsTime =
    newTime >= SIM_CONFIG.ALL_HANDS_TIME &&
    newTime < SIM_CONFIG.ALL_HANDS_TIME + SIM_CONFIG.ALL_HANDS_DURATION;

  const ctx: TickContext = { newTime, deltaMins, deltaTime, speedMultiplier: state.speedMultiplier, isAllHandsTime };

  // 1. Schedule meetings
  const updatedMeetings = scheduleMeetings(state.meetings, newTime, state.npcs, registry);

  // 2. Scheduled cleaning check (non-predictive mode)
  let workOrders = state.workOrders;
  const collectedEvents: SimEvent[] = [];
  if (!state.predictiveMode) {
    workOrders = checkScheduledCleaning(workOrders, newTime, state.time, collectedEvents);
  }

  const flashUpdates = new Map<string, { color: 'green' | 'red'; timer: number }>();

  // Mutable copy of restroom statuses for janitor to update
  const mutableStatuses = state.restroomStatuses.map(s => ({ ...s }));
  const mutableOrders = [...workOrders];

  // 3. Process all NPCs
  let updatedNPCs = state.npcs.map(npc => {
    if (npc.npcType === 'JANITOR') {
      return processJanitorNPC(npc, registry, roomsById, mutableOrders, mutableStatuses, ctx, collectedEvents, flashUpdates);
    }
    return processNPC(npc, registry, roomsById, updatedMeetings, mutableStatuses, ctx, collectedEvents, flashUpdates);
  });

  // 3b. Remove guests that have departed (AWAY after arriving)
  updatedNPCs = updatedNPCs.filter(n => !(n.npcType === 'GUEST' && n.state === NPCState.AWAY));

  // 3c. Spawn new guests (during guest window, under cap, random probability)
  if (newTime >= LIFECYCLE_RULES.guestWindowStart && newTime < LIFECYCLE_RULES.guestWindowEnd) {
    const guestCount = updatedNPCs.filter(n => n.npcType === 'GUEST').length;
    const spawnChance = LIFECYCLE_RULES.guestSpawnProbability * state.speedMultiplier;
    if (guestCount < LIFECYCLE_RULES.maxGuests && Math.random() < spawnChance) {
      updatedNPCs.push(createGuestNPC(newTime));
    }
  }

  // 4. Update restroom statuses from ENTER events (reactive work orders)
  const { statuses: finalStatuses, workOrders: reactiveOrders } = updateRestroomStatuses(
    mutableStatuses, collectedEvents, mutableOrders, state.predictiveMode, newTime, collectedEvents
  );

  // 5. Predictions and pre-emptive work orders (predictive mode only)
  let finalPredictions: RestroomPrediction[] = [];
  let finalOrders = reactiveOrders;

  if (state.predictiveMode) {
    // Combine accumulated history with this tick's events for the most up-to-date view
    const allEvents = [...eventHistory, ...collectedEvents];
    finalPredictions = computePredictions(finalStatuses, allEvents, newTime);
    finalOrders = maybeCreatePreemptiveWorkOrders(
      finalPredictions, finalOrders, finalStatuses, newTime, collectedEvents
    );
  }

  if (!registryValidate(registry)) {
    console.error('REGISTRY VALIDATION FAILED at time', newTime);
  }

  // Emit OCCUPANCY_COUNT event when employee/guest counts change
  const prevEmployees = state.npcs.filter(n => n.npcType === 'EMPLOYEE' && n.state !== NPCState.AWAY).length;
  const prevGuests = state.npcs.filter(n => n.npcType === 'GUEST' && n.state !== NPCState.AWAY).length;
  const currEmployees = updatedNPCs.filter(n => n.npcType === 'EMPLOYEE' && n.state !== NPCState.AWAY).length;
  const currGuests = updatedNPCs.filter(n => n.npcType === 'GUEST' && n.state !== NPCState.AWAY).length;

  if (currEmployees !== prevEmployees || currGuests !== prevGuests) {
    collectedEvents.push({
      type: 'OCCUPANCY_COUNT',
      restroomId: 'OFFICE',
      npcId: '',
      timestamp: newTime,
      employeeCount: currEmployees,
      guestCount: currGuests,
    });
  }

  // Build final rooms with labels showing usage count
  const finalRooms = state.rooms.map(room => {
    let flashTimer = Math.max(0, (room.flashTimer || 0) - deltaTime);
    let flashColor: Room['flashColor'] = flashTimer > 0 ? room.flashColor ?? null : null;
    const flash = flashUpdates.get(room.id);
    if (flash) { flashColor = flash.color; flashTimer = flash.timer; }

    const count = registryOccupancy(registry, room.id);
    const baseLabel = (room.label || '').split(' (')[0].split(' [')[0];

    // Build label with occupancy and usage counter for restrooms
    let label = count > 0 ? `${baseLabel} (${count})` : baseLabel;
    const status = finalStatuses.find(s => s.roomId === room.id);
    if (status) {
      label += ` [${status.usageCount}/${JANITORIAL_RULES.cleaningThreshold}]`;
    }

    return {
      ...room,
      occupancy: Array.from(registry.roomToNpcs.get(room.id) || []),
      flashColor, flashTimer, label,
    };
  });

  return {
    nextState: {
      ...state,
      time: newTime,
      npcs: updatedNPCs,
      rooms: finalRooms,
      meetings: updatedMeetings,
      workOrders: finalOrders,
      restroomStatuses: finalStatuses,
      predictions: finalPredictions,
    },
    events: collectedEvents,
  };
}
