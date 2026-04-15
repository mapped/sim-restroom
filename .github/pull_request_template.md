## Summary

<!-- What does this PR change and why? 1–3 sentences. Tie it to the CBM narrative in the README when relevant. -->

## Linked issue

<!-- Closes #NNN, or "N/A" -->

## Test plan

- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual run of `npm run dev` looks correct

## Visual changes

<!-- If UI changed, attach before/after screenshots. If the Playwright snapshot was updated, confirm: -->

- [ ] N/A — no UI changes
- [ ] Snapshot regenerated with `npm test -- --update-snapshots` and committed

## Checklist

- [ ] Updated `CHANGELOG.md` under `## [Unreleased]`
- [ ] Touched the RoomRegistry? Confirmed `registryEnter` / `registryExit` are the only mutation paths
- [ ] New source files include `// SPDX-License-Identifier: MIT` and `// Copyright 2026 Mapped Inc.`
