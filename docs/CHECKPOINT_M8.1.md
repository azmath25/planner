# Dayframe M8.1 — Code repairs checkpoint

**Branch:** `feature/dayframe-m53-release-20261107`
**Status:** implemented in source; full tests not executed. No production changes.

## Repairs completed in source
- Note push worker uses the claimed owner's identifier. A focused isolated JavaScript delivery check succeeded.
- Document creation can retry a lost response with the same UUID, without bypassing normal unsaved-draft protection.
- Document autosave now advances the saved revision without remounting BlockNote. Account refresh/sign-out asks before discarding an unsaved draft.
- Migration 0019 prevents moving a task with linked active documents into another workspace. Restoring an incompatible deleted document is also blocked. This is a safe constraint, **not** automatic document relocation.
- Migration 0020 requeues pending notifications on timezone/quiet-hours preference changes. At-least-once delivery and in-flight race limitations remain.
- The native Neon trigger header/body consistency check is retained. Neon Functions' proxy is the trusted source of that header; a proposed extra header was reverted because the native scheduler does not send it.
- Automated publish workflows were switched to manual dispatch, to avoid accidental release on a later merge.

## Source tests staged
`backend/tests/note-reminders.test.mjs`, `backend/tests/reminder-dispatch.test.mjs`, `tests/m62-documents-browser.py`, and `tests/deep-postgres-regression.mjs` (migrations 0001–0020, owner isolation, document moves, preferences).

## Outstanding
No package lockfile; no runnable npm install, TypeScript build, disposable PostgreSQL, Playwright or Safari run in this environment. Large account document search and Insights SQL require benchmarking; auth-token audience and real Neon trigger gateway need verification. Release remains blocked pending M8.3.

No merges, Cloud Shell, GitHub Actions runs, production migrations or deployment.
