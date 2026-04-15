# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] — 2026-04-14

Initial public release.

### Added

- Isometric canvas-rendered office floor plan with auto-fit scaling and dynamic bounds
- Autonomous simulation of ~20 employees with assigned desks, priority-driven decisions (all-hands > restroom urgency > meeting > break > desk), and staggered 6–9 AM arrivals / 4–6 PM departures
- Daily meeting scheduler generating the full day's slate at morning boot, with 15/30/45/60-minute durations, 2–4 attendees, and external meeting guests (85% chance, 1–3 per meeting)
- Meeting-room hover tooltip showing the day's full schedule per room (past meetings struck through, active meeting flagged `NOW`)
- All-hands meeting at 1 PM in the auditorium driving the post-meeting restroom surge
- Per-restroom usage tracking, live enter/exit events, and a "dirty" sad-face indicator above 25 uses
- Live Predictive ↔ Scheduled cleaning-mode toggle
- CMMS-style work-order ticket cards floating above the janitor closet with WO number, priority/status pills, reason tag, timestamp, and assignee
- `WorkOrderReason` taxonomy: `THRESHOLD_REACHED`, `SCHEDULED_DAILY`, `PREDICTIVE_SURGE`, `PREDICTIVE_ETA`
- Shared `createWorkOrder()` factory so reactive, scheduled, and predictive orders all flow through one path
- Janitor NPC with a dedicated state machine: IDLE → walk → wait-at-door (occupancy must be zero) → clean 5 min → reset usage → return to closet
- `RoomRegistry` invariant — atomic `registryEnter()` / `registryExit()` with per-tick validation
- Predictive cleaning model: rolling base rate + calendar-aware surge overlay, with three suggested-dispatch branches (all-hands optimization, large-meeting optimization, default lead time)
- Playwright end-to-end test suite (12 tests) with full-page visual regression snapshot
- Demo GIF generation pipeline (`scripts/generate-demo-gif.sh` + `tests/capture-demo-gif.spec.ts`)

[Unreleased]: https://github.com/mapped/sim-restroom/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/mapped/sim-restroom/releases/tag/v1.0.0
