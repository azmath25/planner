# Dayframe — mobile-first personal planner

**M1.3: React + TypeScript frontend foundation; Timer UX slice implemented after M2.1.** The mobile website is the first product; Android is deliberately later.

## Run locally

```bash
npm install
npm run dev
npm run typecheck
npm run test:source
npm run test:time
npm run build
npm run check:dist
```

Vite serves `web/`. The application source lives in `web/src/` and a small typed domain layer is under `web/src/domain/`.

The existing M1.2 interactive UI is mounted by a **temporary compatibility adapter** (`web/src/legacy/legacy.ts`) under a React 19 root. This preserves task creation, hard deadlines and soft reminders, global Home, hybrid day planning, quick notes, six themes, and task/workspace cover and avatar previews. It is **not** a completed migration of all screen logic into React components. Follow-on milestones can move each screen and state into typed React incrementally.

### Preview safety

All tasks, images and reminders are still demo data stored only in this browser's localStorage using the unchanged key `dayframe.m1.design-demo.1`. No Neon, login, push service, or real persistent task tracking is connected. Do not rely on this prototype for actual reminders, critical deadlines, confidential content or recorded time.

## Browser-local time tracking (timer UX slice)

On Tasks or any task detail, press **Start**. The current task then appears in a persistent timer bar on every page (above the bottom navigation on mobile). Use **Pause**, **Resume**, **Stop** or **Finish**:

- **Pause** excludes the paused period from tracked time; Resume continues the same session.
- **Stop** saves the session and leaves the task open.
- **Finish** saves the session and marks the task completed. The task can later be reopened.
- Starting another task asks before saving the previous session; only one active session is possible in a browser tab.
- Task → **Activity** shows saved sessions with duration; saved milliseconds are retained across multiple short sessions.
- Timer timestamps, sessions, and totals are preserved by browser localStorage across reloads. Other tabs receive storage updates when possible.

**Important:** This is still a **browser-local preview**, not synchronized with Neon. Time continues while the timer is Running even if the tab is closed (because it measures wall-clock elapsed time); pause before leaving if you do not want that time counted. Clearing browser data or using another device loses access to local session data. Cross-tab updates are best-effort and not atomic. Production server-backed sessions, idempotency, cross-device control and owner-scoped reporting remain in a later milestone.

Quick check: `npm run test:time`. Browser regression: `python tests/timer-browser.py` (requires local Chromium and Playwright; generates an ephemeral test harness).

## GitHub Pages, one branch

The repo retains exactly one branch: `main`. In **Settings → Pages**, use **Deploy from a branch → main → /(root)**. GitHub Actions runs `npm run build`, verifies assets and then commits Vite's built `index.html` and `assets/` to **main itself**. GitHub Pages does not automatically publish bot-authored commits; the milestone deployment is finalized by a separate human/app-authored `main` commit after CI verification. The Pages source never changes to GitHub Actions; no `gh-pages` branch is needed.

Published preview: https://azmath25.github.io/planner/

Do not manually edit generated root `index.html` or `assets/`. Edit `web/` instead. Generated assets are committed so the branch-based Pages source can serve them.

## Documentation

- [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) — long-term product requirements and milestones.
- [`docs/CHECKPOINT_M1.3.md`](docs/CHECKPOINT_M1.3.md) — implementation, verification, limitations and next step.
- Historic M1.1 and M1.2 checkpoints remain unchanged.

## Security

The frontend must never contain database connection strings, private API tokens, or cloud credentials. Quizer, Mimo and all Neon projects are independent and unchanged.
