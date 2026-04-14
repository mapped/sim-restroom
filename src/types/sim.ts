
export type Point = { x: number; y: number };

export enum RoomType {
  DESK = 'DESK',
  CAFETERIA = 'CAFETERIA',
  AUDITORIUM = 'AUDITORIUM',
  RESTROOM_GN = 'RESTROOM_GN', // Gender Neutral
  RESTROOM_FAM = 'RESTROOM_FAM', // Family
  MEETING_ROOM = 'MEETING_ROOM',
  BREAK_AREA = 'BREAK_AREA',
  JANITOR_CLOSET = 'JANITOR_CLOSET',
  PATH = 'PATH'
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
  flashColor?: 'green' | 'red' | null;
  flashTimer?: number;
  door: Point; // Entry/Exit point
}

export enum NPCState {
  IDLE = 'IDLE',
  WALKING = 'WALKING',
  WORKING = 'WORKING',
  EATING = 'EATING',
  RESTROOM = 'RESTROOM',
  MEETING = 'MEETING',
  CLEANING = 'CLEANING',
  BREAK = 'BREAK'
}

export interface NPC {
  id: string;
  name: string;
  npcType?: 'EMPLOYEE' | 'JANITOR'; // defaults to EMPLOYEE
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
  currentRoomId?: string;   // Synced from RoomRegistry — read-only outside engine
  targetRoomId?: string;    // Room this NPC is walking toward
  leaveTime?: number;       // Sim-time when NPC should leave current room
  path: Point[];
}

export interface ScheduledMeeting {
  roomId: string;
  startTime: number;      // sim minutes from midnight
  endTime: number;        // sim minutes from midnight
  attendeeIds: string[];  // NPC IDs assigned to this meeting
}

export interface WorkOrder {
  id: string;              // e.g. "WO-001"
  restroomId: string;      // which restroom needs cleaning
  createdAt: number;       // sim time when created
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface RestroomStatus {
  roomId: string;
  usageCount: number;      // ENTER events since last cleaning
  lastCleanedAt: number;   // sim time of last clean completion
  isBeingCleaned: boolean; // true while janitor is cleaning
}

export interface SimState {
  time: number; // minutes from midnight
  day: number;
  npcs: NPC[];
  rooms: Room[];
  meetings: ScheduledMeeting[];
  workOrders: WorkOrder[];
  restroomStatuses: RestroomStatus[];
  predictiveMode: boolean;
  speedMultiplier: number;
  isResetting: boolean;
}

export type SimEvent = {
  type: 'ENTER' | 'EXIT' | 'WORK_ORDER_CREATED' | 'CLEANING_STARTED' | 'CLEANING_COMPLETED';
  restroomId: string;
  npcId: string;
  timestamp: number;
};
