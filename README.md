# Mapped Restroom Sim

Isometric office simulator demonstrating how traffic sensors in restrooms can enable **predictive maintenance** instead of traditional schedule-based cleaning. Built as a demo tool for [Mapped](https://mapped.com) — the data platform for the built world.

## Demo

The simulator renders a full office floor plan with NPCs that autonomously move between desks, meeting rooms, restrooms, a cafeteria, lounge, and auditorium. Restroom visits are tracked with enter/exit events, showing how sensor data can replace schedule-based cleaning.

## Features

- **Isometric floor plan** — canvas-based renderer with auto-fit scaling
- **Restroom occupancy tracking** — real-time enter/exit event log with occupancy counts
- **Meeting scheduler** — rooms always in use, 2-4 people, 5 or 15 min durations on 5-min boundaries
- **All-hands meetings** — Tuesdays/Thursdays at 1 PM in the auditorium
- **NPC behavior** — priority-based decisions: all-hands > restroom > meetings > breaks
- **RoomRegistry** — single source of truth for all room assignments, validated every tick
- **Configurable** — population (1-20), simulation speed (real-time / 1m/s / 5m/s)
- **Skip-to-all-hands** — jump to the next all-hands meeting day

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
| `npm test` | Run Playwright tests (12 tests) |
| `npm run test:ui` | Playwright interactive test UI |

## Architecture

### Simulation Engine (`src/simulation/engine.ts`)

The core loop runs via `requestAnimationFrame`. Each tick:

1. **Meeting scheduler** — fills empty rooms at the next 5-min boundary
2. **NPC processing** — each NPC runs through a 6-phase state machine (urgency update → leave check → movement → desk decisions → idle recovery → registry sync)
3. **Registry validation** — cross-checks room↔NPC maps for consistency
4. **Room state** — occupancy labels, flash effects, derived from registry

### RoomRegistry

The central architectural pattern. A pair of synchronized maps (`npcToRoom` / `roomToNpcs`) with atomic `registryEnter()` / `registryExit()` functions. NPCs must walk to a room's door to transition — no teleporting. `NPC.currentRoomId` is read-only, synced from the registry each tick.

### Canvas Renderer (`src/components/Simulator/Canvas.tsx`)

Isometric projection with dynamic bounds computation. `computeViewBounds()` calculates the projected bounding box of all rooms and auto-scales to fit any screen width. No hardcoded offsets.

## Project Structure

```
src/
  simulation/
    engine.ts          # Core engine, RoomRegistry, meeting scheduler, config
  types/
    sim.ts             # TypeScript interfaces (NPC, Room, SimState, etc.)
  components/
    Simulator/
      Canvas.tsx       # Isometric canvas renderer with auto-fit
      Controls.tsx     # Settings panel, speed controls, event log
    ui/                # shadcn/ui primitives (badge, button, card)
  lib/
    utils.ts           # Tailwind class merge utility
  App.tsx              # Main app, animation loop, state management
  main.tsx             # React entry point
  index.css            # Tailwind theme and custom styles
tests/
  app.spec.ts          # Playwright tests (12 tests)
```

## Configuration

All simulation tunables are in `src/simulation/engine.ts`:

- `SIM_CONFIG` — restroom duration, work hours, all-hands timing, lounge probability
- `MEETING_RULES` — attendee count, durations, boundary interval, room IDs
- `INITIAL_ROOMS` — office layout (grid positions, types, capacities, door locations)

See [AGENTS.md](AGENTS.md) for detailed rules documentation.

## Tech Stack

- **React 19** with TypeScript
- **Vite 6** with Tailwind CSS 4
- **shadcn/ui** (base-nova style) with @base-ui/react primitives
- **Canvas 2D** for isometric rendering
- **Playwright** for end-to-end testing
