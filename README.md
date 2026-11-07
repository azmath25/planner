# Dayframe — mobile-first personal planner

**M3: Task Management implemented (M3.1–M3.3).** The mobile website is the first product; Android is deliberately later.

## Run locally

```bash
npm install
npm run dev
npm run typecheck
npm run test:source
npm run test:time
npm run test:api
npm run build
npm run check:dist
```

Vite serves `web/`. The application source lives in `web/src/` and a small typed domain layer is under `web/src/domain/`.

The existing M1.2 interactive UI is mounted by a **temporary compatibility adapter** (`web/src/legacy/legacy.ts`) under a React 19 root. This preserves task creation, hard deadlines and soft reminders, global Home, hybrid day planning, quick notes, six themes, and task/workspace cover and avatar previews. It is **not** a completed migration of all screen logic into React components. Follow-on milestones can move each screen and state into typed React incrementally.

### Preview safety

After sign-in, the permanent General workspace and any custom workspaces are loaded from Neon. **Tasks are saved to Neon** and are visible after reload or on another device signed in to the same account. Create/edit/complete/reopen tasks, preserve independent deadlines and reminders, and use recoverable Task Trash. Browser-local sample tasks are **not imported automatically**.

**Still local:** the daily pool, timed intervals, quick notes, workspace photos and time-tracking sessions, including the global timer. Task covers and avatars are saved privately in Neon. These remain account-namespaced browser previews; they are NOT synchronized between devices. No actual reminder notifications have been enabled. Use **Profile → Refresh saved data** to fetch cloud updates created elsewhere. Never rely on the current local timer as your sole permanent record.

## M3 task management — implemented

- **M3.1:** Tasks save to Neon with estimates, notes, tags, pinning, priority, nested parent reference, independent hard deadlines and reminders. Search, filter and sort by workspace, status, overdue, tags, priority and date.
- **M3.2:** Complete, cancel, reopen, archive, unarchive, Trash and restore. A separate typed confirmation is required for permanent deletion; it is limited to trashed leaf tasks. PostgreSQL records completion/cancellation timestamps and immutable audit events.
- **M3.3:** Add nested subtasks from task details; move whole task trees atomically between workspaces, prevent ancestry loops, and confirm completion of a parent with open children. Task cover and avatar images can be resized and stored privately in Neon with owner-scoped API access.
- All M3 changes are on **main**; Dayframe Neon Function deployment 6 is complete. Browser smoke, backend CI and live API security tests passed.
- **Not yet cloud-synced:** timers/sessions, day pool, schedule, Quick Notes and workspace photos. Safari login still requires separate real-browser verification. Real authenticated two-account acceptance tests remain manual.

See [M3 checkpoint](docs/CHECKPOINT_M3.md) for verified tests, database migrations and the precise limitations.

## M2.3-W: archive and restore custom workspaces

From **Workspaces**, open a custom workspace and select **Archive**. The confirmation preserves the workspace and its tasks in Neon, but hides them from active Home, Tasks, Calendar and Plan views. Workspaces → **Archived workspaces** lists archived custom spaces and provides **Restore**. General cannot be archived; workspace-level time sessions, notes and day plans are still stored locally and are not deleted. If a local timer is running for an archived workspace, it is stopped and saved locally before the workspace is hidden.

Backend enforces ownership, `revision` on archive/restore, and protects General in both SQL and API. See `docs/CHECKPOINT_M2.3-W.md`.

## M2.3 persisted workspaces and tasks

- Neon tables: `dayframe.workspaces` (custom records, permanent General) and `dayframe.tasks` with composite owner/workspace and owner/parent foreign keys.
- Protected API: `GET/POST /v1/workspaces`, `PATCH /v1/workspaces/:id`, `GET/POST /v1/tasks`, `PATCH/DELETE /v1/tasks/:id`, `GET /v1/tasks/trash`, `POST /v1/tasks/:id/restore`.
- Task deletion moves records to recoverable Trash, not permanent removal. General cannot be renamed or deleted.
- Task status, title, estimate, notes, priorities, long-term flag and independent hard/soft deadlines are saved with revision checks for stale editors.
- The backend derives user ownership exclusively from a verified Neon JWT; browser-supplied owner IDs grant no access.
- Partial backend migration and UI tests: `npm run test:api`, `npm run test:source`; live security smoke: `node --test tests/live-api-smoke.mjs`.
- No account has been populated with demonstration tasks. Add the tasks you want to keep.

See `docs/CHECKPOINT_M2.3.md` for scope and verification limitations.

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

## Login status and Safari limitation

Managed Neon Auth is enabled for the Dayframe project, and the live sign-in
endpoint and GitHub Pages CORS preflight pass. **That does not prove a browser
session is usable.** The default GitHub Pages domain and the separate Neon Auth
domain are cross-site. Some browsers, notably Safari, can block the cookie
required by the direct `@neondatabase/auth` client.

The sign-in UI now verifies the restored session and shows an explicit error
instead of appearing to log in successfully. The service connection, source
bundle, Pages publication and API JWT checks are verified, but **real-user
Safari sign-in remains unresolved**.

A production solution must move auth calls behind an approved same-site
proxy/first-party domain or use an equally secure, supported hosting setup.
Do not disable JWT checking, send credentials to unrelated sites, or rely on
turning off cross-site tracking protections. See
[`docs/CHECKPOINT_M2.3.md`](docs/CHECKPOINT_M2.3.md).

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

## Neon account milestone (M2.2)

Email/password sign-up, sign-in and sign-out are provided by Managed Neon Auth. The `dayframeapi` Neon Function verifies user JWTs and exposes authenticated, owner-scoped task, workspace, archive, history and task-photo routes. `General` is permanent in Postgres. No database secret is bundled into the website. See [the checkpoint](docs/CHECKPOINT_M2.2.md) for setup and limits.
