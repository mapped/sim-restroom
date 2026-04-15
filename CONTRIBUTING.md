# Contributing

Thanks for your interest in improving the Mapped Restroom Sim. This project is deliberately small and readable — a teaching artifact for conditions-based maintenance on top of Mapped's data layer. Contributions that keep it that way are very welcome.

## Getting set up

**Prerequisites:** Node.js 20+ (an `.nvmrc` is included; run `nvm use` if you use nvm).

```bash
git clone https://github.com/mapped/sim-restroom.git
cd sim-restroom
npm install
npm run dev
```

Open <http://localhost:3000>.

## Project orientation

Before touching code, skim these:

- [`README.md`](README.md) — product pitch, feature tour, and the predictive algorithm explained end-to-end
- [`CLAUDE.md`](CLAUDE.md) — architecture deep-dive: RoomRegistry invariant, state machine phases, common pitfalls
- [`AGENTS.md`](AGENTS.md) — simulation rules reference (restroom, janitorial, meetings, all-hands, decision priorities)

The single most important invariant is the **RoomRegistry**: room occupancy and NPC location are managed by a registry rebuilt from NPC state each tick. Never mutate `NPC.currentRoomId` directly, and never track occupancy in a separate counter. CLAUDE.md explains why — briefly, earlier versions drifted under edge cases and this pattern eliminates the whole class of bug.

## Development workflow

1. **Fork and branch.** Use a descriptive branch name (`fix/janitor-stuck-at-door`, `feat/multi-floor-layouts`).
2. **Keep changes focused.** Small, single-purpose PRs merge fast. If you find a second thing to fix, that's a second PR.
3. **Run the checks locally** before pushing:
   ```bash
   npm run lint         # tsc --noEmit + eslint
   npm run format:check # prettier
   npm test             # Playwright
   npm run build        # production bundle sanity check
   ```
4. **Open a PR** against `main`. The PR template will prompt for a summary, test plan, and screenshots if UI changed.

## Code style

- **TypeScript strict mode.** No `any` without a comment explaining why.
- **`@/` import alias** — resolves to `src/`. No relative imports (`../`).
- **Prettier-formatted.** `npm run format` before committing.
- **2-space indent**, LF line endings, UTF-8 (enforced by `.editorconfig`).
- **SPDX header** on every new source file: `// SPDX-License-Identifier: MIT` plus `// Copyright 2026 Mapped Inc.`

## Testing

Playwright runs against Chromium and includes a full-page visual regression snapshot (`tests/app.spec.ts-snapshots/full-page-chromium-darwin.png`).

- **Non-UI changes:** `npm test` should pass unchanged.
- **Intentional UI changes:** regenerate the snapshot with `npm test -- --update-snapshots` and commit the updated PNG. Include before/after screenshots in the PR so reviewers can see what changed.
- **New behavior:** add a test in `tests/app.spec.ts`. Keep tests fast and deterministic; use `page.evaluate` to inspect simulator state where helpful.

## What makes a good PR

- Ties to a specific part of the CBM narrative in the README (or proposes an extension to it)
- Preserves the "single file, readable on a laptop" character of the simulation engine and prediction module
- Doesn't pull in a heavy dependency if a few lines of TypeScript would do
- Updates `CHANGELOG.md` under `## [Unreleased]`

## Reporting bugs and requesting features

Use the templates under [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/). For security issues, see [`SECURITY.md`](SECURITY.md) — please do not file public issues for vulnerabilities.

## Code of Conduct

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).
