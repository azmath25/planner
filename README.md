# Dayframe — mobile-first planning website

**M1.1 design checkpoint (November 2026)**

Dayframe is a personal task, time, reminder, notes and workspace platform. This repository replaces the former `home-planner` canvas editor. The original implementation is preserved in the `backup/legacy-canvas-20261106` Git branch.

## Current state

A **static, interactive, mobile-first design prototype** for GitHub Pages. It uses sample data and browser-local storage for demonstration only. It is **not** connected to Neon or an authenticated backend. Time tracking, statistics, calendar views, notifications, rich documents, asset uploads and deletion are not production-ready.

Open `index.html` or serve the directory locally:

```bash
python3 -m http.server 8080
```

Visit http://localhost:8080. No dependency installation or build step is required for the M1.1 prototype.

## What works in the design preview

- Mobile bottom navigation and desktop sidebar
- Common Home across General, Research and Development example workspaces
- Task creation and editing with hard deadline and separate soft reminder date
- Complete/reopen in local demo state, opening task details
- Hybrid day planner: ordered untimed pool plus fixed start/end intervals
- Quick Note creation and deletion confirmation
- Basic in-tab demo timer, report mockups and six appearance themes

## Verification

```bash
node --check app.js
python3 tests/smoke.py  # requires Playwright and local Chromium
```

The browser smoke test covers task creation, reminder time, daily pool, timed schedule, quick notes, themes and delete confirmation.

## Important limitations

**Do not rely on this prototype for real reminders or recorded time.** Local browser data is disposable. A future milestone will add Neon Auth, protected APIs, database-backed sessions, notifications and recoverable Trash. The current delete confirmation removes only local demo objects.

See [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) for the complete scope and ordered milestones, and [`docs/CHECKPOINT_M1.1.md`](docs/CHECKPOINT_M1.1.md) for implementation verification.

## Safety

The new product is independent of Quizer and Mimo. No API secrets, Neon connection strings, provider keys or real user data belong in this static frontend.
