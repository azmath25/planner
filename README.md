# Dayframe — mobile-first personal planner

**M5.1: authenticated time sessions implemented and deployed.** Neon now owns the running/paused timer, server timestamps and saved direct-task time totals, alongside workspaces, tasks, day plans and opted-in reminders. M4.3 browser push was confirmed on one real browser; device-by-device acceptance remains open. M5.2 rollups and M5.3 targets are future milestones. The mobile website is the first product; Android is deliberately later.

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

**Saved in Neon:** workspaces, tasks and private task images, untimed daily pools, scheduled blocks, reminder actions/push registrations, and M5.1 server-clock time sessions with direct task totals. **Still device-local:** daily capacity, quick notes, workspace photos and *older* browser-only timer history. No automatic import of previous local sessions or already-running local timers was performed, to avoid duplicate time. The user confirmed receiving a browser reminder; additional devices and Safari still need testing. Use **Profile → Refresh saved data** to reload account data.

## M5.1 — Time Sessions (deployed, real-device acceptance pending)

Sign in and select **Start** on any open task. Dayframe creates a server-timestamped session in Neon; **Pause** and **Resume** exclude inactive time, and **Stop** saves the time without completing the task. There is **only one running or paused session per account**. Starting another task asks permission to stop the previous session, and the switch is saved atomically.

Open Dayframe on another signed-in device or reload the page to recover the current timer. The browser uses server timestamps to display elapsed time without frequent API calls; it refreshes on focus/visibility and periodically while visible. Completing, archiving or deleting a task, or archiving its workspace, closes its active session without losing the record.

Task details show **directly recorded time for that task only**; nested/workspace/global time rollups and historical membership decisions are deferred to M5.2. Previously saved browser-only stopwatch records are not imported automatically into Neon, and no browser-local records were deleted by this release. See [M5.1 checkpoint](docs/CHECKPOINT_M5.1.md) and [M1–M4 deep audit](docs/AUDIT_M1_M4_DEEP_2026-11-07.md).

## M4.3 — Reminders (browser notification confirmed; wider-device checks pending)

Sign in, then open **Home → Reminder inbox** to see reminders and hard deadlines due or approaching within 48 hours. **Acknowledge** an alert to dismiss that occurrence, or **Snooze 1 hour** to defer it; neither changes the underlying task's hard deadline or soft reminder.

To receive optional background alerts, choose **Use device time zone** and **Enable browser notifications**. Permission is requested by the browser, and a generic notification can open Dayframe even when the tab is closed on supported systems. **Disable browser notifications** removes this device's push registration. The scheduled Neon worker checks every five minutes; delivery is best-effort, not second-perfect. Unsupported/blocked browsers can still use the in-app inbox. Safari authentication and iOS push may require platform-specific changes, including installing the website, and have not been verified on a real user device.

Current limitations: one soft reminder date/time per task; no recurrence, quiet hours, email delivery, configurable deadline-warning thresholds or verified physical-device notifications. See [M4.3 checkpoint](docs/CHECKPOINT_M4.3.md) and [M1–M4 audit](docs/AUDIT_M1_M4_2026-11-07.md) for acceptance status and further work.

## M4.2 — Timed Scheduling

From **Plan**, select **Add interval**. Choose an open task and set a date, start time and end time. You can split one task across several days by adding more than one interval. Use **Edit** on a timed block to change its task, clock times or date; use **Remove** to release its scheduled time without deleting the underlying task or changing its deadlines and reminders.

Signed-in interval records are saved in Neon, including an IANA time zone and a revision. **Overlapping blocks on the same day are rejected atomically**; adjacent blocks are allowed. Each day uses one time zone, so the wall-clock schedule remains internally consistent. The available-hours setting remains a **local preference**: overcapacity gives a warning/confirmation, not an automatic reschedule or server failure.

Tap **Calendar** from Plan (including on mobile) to switch between **Day / Week / Month** and choose a date or edit a block. Archived tasks' reserved time is shown instead of silently causing hidden overlaps. Calendar views fetch owner-scoped intervals from Neon, with stale-edit protection.

The **untimed daily pool and scheduled time blocks are independent**. Editing one does not automatically modify the other. Former locally saved intervals are not imported automatically into an authenticated account. The local demo remains browser-only.

**Later milestones:** server-backed timer sessions (M5) and account-wide synchronized capacity. M4.3 subsequently added the reminder core; physical-device push acceptance remains pending. Complex DST transitions and real signed-in cross-device acceptance tests remain separate verification work. See [M4.2 checkpoint](docs/CHECKPOINT_M4.2.md) for technical guarantees, SQL migration, tests and limitations.

## M4.1 — Untimed Daily Pool

Open **Plan**, choose a date and use **Add to day** to select open tasks from any active workspace. Use the up/down controls to choose their order; **Remove** only removes the task from that date's plan, not from Dayframe. Neither a hard deadline nor a soft reminder is modified.

Signed-in accounts save the **ordered untimed pool in Neon** per account and calendar date. The pool loads on sign-in and when you switch days. Concurrent changes from another device are revision-checked: if an update is stale, Dayframe refreshes the saved pool instead of overwriting it. Each date supports up to 100 distinct open tasks. The standalone local demo continues storing its example daily pools in the browser.

**At the M4.1 checkpoint:** Fixed-time intervals, available hours/capacity, notifications, notes and time sessions were still local. M4.2 has subsequently synchronized fixed-time intervals to Neon. A task may be selected in both its untimed pool and a timed interval; changing an interval does not silently rewrite the cloud pool. Previously stored local pools are not automatically imported.

See [M4.1 checkpoint](docs/CHECKPOINT_M4.1.md) for verified behavior and limitations.

## M3 task management — implemented

- **M3.1:** Tasks save to Neon with estimates, notes, tags, pinning, priority, nested parent reference, independent hard deadlines and reminders. Search, filter and sort by workspace, status, overdue, tags, priority and date.
- **M3.2:** Complete, cancel, reopen, archive, unarchive, Trash and restore. A separate typed confirmation is required for permanent deletion; it is limited to trashed leaf tasks. PostgreSQL records completion/cancellation timestamps and immutable audit events.
- **M3.3:** Add nested subtasks from task details; move whole task trees atomically between workspaces, prevent ancestry loops, and confirm completion of a parent with open children. Task cover and avatar images can be resized and stored privately in Neon with owner-scoped API access.
- All M3 changes are on **main**; Dayframe Neon Function deployment 6 is complete. Browser smoke, backend CI and live API security tests passed.
- **M3 checkpoint note:** At the end of M3, timers/sessions, day pool, schedule, Quick Notes and workspace photos were not cloud-synced. M4.1 subsequently synchronized the untimed day pool only. Safari login still requires separate real-browser verification. Real authenticated two-account acceptance tests remain manual.

See [M3 checkpoint](docs/CHECKPOINT_M3.md) for verified tests, database migrations and the precise limitations.

## M2.3-W: archive and restore custom workspaces

From **Workspaces**, open a custom workspace and select **Archive**. The confirmation preserves the workspace and its tasks in Neon and hides them from active task lists. Any previously reserved timed blocks remain visible in Calendar/Plan as archived reservations until they are removed or the workspace is restored. Workspaces → **Archived workspaces** lists archived custom spaces and provides **Restore**. General cannot be archived; workspace-level time sessions, notes and day plans are still stored locally and are not deleted. If a local timer is running for an archived workspace, it is stopped and saved locally before the workspace is hidden.

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
