# Dayframe M4.1 — Daily Pool checkpoint

Date: 2026-11-07
Scope: **M4.1 only**, not timed-interval scheduling (M4.2) or reliable reminders (M4.3).
Repository: `azmath25/planner` — `main` only
Backend: dedicated Neon project `soft-night-61558675`, branch `br-shiny-king-b9np2anx`, database `dayframe`.
Published preview: https://azmath25.github.io/planner/

## What changed

- A signed-in account now has a **separate, ordered, untimed task pool for each calendar date**, stored in Neon.
- Add tasks across any of the account's active workspaces; remove from a day's pool without removing the task; manually reorder with up/down controls.
- The screen loads the current day's pool on account mount and fetches the selected day when the date changes.
- Add/remove/reorder operations wait for a successful server write before updating the saved selection. A stale revision (HTTP 409) refreshes the pool and clearly asks the user to review/retry rather than silently overwriting a newer order.
- Loading/save errors are shown inline with a retry action. Active tasks only; no duplicate selection; maximum 100 tasks per day.
- Legacy browser-local demonstration remains a demonstration. Old local daily pools are **not imported** into signed-in Neon accounts.
- Home reads the already-fetched pool for today's priorities. The signed-in localStorage snapshot deliberately excludes the saved pool, avoiding a second source of truth.
- 320–480px pool controls have enlarged touch targets; responsive tests cover desktop widths as well.

## Schema and API

Migration: `backend/db/migrations/0007_daily_pool.sql`

- `dayframe.daily_pools(owner_user_id, plan_day, revision, updated_at)` — primary key per user/date.
- `dayframe.daily_pool_items(owner_user_id,plan_day,task_id,position,created_at)` — unique task and order per user/day, composite FK enforcing task ownership.
- `dayframe.replace_daily_pool(owner,day,expected_revision,task_ids)` performs a single transactional ordered replacement. It locks the day's revision row, rejects stale concurrent writes, duplicates, over-100-item lists, tasks outside the verified owner, completed/cancelled/deleted/archived tasks and tasks in archived workspaces.
- `GET /v1/daily-pool/YYYY-MM-DD` retrieves revision + ordered active IDs. `PUT` accepts `{revision,taskIds}` and returns the new revision. JWT-subject ownership is determined server-side; incoming body owner fields are ignored.
- Neon Function deployment **7** completed successfully using Node 24. The `0007_daily_pool` migration appears exactly once in `dayframe.schema_migrations`.

## Verified

1. [Backend CI](https://github.com/azmath25/planner/actions/runs/42363999902) — API and ownership unit tests passed, with a bundled deployable Function.
2. A **real SQL rollback test** used synthetic users and tasks across two workspaces: initial insert, reorder, revision increment, rejected stale revision, rejected other-user task, rejected duplicates. The transaction rolled back all synthetic rows; a post-rollback query returned zero pools/items/tasks.
3. [M4.1 Playwright test](https://github.com/azmath25/planner/actions/runs/42364352507) — passed on 390px mobile and 1440px desktop. It exercised cross-workspace selection, saved reorder after a remount, independent dates, removing a task from the pool without deleting it, conflict refresh and no horizontal overflow at 320/390/768/1440px. This test uses a simulated Neon service; no real account records were touched.
4. [React production build](https://github.com/azmath25/planner/actions/runs/42364074426) — TypeScript and frontend build passed.
5. [Live M4.1 API security smoke](https://github.com/azmath25/planner/actions/runs/42364574216) — passed for health, rejection of anonymous/forged GET/PUT, trusted GitHub Pages PUT preflight and blocked untrusted origin.
6. Branch-based GitHub Pages publish completed successfully; published compiled JS contains the M4.1 API path and pool status UI.
7. Exactly one GitHub branch (`main`) remains in use. No Quizer or Mimo resources were changed.

## Intentionally not included

- Timed schedule intervals, capacity and calendar time blocks are **still device-local**, even for signed-in accounts. They are not migrated or synchronized by M4.1. A task may exist in both a local timed block and a Neon-saved untimed pool; time-block changes do not implicitly change the cloud pool.
- No reminder delivery, snooze or notification changes; no edits to hard deadline/soft reminder data.
- No automatic import of preexisting local pools, offline write queue, drag-and-drop or real-time push across devices. Revisiting a date loads the latest version; stale writes reload.
- Personal timers and reports still use local session data, as before.
- A real authenticated two-account browser acceptance test remains to be done, including an actual cross-device sign-in (Safari restrictions from M2 are unchanged). Automated Playwright tests use a simulated account, not a real user session.

**Checkpoint boundary:** Stop before M4.2. Continue only with user approval.
