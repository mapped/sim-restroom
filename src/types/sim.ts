
export type Point = { x: number; y: number };

export enum RoomType {
  DESK = 'DESK',
  CAFETERIA = 'CAFETERIA',
  AUDITORIUM = 'AUDITORIUM',
  RESTROOM_GN = 'RESTROOM_GN', // Gender Neutral
  RESTROOM_FAM = 'RESTROOM_FAM', // Family
  MEETING_ROOM = 'MEETING_ROOM',
  BREAK_AREA = 'BREAK_AREA',
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
  BREAK = 'BREAK'
}

export interface NPC {
  id: string;
  name: string;
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

export interface SimState {
  time: number; // minutes from midnight
  day: number;
  npcs: NPC[];
  rooms: Room[];
  meetings: ScheduledMeeting[];
  speedMultiplier: number;
  isResetting: boolean;
}

export type SimEvent = {
  type: 'ENTER' | 'EXIT';
  restroomId: string;
  npcId: string;
  timestamp: number;
};
