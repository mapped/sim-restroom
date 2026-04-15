# Simulation Rules & Configuration

This file tracks the core behavioral rules and configurations for the Mapped Office Simulator.

## Restroom Usage

- **Frequency**: Each NPC uses the restroom approximately 5 times per day (urgency increases linearly; triggers at 80%).
- **Duration**: Restroom visits last between 3 and 10 minutes.
- **Capacity**: Restrooms have a maximum capacity of 5 people.
- **Visuals**: Restrooms flash green on entry and red on exit. Labels show live occupancy and usage counter `[N/20]`.
- **Entry/Exit**: NPCs must walk to the room's door to enter or leave. Occupancy is tracked by the RoomRegistry.

## Janitorial System

### Predictive Mode (default)

- **Threshold**: After 20 uses (ENTER events), a work order is created for JAN-01.
- **Dirty indicator**: After 25 uses without cleaning, a sad face emoji appears on the restroom floor.
- **Behavior**: Janitor walks from the Janitor Closet to the restroom, waits at the door until the last person exits, then enters and cleans.

### Scheduled Mode

- **Fixed time**: Work orders are created for all restrooms at 5:00 PM regardless of usage count.
- **Same cleaning behavior**: Janitor walks to restroom, waits for empty, cleans.
- **Demonstrates the problem**: Restrooms may get very dirty before 5 PM, especially after high-traffic events like all-hands.

### Cleaning Process

- **Duration**: 5 minutes.
- **Room blocked**: No one can enter a restroom while it's being cleaned (`isBeingCleaned` flag).
- **Visual**: Room turns red during cleaning. Janitor shows broom emoji.
- **Completion**: Usage counter resets to 0. `CLEANING_COMPLETED` event logged.

### Janitor NPC (JAN-01)

- **Home base**: Janitor Closet at grid (2, 36), below Meeting Room B.
- **Visual**: Green uniform with white apron stripe and green hat.
- **Behavior**: IDLE at closet → picks up PENDING work order → walks to restroom → waits at door → enters and cleans → walks back to closet → picks up next order.
- **Sequential**: One janitor handles both restrooms. Orders are queued.

### Work Orders

- **Created by**: `updateRestroomStatuses()` (predictive) or `checkScheduledCleaning()` (scheduled).
- **Statuses**: `PENDING` → `IN_PROGRESS` → `COMPLETED`.
- **Events**: `WORK_ORDER_CREATED`, `CLEANING_STARTED`, `CLEANING_COMPLETED` logged to event log.

## Meeting Behavior

- **Continuous scheduling**: Meeting rooms are always in use. When a room becomes available, the next meeting is automatically scheduled.
- **Start times**: Meetings always start on 5-minute calendar boundaries (e.g., 9:00, 9:05, 9:10, 10:15).
- **Attendees**: 2–4 randomly selected NPCs who are currently at their desk and not assigned to another meeting.
- **Duration**: Each meeting is randomly either 5 minutes or 15 minutes.
- **Priority**: Meetings are lower priority than restroom urgency and all-hands events.
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
- **Atomic transitions**: All enter/exit operations go through `registryEnter()` and `registryExit()`.
- **Door rule**: NPCs must physically walk to a room's door to enter or exit.
- **Sync**: `NPC.currentRoomId` is read-only — synced from the registry at the end of each simulation tick.
- **Validation**: `registryValidate()` cross-checks both maps at the end of every tick.

## Configuration Constants

- **`SIM_CONFIG`**: restroom duration, work hours, all-hands timing, lounge probability
- **`MEETING_RULES`**: attendee count, durations, boundary interval, room IDs
- **`JANITORIAL_RULES`**: cleaningThreshold (20), dirtyThreshold (25), cleaningDuration (5 min), scheduledCleanTime (1020 / 5 PM), janitorClosetId, restroomIds

## Office Layout

- **Grid Size**: 40x40 isometric grid.
- **Zones**:
  - **Central Core**: Restrooms A & B.
  - **North/South Wings**: Employee desks (10 each, 20 total).
  - **East Wing**: Cafeteria and Lounge.
  - **West Wing**: Meeting Rooms A & B, Auditorium, Janitor Closet.
