# Dayframe — mobile-first planning website

**M1.2 design checkpoint (November 2026)**

Dayframe is a personal task, time, reminder, notes and workspace platform. This repository replaces the former `home-planner` canvas editor. The former canvas implementation has been replaced and the legacy branches were deleted at the user's request. Only `main` remains.

## Current state

A **static, interactive, mobile-first design prototype** for GitHub Pages. It uses sample data and browser-local storage for demonstration only. It is **not** connected to Neon or an authenticated backend. Time tracking, statistics, calendar views, notifications, rich documents, cloud asset uploads and deletion are not production-ready.

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
- M1.2: six accent palettes, comfortable/compact density and three cover presentations
- M1.2: workspace/task cover and avatar upload preview, focal-position control, replace/remove
- Image previews are compressed and saved **only to this browser** (localStorage with storage limits)

## GitHub Pages — deploy from a branch

In repository **Settings → Pages**, select **Build and deployment → Source: Deploy from a branch**, then **Branch: `main` / `/(root)` → Save**. No `gh-pages` or deployment branch and no Actions-based Pages publishing workflow. The website address is `https://azmath25.github.io/planner/` after GitHub Pages finishes building. The site may be publicly visible even though source is private. Do not store sensitive data in this preview.

## Verification

```bash
node --check app.js
python3 tests/smoke.py  # requires Playwright and local Chromium
```

The browser smoke tests cover task creation, reminder time, daily pool, timed schedule, quick notes, themes, accent/density/cover settings, workspace/task cover and avatar uploads, and delete confirmation.

## Important limitations

**Do not rely on this prototype for real reminders or recorded time.** Local browser data is disposable. A future milestone will add Neon Auth, protected APIs, database-backed sessions, notifications and recoverable Trash. The current delete confirmation removes only local demo objects. Photo uploads in M1.2 never go to the server, and localStorage can be cleared by the browser. Do not upload confidential images.

See [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) for the complete scope and ordered milestones, and [`docs/CHECKPOINT_M1.2.md`](docs/CHECKPOINT_M1.2.md) for the latest verification.

## Safety

The new product is independent of Quizer and Mimo. No API secrets, Neon connection strings, provider keys or real user data belong in this static frontend.
