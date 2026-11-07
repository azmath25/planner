# Dayframe — M3 task-management checkpoint

**Date:** 2026-11-07
**Scope:** Complete Phase M3 (M3.1, M3.2, M3.3); no M4 work, no changes to Mimo or Quizer.
**Repository:** azmath25/planner, one branch: main
**Database:** dedicated Neon project soft-night-61558675, database dayframe, main branch
**Production function:** dayframeapi, deployment 6 (Node.js 24), completed.

## M3.1 — Tasks

Implemented saved create/edit using authenticated user ownership, revision checks, estimated minutes, notes, status, low/medium/high priority, pinned state, long-term classification, optional parent, eight validated tags, independent hard deadlines and soft reminder dates/times. Tasks screen now supports searching title/notes/tags, workspace filtering, open/pinned/overdue/long-term/completed/cancelled filters, and sorting by due date, priority, name or creation order. All actual task records live in Neon; task time totals still come from browser-local timer sessions.

## M3.2 — Lifecycle

Complete, cancel, reopen, revision-safe archive/unarchive, recoverable Trash/restore, and separately confirmed permanent deletion. Parent archive, trash and restore act on the entire subtree, preserving hierarchy. Permanent deletion only permits a trashed leaf task and requires entering DELETE; task photos are removed by a cascading FK. Lifecycle trigger records completed/cancelled timestamps. Independent task_events records significant status and field changes, moves, and Trash transitions. Activity view combines local time sessions (clearly local) with saved Neon task events.

## M3.3 — Long-term and nested tasks

Support nested subtasks, long-term task classification and filter, parent selection in task form, adding subtasks from task details, and explicit confirmation when a parent still has open descendants. PostgreSQL rejects ancestry cycles and cross-account parents; moving a task to another workspace uses one database function to move the whole subtree with transactional FK enforcement and per-owner advisory locking.

Task covers and avatars can be uploaded as JPEG/PNG/WebP, resized/compressed client-side, validated again on the server and stored privately in dedicated owner-scoped Neon task_media rows (180 KB/file limit). Files are read via authenticated API and do not persist in the browser's local task-media cache. Task images support replacement, deletion and vertical focal point adjustment. Workspace photos remain browser-local and are outside M3.

## Data changes

- 0005_task_management: completion/cancellation/archive fields, pinning, tags, task events, hierarchy trigger, subtree-move function, private task-media table and relevant indexes.
- 0006_task_media_cascade: cascade private media only when a task is permanently deleted.
- Both migrations were applied to the dedicated Dayframe database and appear exactly once in the migration ledger.
- No real user tasks were inserted or modified by test runs. A synthetic transaction checked completion timestamps, audit entries, parent/child movement, cycle prevention and rollback; zero synthetic records remained afterward.

## Verification completed

- **Backend CI passed:** https://github.com/azmath25/planner/actions/runs/42361697492
- **Mobile/desktop Playwright browser smoke passed** (390px and 1440px; simulated account, tags, priorities, subtasks, cancel/reopen, saved history, task movement, archive/restore, Trash, private photo upload/remove): https://github.com/azmath25/planner/actions/runs/42361624463
- **Live deployed M3 API smoke passed**, including anonymous and forged identity rejection for task routes and photo PUT CORS: https://github.com/azmath25/planner/actions/runs/42361893556
- **Pages branch deployment passed:** https://github.com/azmath25/planner/actions/runs/42361753865
- GitHub main's built JS bundle contains M3 controls. Neon deployed function reports deployment 6 completed.

## Known limits and follow-up

- Real-user, two-account task authorization, cross-device archive and private image upload must be tested manually with actual account sessions. Do not describe mocked browser tests as production user-acceptance tests.
- Safari login cookie limitations noted in M2 remain separate and unresolved until verified in Safari; no hosting changes were authorized.
- Timer sessions, daily pool, fixed intervals, quick notes and workspace images are still **browser-local**. Reliable server time sessions, daily planning and notifications belong to M4/M5.
- Completion of a parent with open descendants requires explicit confirmation. Automated descendant completion is intentionally not performed.
- Rich BlockNote documents, multiple reminders, recurrence, long-term reporting and media at scale are outside M3. Task images use bounded PostgreSQL bytea storage; review growth and storage costs before substantially increasing limits.
- No permanent-delete bulk action or forced cascade of child tasks is enabled; children must be handled first.
- User may access the live preview at https://azmath25.github.io/planner/.
- Stop here before M4.1 unless approved.
