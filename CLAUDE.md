# CLAUDE.md — Project Guide for AI Assistants

## What This Project Is

An isometric office simulator that demos how **traffic sensors in restrooms** can enable predictive maintenance instead of traditional schedule-based cleaning. Built for Mapped (mapped.com) as a sales/demo tool. Originally scaffolded in Google AI Studio, then heavily reworked.

## Commands

```bash
npm run dev       # Start Vite dev server on localhost:3000 (HMR enabled)
npm run build     # Production build to dist/
npm run lint      # TypeScript type-check (tsc --noEmit)
npm test          # Run Playwright tests (12 tests, uses Chromium)
npm run test:ui   # Playwright interactive UI mode
```

## Architecture Overview

### Rendering: Canvas-based isometric projection

The entire floor plan is drawn on a single `<canvas>` element using 2D context. There is no DOM for rooms or NPCs — everything is pixel-rendered each frame.

- `project(x, y)` converts grid coordinates to isometric screen coordinates
- `computeViewBounds()` calculates the bounding box of all projected rooms and auto-fits/scales the canvas so every room is visible regardless of screen width
- The canvas height is dynamic (derived from bounds), not hardcoded
- Rooms are drawn back-to-front: floor → floor pattern → walls → furniture → labels
- NPCs are drawn after all rooms

### State Management: React useState + requestAnimationFrame

The simulation loop runs via `requestAnimationFrame` in `App.tsx`. Each frame:
1. `setState(prev => updateSimulation(prev, deltaTime))` produces the next state
2. Events are collected in a ref and dispatched outside setState (avoids React double-invocation duplicates)
3. Canvas re-renders on every state change via useEffect

There is no external state library. All state lives in `SimState`.

### RoomRegistry: The Critical Invariant

**The #1 architectural decision**: Room occupancy and NPC location are managed by a `RoomRegistry` that is rebuilt from NPC state each tick. This was the result of multiple iterations to fix occupancy count drift.

Rules:
- `registryEnter()` and `registryExit()` are the ONLY way to change room assignments
- `registryEnter` always calls `registryExit` first (prevents double-counting)
- NPCs must physically walk to a room's door to enter/exit — no teleporting
- `NPC.currentRoomId` is read-only — synced FROM the registry at the end of each tick
- `registryValidate()` cross-checks both maps every tick and logs errors
- Room occupancy counts displayed in labels are derived from the registry, not stored separately

**Why this matters**: Earlier versions had occupancy tracked in multiple places (room.occupancy array, a separate ref counter, NPC.currentRoomId). These drifted out of sync when state transitions were interrupted (e.g., all-hands interrupting a restroom visit). The registry pattern eliminates this class of bug entirely.

### NPC State Machine

Each NPC is processed in 6 phases per tick (see `processNPC()` in engine.ts):
1. **Update urgency** — restroom need increases linearly
2. **Should leave?** — if in a non-desk room and timer expired or higher-priority event
3. **Movement** — walk along BFS path; handle door enter/exit transitions
4. **Desk decisions** — check for assigned meetings, restroom urgency, random break
5. **IDLE recovery** — if stuck, route back to desk
6. **Sync** — write registry state back to NPC.currentRoomId

Decision priority: All-hands > Restroom (urgency > 80%) > Assigned meeting > Random break > Stay at desk

### Meeting Scheduler

`scheduleMeetings()` runs at the start of each tick, before NPC processing:
1. Removes expired meetings
2. For each room with no active/upcoming meeting, schedules one at the next 5-min boundary
3. Picks 2-4 random available NPCs (at desk, not assigned elsewhere)
4. Durations are randomly 5 or 15 minutes

Config lives in `MEETING_RULES` at the top of engine.ts. All tunables (attendee count, durations, boundary interval, room IDs) are in one place.

### Janitorial / Work Order System

The core demo feature. Two modes controlled by a live toggle (`predictiveMode` in SimState):

**Predictive mode** (default): `updateRestroomStatuses()` counts ENTER events per restroom. At 20 uses, creates a `WorkOrder` (PENDING). At 25 uses without cleaning, a sad face emoji renders on the floor.

**Scheduled mode**: `checkScheduledCleaning()` creates work orders for all restrooms at 5:00 PM regardless of usage.

**Janitor NPC** (`processJanitorNPC()`): Completely separate from `processNPC()`. State machine:
- IDLE at closet → picks oldest PENDING work order → walks to restroom
- At door: waits until `registryOccupancy() === 0` (does NOT enter while occupied)
- Enters → sets `isBeingCleaned = true` on RestroomStatus → CLEANING state for 5 min
- Done → resets usageCount, sets `isBeingCleaned = false` → walks back to closet

**Blocking**: `isBeingCleaned` on `RestroomStatus` is checked in `findAvailableRestroom()` and the `processNPC()` ENTER guard. Regular NPCs are redirected to the other restroom or their desk.

Config lives in `JANITORIAL_RULES` at the top of engine.ts.

### Event System

`updateSimulation()` returns `{ nextState, events }`. Event types: `ENTER`, `EXIT`, `WORK_ORDER_CREATED`, `CLEANING_STARTED`, `CLEANING_COMPLETED`. They are dispatched outside the React setState updater via a `pendingEventsRef` (overwrite, not append) to prevent duplicates from React's double-invocation in StrictMode.

## Key Files

| File | Purpose |
|------|---------|
| `src/simulation/engine.ts` | Core engine: RoomRegistry, NPC processing, janitor processing, meeting scheduler, work order system, pathfinding, all config |
| `src/types/sim.ts` | All TypeScript interfaces: NPC, Room, SimState, ScheduledMeeting, WorkOrder, RestroomStatus, SimEvent |
| `src/App.tsx` | React app shell: animation loop, state init, reset handlers, predictive toggle, layout |
| `src/components/Simulator/Canvas.tsx` | Isometric canvas renderer with auto-fit bounds, cleaning overlays, sad face, janitor visuals |
| `src/components/Simulator/Controls.tsx` | Settings panel, cleaning mode toggle, restroom status bars, event log |
| `AGENTS.md` | Simulation rules documentation (restroom, janitorial, meetings, all-hands, priorities) |

## Import Convention

All imports use the `@/` alias which resolves to `src/`. No relative imports (`../`). Configured in both `vite.config.ts` and `tsconfig.json`.

## UI Decisions

- **No app header** — the floor plan starts at the top of the page for maximum canvas space
- **Time/day overlay** — positioned absolute on the canvas (top-right white space area, `top-[8%] right-[4%]`)
- **White background** — page and canvas are both white, seamless
- **Canvas auto-sizing** — height derived from projected room bounds; scales down on narrow screens
- **Day reset overlay** — white background with dark text (matches white theme)

## Testing

Playwright tests in `tests/app.spec.ts` (12 tests):
- Page loads without console errors
- Time/day overlay visible
- Canvas rendered with content
- All controls present and interactive
- Cleaning mode toggle (PREDICTIVE / SCHEDULED)
- Restroom status panel with usage counters
- Scheduled mode toggle works (shows "cleaning at 5:00 PM daily")
- White background, full-page screenshot regression

Snapshot baseline: `tests/app.spec.ts-snapshots/full-page-chromium-darwin.png`

Run `npm test -- --update-snapshots` after intentional visual changes.

## Common Pitfalls

- **Never modify `NPC.currentRoomId` directly** — always go through registryEnter/registryExit
- **Never track occupancy separately** — derive it from the registry. Earlier attempts with `occupancyRef` counters and `room.occupancy` arrays drifted.
- **Events inside setState** — React can call setState updaters multiple times. Use the `pendingEventsRef` overwrite pattern, never append inside the updater.
- **Canvas translate offset** — don't hardcode. Use `computeViewBounds()` to calculate from actual room positions.
- **`targetX` is for movement only** — earlier code overloaded it as a leave timer. Use `NPC.leaveTime` instead.
- **Desk ID lookup** — NPC-0 maps to DESK-001 (index + 1). Use `getDeskIdForNPC()` everywhere.
- **Janitor is separate from regular NPCs** — `processJanitorNPC()` is a completely different function, not a branch in `processNPC()`. The janitor has fundamentally different behavior (waiting at doors, sequential work orders).
- **`isBeingCleaned` blocks entry, not capacity** — Restrooms have capacity 5, so the janitor alone doesn't fill them. The `isBeingCleaned` flag on `RestroomStatus` is the authoritative block, checked in `findAvailableRestroom()` and the NPC ENTER guard.
- **Predictive toggle is live** — changing `predictiveMode` does not require a restart. Existing pending work orders remain.

## Origin

Initially created in Google AI Studio with Gemini. The scaffold included unused dependencies (@google/genai, express, dotenv) and a root-level components/ directory. These were cleaned up. The simulation engine, RoomRegistry, meeting scheduler, and auto-fit canvas were all built from scratch.
