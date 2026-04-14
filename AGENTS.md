# Simulation Rules & Configuration

This file tracks the core behavioral rules and configurations for the Mapped Office Simulator.

## Restroom Usage
- **Frequency**: Each NPC uses the restroom approximately 5 times per day (urgency increases linearly; triggers at 80%).
- **Duration**: Restroom visits last between 3 and 10 minutes.
- **Capacity**: Restrooms have a maximum capacity of 5 people.
- **Visuals**: Restrooms flash green on entry and red on exit. Labels show live occupancy count.
- **Entry/Exit**: NPCs must walk to the room's door to enter or leave. Occupancy is tracked by the RoomRegistry.

## Meeting Behavior
- **Continuous scheduling**: Meeting rooms are always in use. When a room becomes available, the next meeting is automatically scheduled.
- **Start times**: Meetings always start on 5-minute calendar boundaries (e.g., 9:00, 9:05, 9:10, 10:15).
- **Attendees**: 2–4 randomly selected NPCs who are currently at their desk and not assigned to another meeting.
- **Duration**: Each meeting is randomly either 5 minutes or 15 minutes.
- **Priority**: Meetings are lower priority than restroom urgency and all-hands events. NPCs will skip a meeting if they need to use the restroom.
- **Late arrivals**: If a meeting ends while an assigned NPC is still walking to the room, they redirect to their desk.

## All-Hands Meetings
- **Schedule**: Tuesdays and Thursdays (day % 7 === 2 or 4) at 1:00 PM.
- **Duration**: 10 minutes.
- **Location**: Auditorium (AUD-001).
- **Attendance**: All NPCs. Interrupts restroom visits, eating, and regular meetings.

## Lounge / Cafeteria
- **Frequency**: Very low random probability (`0.000001 * speedMultiplier` per NPC per tick).
- **Duration**: 5–15 minutes per visit.
- **Priority**: Lowest — only happens when NPC has no meeting, no restroom urgency, and no all-hands.

## NPC Decision Priority (highest to lowest)
1. All-hands meeting (if it's all-hands time)
2. Restroom (if urgency > 80%)
3. Assigned meeting (if an active meeting lists this NPC)
4. Random lounge/cafeteria break
5. Stay at desk (default)

## Occupancy Tracking Architecture
- **RoomRegistry**: Single source of truth. Maintains `npcToRoom` (NPC → Room) and `roomToNpcs` (Room → Set of NPCs).
- **Atomic transitions**: All enter/exit operations go through `registryEnter()` and `registryExit()`. `registryEnter` always calls `registryExit` first to prevent double-counting.
- **Door rule**: NPCs must physically walk to a room's door to enter or exit. No teleporting between rooms.
- **Sync**: `NPC.currentRoomId` is read-only — synced from the registry at the end of each simulation tick.
- **Validation**: `registryValidate()` cross-checks both maps at the end of every tick.

## Meeting Scheduler Architecture
- **Config**: `MEETING_RULES` in `engine.ts` — `attendeesMin`, `attendeesMax`, `durations`, `boundaryInterval`, `roomIds`.
- **Lifecycle**: `scheduleMeetings()` runs at the start of each tick, before NPC processing.
  1. Removes expired meetings (`time >= endTime`).
  2. For each room without an active/upcoming meeting, schedules one at the next 5-min boundary.
  3. Picks random available NPCs (at desk, not assigned elsewhere).
- **State**: `ScheduledMeeting { roomId, startTime, endTime, attendeeIds }` stored in `SimState.meetings[]`.
- **Active check**: A meeting is active when `time >= startTime && time < endTime`.

## Office Layout
- **Grid Size**: 40x40 isometric grid.
- **Zones**:
    - **Central Core**: Restrooms A & B.
    - **North/South Wings**: Employee desks (10 each, 20 total).
    - **East Wing**: Cafeteria and Lounge.
    - **West Wing**: Meeting Rooms A & B, Auditorium.

## Graphics & UI
- **Visual Style**: High-definition isometric with realistic floor textures (wood, tile, carpet).
- **NPCs**: Dynamic sprites with direction-facing eyes and urgency indicators.
- **Controls**: Settings panel for population and speed; "Skip to All-Hands" feature.
- **Logs**: Real-time event log for restroom entry/exit activity.
