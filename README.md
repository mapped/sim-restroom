# Mapped Restroom Sim

Isometric office simulator demonstrating how traffic sensors in restrooms can enable **predictive maintenance** instead of traditional schedule-based cleaning.

Built with React 19, Vite, TypeScript, and canvas-based isometric rendering.

## Features

- Real-time isometric office visualization with NPCs
- Restroom occupancy tracking with enter/exit event log
- Continuous meeting room scheduling (2-4 people, 5 or 15 min)
- All-hands meetings on Tuesdays/Thursdays
- Configurable population (1-20) and simulation speed
- RoomRegistry architecture ensuring strict occupancy accuracy

## Run Locally

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Project Structure

```
src/
  components/
    Simulator/       # Canvas renderer and controls panel
    ui/              # shadcn/ui primitives (badge, button, card, slider)
  lib/
    utils.ts         # Tailwind class merge utility
  simulation/
    engine.ts        # Core sim engine, RoomRegistry, meeting scheduler
  types/
    sim.ts           # TypeScript interfaces (NPC, Room, SimState, etc.)
  App.tsx            # Main app, state management, animation loop
  main.tsx           # React entry point
  index.css          # Tailwind theme and custom styles
```

See [AGENTS.md](AGENTS.md) for simulation rules and configuration details.
