# Mapped Restroom Sim

Isometric office simulator demonstrating how traffic sensors in restrooms can enable **predictive maintenance** instead of traditional schedule-based cleaning. Built as a demo tool for [Mapped](https://mapped.com) — the data platform for the built world.

## Demo

The simulator renders a full office floor plan with NPCs that autonomously move between desks, meeting rooms, restrooms, a cafeteria, lounge, and auditorium. Restroom visits are tracked with enter/exit events, showing how sensor data can replace schedule-based cleaning.

## Features

- **Isometric floor plan** — canvas-based renderer with auto-fit scaling
- **Restroom occupancy tracking** — real-time enter/exit event log with occupancy counts
- **Predictive vs. scheduled cleaning** — live toggle between sensor-driven work orders (threshold + forecast) and fixed 5 PM daily cleaning
- **CMMS-style work orders** — tickets pop up above the janitor closet in a format modeled on Maximo/UpKeep/Fiix/ServiceNow FSM (WO number, priority + status pills, location, reason, timestamps)
- **Meeting scheduler** — full-day schedule generated each morning; 30-min slots 9 AM–5 PM with 15/30/45/60 min durations and 85% probability of external guests
- **Meeting room hover tooltip** — hovering a meeting room surfaces that room's full day schedule with attendee/guest counts and live "NOW" marker
- **Employee lifecycle** — staggered arrivals (6–9 AM) and departures (4–6 PM) via a lobby entrance; external guests and meeting guests spawn/despawn around their windows
- **All-hands meetings** — 1 PM in the auditorium, driving predictable post-meeting restroom surges the prediction model anticipates
- **NPC behavior** — priority-based decisions: all-hands > restroom > meetings > breaks
- **RoomRegistry** — single source of truth for all room assignments, validated every tick
- **Configurable** — simulation speed (real-time / 1m/s / 5m/s), skip-to-all-hands fast-forward

## Getting Started

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with HMR (port 3000) |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | TypeScript type-check |
| `npm test` | Run Playwright tests |
| `npm run test:ui` | Playwright interactive test UI |

## Architecture

### Simulation Engine (`src/simulation/engine.ts`)

The core loop runs via `requestAnimationFrame`. Each tick:

1. **Meeting schedule** — generated once per day; meeting guests spawn ahead of meeting start
2. **Janitorial dispatch** — reactive (usage threshold), scheduled (5 PM), or predictive (forecast-driven) work orders
3. **NPC processing** — each NPC runs through a 6-phase state machine (urgency update → leave check → movement → desk decisions → idle recovery → registry sync); the janitor runs a separate state machine
4. **Registry validation** — cross-checks room↔NPC maps for consistency
5. **Room state** — occupancy labels, flash effects, all derived from the registry

### Work Orders (`src/simulation/workorder.ts`)

All work orders flow through `createWorkOrder()`, which assigns a sequential daily ID, a human-readable title + description, a reason tag (`THRESHOLD_REACHED` / `SCHEDULED_DAILY` / `PREDICTIVE_SURGE` / `PREDICTIVE_ETA`), and a priority. The factory exists as its own module so both the engine (reactive + scheduled orders) and the prediction layer (pre-emptive orders) can share it without a circular import.

### Prediction (`src/simulation/prediction.ts`)

Two-layer restroom usage forecast: a rolling-average base rate per restroom, plus a calendar-aware surge overlay for the post-all-hands window and large scheduled meetings. Pre-emptive work orders are dispatched early enough that cleaning finishes *before* the predicted surge — or, if it aligns with a meeting, *during* it while the restroom is empty.

### RoomRegistry

The central architectural pattern. A pair of synchronized maps (`npcToRoom` / `roomToNpcs`) with atomic `registryEnter()` / `registryExit()` functions. NPCs must walk to a room's door to transition — no teleporting. `NPC.currentRoomId` is read-only, synced from the registry each tick.

### Canvas Renderer (`src/components/Simulator/Canvas.tsx`)

Isometric projection with dynamic bounds computation. `computeViewBounds()` calculates the projected bounding box of all rooms and auto-scales to fit any screen width. No hardcoded offsets. The canvas also exposes `worldToScreen` / `screenToWorld` helpers so HTML overlays (meeting tooltip, work-order tickets) can anchor themselves in world space and so mouse hover can hit-test rooms.

## Project Structure

```
src/
  simulation/
    engine.ts          # Core engine, RoomRegistry, NPC + janitor processing, meeting scheduler
    config.ts          # All tunable constants (SIM_CONFIG, MEETING_RULES, JANITORIAL_RULES, LIFECYCLE_RULES)
    prediction.ts      # Forecast-based predictive cleaning model
    workorder.ts       # Work order factory — IDs, copy, event payload
  types/
    sim.ts             # TypeScript interfaces (NPC, Room, SimState, WorkOrder, etc.)
  components/
    Simulator/
      Canvas.tsx           # Isometric canvas renderer, hover detection, overlay anchoring
      WorkOrderTicket.tsx  # CMMS-style work-order ticket card
      Controls.tsx         # Settings panel, speed controls, event log
    ui/                # shadcn/ui primitives (badge, button, card)
  lib/
    utils.ts           # Tailwind class merge utility
  App.tsx              # Main app, animation loop, state management
  main.tsx             # React entry point
  index.css            # Tailwind theme and custom styles
tests/
  app.spec.ts          # Playwright tests
```

## Configuration

All simulation tunables are in `src/simulation/config.ts`:

- `SIM_CONFIG` — restroom duration, work hours, all-hands timing, lounge probability
- `MEETING_RULES` — attendee count, durations, slot interval, meeting window, guest settings, room IDs
- `JANITORIAL_RULES` — cleaning threshold, dirty threshold, cleaning duration, scheduled-clean time, janitor closet, restroom IDs
- `LIFECYCLE_RULES` — employee arrival/departure windows, entry point, guest spawn params

Office layout (grid positions, types, capacities, door locations) lives in `INITIAL_ROOMS` in `src/simulation/engine.ts`.

See [AGENTS.md](AGENTS.md) for detailed rules documentation.

## Tech Stack

- **React 19** with TypeScript
- **Vite 6** with Tailwind CSS 4
- **shadcn/ui** (base-nova style) with @base-ui/react primitives
- **Canvas 2D** for isometric rendering
- **Playwright** for end-to-end testing
