# Dayframe — implementation and release audit
**Snapshot:** 2026-11-08 (Asia/Baku)  
**Scope:** `azmath25/planner`, active Vercel project `dayframe`, Neon project currently serving `https://dayframe-azmath25s-projects.vercel.app`.  
**Evidence policy:** inspected active source, database schema/migration records, Neon Functions and triggers, Vercel deployment metadata, test output and anonymous live HTTP responses. README, roadmap and milestone comments were not treated as proof of deployed functionality.

## Executive findings

1. **Dayframe is a real deployed application, not merely the original design prototype.** Vercel production serves the app, static assets and PWA; its Neon API is responding and rejecting anonymous calls correctly.
2. **Feature completeness is uneven.** Workspaces, tasks, daily planning, session timing, private notes, private rich documents, reporting and push-support endpoints have implementations and automated coverage. That is not the same as signed-in mobile/browser acceptance.
3. **Background reminder delivery is incomplete in the backend actually serving the website.** Neon project `wispy-meadow-90135924`, branch `br-delicate-violet-b9cnjyuh`, has only Function `dayframeapi` and **zero Neon triggers**. The older separate project `soft-night-61558675` does have `dayframedue` and an enabled five-minute schedule, but those belong to the *old* database and do not establish reminders for the current website. No notification delivery records were found in the new database at audit time.
4. **The new public website does not use the older Dayframe database.** The older project has 12 migrations; the new project has 20. Account and task data should not be assumed migrated across them.
5. **Editor save reliability needed correction.** Previously editing could be stopped by formatting validation, unsupported math representation or an uncertain network save; now feature branch `feature/dayframe-m53-release-20261107` contains validation-independent cloud autosave, account-scoped local unsynced draft backup, and background reconciliation with revision fencing. **The fix is not live yet:** Vercel Hobby returned HTTP 402 `api-deployments-free-per-day` (over 100/day), retry after 24 hours. The latest verified production deployment remains `ffd1e080349fb584197d761b0651ed885e06b9e4`; the final source fix is at `a1e507459d9b74045864f1a6b352f07812a30e0d`.
6. Auto-generated preview builds consumed deployment capacity as source files were pushed. **Vercel preview deployments have now been disabled** on this project to avoid unnecessary repeat builds. GitHub integration and manual production releases remain.

## Source / deployed feature matrix

Status vocabulary: **Live verified** means public transport or deployed service checks; **Implemented/tested** means active code and automated tests, but end-to-end user behavior not established; **Incomplete** means a concrete missing piece.

| Area | Observed implementation | Remaining verification or gap | Status |
|---|---|---|---|
| Public web app | Vite/React shell and legacy Dayframe UI; Vercel Production `dayframe-azmath25s-projects.vercel.app`; live HTML, PWA worker and manifest 200 | End-to-end login, slow networks, accessibility and multi-device behavior | Live verified (transport) |
| Authentication | Neon Managed Better Auth; email/password UI; backend verifies issuer/JWKS JWT, protected `/v1/me` returns 401 without token | Successful real-user registration/session renewal in Chrome/Safari, cross-user authorization tests, cookie lifetime | Implemented; partial smoke |
| Workspaces | Create/edit/archive, pins, task scope, General workspace; backend SQL owner checks | Full browser acceptance, lifecycle edge cases, workspace image upload still local/browser-specific | Implemented/tested |
| Tasks and projects | Create/update, hierarchy/subtasks, hard deadline, soft reminders, tags, priorities, pin, archive/trash/reopen, audit and private task media | Concurrent changes, mobile layouts and actual notification delivery; long-lived project abstraction remains workspace/task-based | Implemented/tested |
| Daily planning and calendar | Flexible daily pool + fixed timed intervals, calendar and server-backed conflict checks | Real-device drag/touch and cross-time-zone behavior, long-running UX | Implemented/tested |
| Timer and time reports | Start/pause/resume/stop, account/task/workspace totals, weekly targets, period reports, insights and CSV helpers | Real signed-in multi-device resume and clock/offline edge cases | Implemented/tested |
| Quick Notes | Server CRUD, search, pin, soft delete/recovery, convert to task, color and reminders; responsive editor | Quick Notes still rely on an explicit save flow, unlike rich documents; browser input persistence and reminder delivery need verification | Implemented/tested, partial |
| Rich Documents | Owner-scoped JSONB documents, hierarchy, search, revision-based writes, deletion/recovery and JSON export; BlockNote links/LaTeX/code | Newly added draft backup and auto-reconcile not yet published; no binary/media attachment pipeline; mobile commands and cursor focus need real-user acceptance | Implemented; save fix pending release |
| Reminders and push | Reminder settings, in-app alert/actions, push subscriptions, quiet hours and sender code; PWA generic push handler | **No `dayframedue` Function or schedule trigger in the serving project**; no end-to-end due push proven | **Incomplete, high priority** |
| PWA/mobile/offline | Manifest, install icons, offline fallback SW; public assets cached; private APIs intentionally not cached | Not a full offline-first app: other datasets and auth do not work offline; signed-in Android/Safari tests and store packaging pending | PWA shell implemented |
| Android release | Mobile-responsive website/PWA | No native Play Store package or launch verified | Not done |
| Production data consolidation | Older and newer Neon Dayframe projects both exist | Older user identities/content have not been migrated; must make an explicit plan before merging or deleting either | Incomplete |
| Source/release hygiene | Code on feature branch; current Vercel Production built from that branch; GitHub connected, GitHub Actions not used for these deployments | Default `main` is not the release source; production build variable remains named `VITE_DAYFRAME_TARGET=staging` despite clean URL and new public database | Incomplete cleanup |

## Concrete backend/database evidence

- Neon project serving the public site: `wispy-meadow-90135924` / `br-delicate-violet-b9cnjyuh` / DB `dayframe`. **20 schema migrations** applied through `0020_requeue_notification_preferences`. Current Function: `dayframeapi` deployment 6 (Node 24, completed). **No other Functions or Neon triggers** on that branch.
- New database has tables including `tasks`, `workspaces`, `daily_pools`, `scheduled_intervals`, `time_sessions`, `quick_notes`, `documents`, `push_subscriptions` and delivery tables. Evidence of existing user activity: one Auth user, one workspace, one task, two documents and one push subscription at audit time. No task/note delivery records. These counts are only a snapshot and are not a synthetic full-feature test.
- Older project `soft-night-61558675` / `br-shiny-king-b9np2anx` has **12 migrations** and Functions `dayframeapi` (15) and `dayframedue` (4). An enabled Neon schedule trigger `dayframe-reminder-dispatch` fires every five minutes for **that older project's** `dayframedue/dispatch`, not for the current website.
- Anonymous live checks against the current website/backend: root, manifest and service worker HTTP **200**; API `GET /health` **200**, unauthenticated `GET /v1/me` **401**, trusted production-origin preflight **204**, untrusted-origin preflight **403**.
- Server document table enforces workspace/task/parent ownership constraints and an approximately 256 KB JSONB size limit. Keeping malformed mathematics is expected; oversized content and executable/unsafe content are still restricted for security.

## Automated verification

Executed in a temporary isolated Vercel sandbox against the active feature source (no GitHub Actions):
- Document validation plus new account-scoped draft recovery tests: **11 passed, 0 failed**.
- Time tracking: **6 passed, 0 failed**.
- PWA worker: **3 passed, 0 failed**.
- Source wiring and insights harness: **passed**.
- Backend API suite: **89 passed, 0 failed**.
- Vite/TypeScript build and staging-target `check:dist`: **passed**; the compiled app uses only the current Neon endpoints.

The final source commit `a1e5074` was retested after UI status changes; all listed checks passed. The tests are substantial but use mocks and source assertions in several suites. **They do not prove a signed-in end-to-end browser workflow, cross-owner isolation in a live database, push delivery, or real offline recovery.** The disposable Postgres 18 integration suite and full Playwright browser matrix were not rerun as part of this audit.

## Unsynced document-save correction: scope and limitations

Feature source now:
- Stores unsynced changes under a browser-local key that includes the authenticated user's storage scope and document ID, so one account's recovery prompt does not read another account's draft.
- Sends edited BlockNote JSON without checking mathematical or grammatical correctness; first sentence can supply optional page title.
- Runs cloud autosave after a short pause. In-flight writes use revision fences; a lost response is reconciled against the server before retry, including newer local keystrokes.
- Restores an unmatched local draft on an explicit user prompt when reopening the document; does not automatically overwrite a server revision from another device.
- Shows cloud-versus-backup state rather than claiming a failed upload succeeded.
- Does **not** enable storing executables, unbounded size or arbitrary binary attachments. Local draft backup depends on available browser storage and is not a replacement for a functioning Neon connection.

**Publication blocker:** 2026-11-08 Vercel Hobby reached daily API deployment quota (HTTP 402, `api-deployments-free-per-day`, retry after 86400 seconds). The existing working production deployment was not replaced. An authorized CLI alternative was checked; this isolated build sandbox has no Vercel CLI credentials or linked project. No upgrade, alternate-project quota bypass or premature success claim.

## Prioritized remaining work

1. **P0 — Release the verified autosave fix** to the existing Vercel production URL when deployment capacity permits. Confirm in an authenticated Android browser with intentionally invalid LaTeX, rapid typing, reload, and simulated offline-to-online recovery. Keep the older version live until replacement is READY.
2. **P0 — Make reminders actually deliver** on the current Neon database: review push secrets/permissions, stage `dayframedue` on the correct project, configure one schedule trigger, verify quiet hours and delivery accounting with an authorized controlled test. Do not copy secret material into GitHub or browser code.
3. **P1 — User acceptance and reliability:** two account authorization/isolation test, Auth session renewal on Chrome/Safari, mobile keyboard/slash-menu focus, create/edit/reopen documents and quick notes, recover conflicted drafts, timer across devices.
4. **P1 — Data and deployment consolidation:** choose an explicit path for accounts/data on the 12-migration legacy Neon project; consolidate Vercel naming and build-target terminology once safe; decide whether/when to merge feature to `main`.
5. **P2 — Beyond MVP:** attachments and images in documents, genuine offline-first data sync, additional QA/accessibility checks, Android Play Store packaging and longer-term modular replacement for the large `web/src/legacy/legacy.ts` bridge.

## Safety / release boundaries

No production schema migration, data deletion, branch merge, GitHub Actions, Quizer or Mimo work was performed. Do not delete the older Neon project until migration/retention is explicitly decided. Current verification is read-only except for approved feature-branch source changes, the browser-preview-disable project setting, and the attempted Vercel release request that was rejected by quota.
