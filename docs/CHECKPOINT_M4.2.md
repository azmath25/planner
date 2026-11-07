# Dayframe — M4.2 Timed Scheduling checkpoint

**Date:** 2026-11-07  
**Scope:** M4.2 only — fixed intervals, splitting effort across dates, overlap protection, capacity warnings and responsive calendar views. No reminder-delivery or time-tracking migration.  
**Repository:** azmath25/planner, `main` only  
**Backend:** dedicated Neon project `soft-night-61558675`, branch `br-shiny-king-b9np2anx`, database `dayframe`.  
**Live API:** `dayframeapi` deployment **8**, Node.js 24, status completed.  
**Web:** https://azmath25.github.io/planner/

## Completed behavior

- A signed-in user's **fixed-time intervals are saved in Neon**, with task ID, local calendar date, start/end clock time, IANA time zone, stable UUID and optimistic revision.
- **Plan your day:** create an interval from any active task; edit its time or task; move it to another date; remove only its scheduled time, retaining the task, its deadline/reminder and the separate untimed daily pool.
- **Split a task across days:** add multiple independent intervals to the same task on different dates. A block stays within one calendar date; create two blocks rather than silently spanning midnight.
- **Conflict detection:** PostgreSQL trigger takes a per-user transaction-scoped advisory lock and rejects overlapping time ranges for a given date, including under concurrent workers. Back-to-back blocks (one ends when another begins) are valid. Stale edits/removals fail rather than overwriting another device's changes.
- **Time-zone consistency:** each interval records its IANA time zone. All timed blocks for the same account and local calendar date must use one zone; the database rejects mixed-zone blocks. This is local wall-clock planning, not a promise of instant-based DST fold/gap resolution.
- **Overcapacity:** the Plan view computes fixed scheduled minutes plus flexible pool workload against the user's *device-local* available-hours setting. Scheduling beyond capacity shows a confirmation/warning; the capacity preference is advisory and does not reject valid overlapping-free blocks at the server.
- **Calendar:** day, week and month views show saved intervals, local-day durations and overcapacity warnings; users can navigate between dates, open a day in Plan and edit an existing block. Phone widths show readable stacked or two-column calendar layouts and minimum 44px interval controls.
- **Archived tasks:** previously reserved intervals remain visible as `Archived task · reserved` rather than invisibly blocking a new appointment. Remove a reserved interval or restore the task before reassigning it.
- **State ownership:** for authenticated users, browser localStorage is no longer a second source of truth for scheduled intervals. Cloud reads on sign-in, Plan navigation/date changes and calendar date-range changes; edits are written to the server. The anonymous **local demo** still uses a local sample schedule, unchanged.

## SQL and API

`backend/db/migrations/0008_timed_intervals.sql`:
- Table `dayframe.scheduled_intervals` with owner/task composite FK, validated minute ranges, time zone, revision, created/updated timestamps, and owner/day and owner/task indexes.
- `dayframe.validate_scheduled_interval()` trigger validates active task ownership on writes, enforces consistent day/time zone and rejects overlaps with a transactional per-owner advisory lock.
- `dayframe.save_scheduled_interval(...)` is the revision-checked transaction boundary for new and moved blocks; retries with the same new UUID/payload are idempotent; stale or changed bodies are rejected.

Authenticated routes derive the owner exclusively from the **verified Neon JWT**:
- `GET /v1/timed-intervals?from=YYYY-MM-DD&to=YYYY-MM-DD` (maximum 45-day window, sorted by day/clock; up to 2,500 results).
- `PUT /v1/timed-intervals/:id` validates task, clock times, date, zone and revision, returning saved interval.
- `DELETE /v1/timed-intervals/:id` requires the current revision.

## Verification

- [Backend CI](https://github.com/azmath25/planner/actions/runs/42366917147) **passed**, including M4.2 owner-scoped read/write, separated dates, overlap, adjacent boundaries, optimistic edits, create retries, invalid inputs, fabricated credentials and CORS.
- **Real Neon SQL rollback rehearsal passed**: inserted disposable owner/task rows, created adjacent blocks, rejected an overlapping block, rejected a foreign-account task, rejected a stale revision, moved an interval to another day and verified its revision. The synthetic records were rolled back. A second rollback check confirmed that two different time zones cannot be used on the same day, again leaving zero synthetic records.
- [Mobile/desktop Playwright regression](https://github.com/azmath25/planner/actions/runs/42366996931) **passed** at 390px and 1440px against a simulated account/API: create, adjacent blocks, client collision message, move day, capacity warning, remount, Calendar day/week/month, remove and no horizontal overflow at 320/390/768/1440px.
- [React production build](https://github.com/azmath25/planner/actions/runs/42366856666) and [GitHub Pages branch deployment](https://github.com/azmath25/planner/actions/runs/42367105807) **passed**. Published `main` root bundle includes the interval editor, calendar views and archived-reservation labels.
- [Live deployed API security smoke](https://github.com/azmath25/planner/actions/runs/42367106424) **passed**: health, anonymous/forged JWT denial on schedule routes, trusted Pages PUT/DELETE preflight, and blocked untrusted origins.
- Neon Function deployment **8** confirmed completed. Only GitHub `main` is used.

## Boundaries and remaining acceptance

- M4.1's **untimed daily pool is independent**. Editing, moving or removing timed blocks does not silently rewrite the flexible pool or a task's hard deadline/soft reminder.
- **Capacity remains browser-local**. Reminder delivery, snooze/alerts (M4.3), persisted timer sessions (M5) and data reports are **not** implemented here.
- Older browser-local scheduled blocks are not automatically imported into authenticated Neon accounts; they remain on the originating device. This avoids silent duplication or overwriting. A later explicitly approved import tool could reconcile them.
- User time zones label wall-clock intervals; complex daylight-saving transition rules and calendar interoperability require separate real-world acceptance tests.
- The browser test used a simulated account. **Real two-user authentication, cross-device edits and Safari login** still require user acceptance; previously noted third-party cookie behavior has not been altered.
- No Quizer or Mimo project data, protected branches, billing or hosting configuration was changed.

**Stop before M4.3 — Reminders**. Proceed only with explicit approval.
