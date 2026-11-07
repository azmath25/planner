# Dayframe M5.1 — Time Sessions checkpoint

**Date:** 2026-11-07  
**Repository:** azmath25/planner, single GitHub `main` branch.  
**Neon:** project `soft-night-61558675`, branch `br-shiny-king-b9np2anx`, database `dayframe`.  
**Boundary:** M5.1 only. No M5.2 nested/global reports or M5.3 time targets implemented.

## Previous audit acknowledged

The independent M1–M4 deep audit remains recorded at [AUDIT_M1_M4_DEEP_2026-11-07.md](AUDIT_M1_M4_DEEP_2026-11-07.md). The user confirmed a real browser reminder arrived. Production-dependency `npm audit` advisories in the Neon Auth transitive tree, Safari Auth acceptance and real two-account testing remain open. M5.1 did not silently waive or resolve them.

## Implemented

1. **Persistent time session rows** via `backend/db/migrations/0011_time_sessions.sql`: each session stores task, task/workspace snapshot at start, server-controlled start/segment timestamps, accumulated active milliseconds, revision, state, and stop reason. Full history is retained in the database; permanently deleting the task clears the foreign-key link while preserving the time record.
2. **One open session per verified account** is guaranteed by PostgreSQL partial unique index for both `running` and `paused` states and serialized, revision-checked transitions under an owner-scoped advisory lock. A paused session occupies the one-open slot. Starting a second task is an **explicit, atomic switch** that ends the previous session and opens the next in one transaction.
3. **Authoritative time calculations:** start/pause/resume/stop and switch use `clock_timestamp()`, never client timestamps or interval ticks. Paused intervals are excluded. Timer display advances from a server timestamp plus monotonic browser elapsed time; no per-second network polling.
4. **Recovery:** authenticated `GET /v1/time-session` returns the current running or paused session plus exact direct-task saved totals. `POST /v1/time-session` supports start/pause/resume/stop/switch with UUID and revision validation. Server ownership derives exclusively from verified Neon JWT subject; malformed and forged requests are denied. Clients refresh on focus, visibility return and at a low 45-second cadence while a page is visible.
5. **Lifecycle safety:** closing, archiving or deleting a task, and archiving a workspace, automatically finalize affected running/paused sessions. Failed/stale updates conflict rather than overwriting a newer device's timer.
6. **UI:** signed-in Home, Tasks and task detail use the Neon timer. Existing local-only preview is unchanged. Buttons are guarded while loading/saving. Current/previous session UI and direct-task totals are displayed; nested/workspace/global time aggregation is explicitly left for M5.2.

## Deployment and verification

- Schema migration `0011_time_sessions` applied and verified on the Dayframe branch. The table was empty before migration; **no existing browser timer history was automatically imported**.
- Dayframe API was deployed as Neon Function `dayframeapi` **deployment 13**; current published `dayframedue` reminder worker remains separate and unchanged.
- Live M5.1 API health, anonymous/forged-JWT denial and GitHub Pages CORS smoke **passed**: https://github.com/azmath25/planner/actions/runs/42376123096
- Real ephemeral PostgreSQL migration/concurrency test run **42376530906**: `postgres-integrity`, `frontend-integrity`, and `browser-integrity` **passed**. `dependency-security` still **failed on known auth-related advisories**, not a time-session test regression: https://github.com/azmath25/planner/actions/runs/42376530906
- Signed-in Playwright mock-Neon session-flow test **passed** for 320, 390, 768 and 1440 pixel viewports, including start/pause/resume/stop, an atomic task switch and two page remount/recovery cycles: https://github.com/azmath25/planner/actions/runs/42376732966
- A transaction-rolled-back rehearsal in the actual Dayframe Neon database returned `running → paused → running → stopped`; a second running session was automatically stopped with reason `task_closed` on task completion. A follow-up count verified **zero synthetic tasks, workspaces and sessions persisted**.

## Limitations and acceptance

- User's browser-only timer history, including any in-progress legacy browser timer when the feature was enabled, is intentionally not auto-imported. Those local records remain on that browser, not added to Neon; automatic import risks duplicates. Any historical reconciliation must be a separate explicit task with duplicate checks.
- Direct task time totals are available; **nested task, workspace and global rollups, historical membership attribution, and remaining-estimate/target calculations are M5.2/M5.3**, not part of M5.1.
- A real two-device authenticated timer interaction is not yet independently confirmed. Human acceptance: start on Device A, load on Device B, pause/resume from B, return to A and refresh, switch tasks, stop, reload and confirm saved direct-task total. Repeat after closing or archiving a task. Safari sign-in should be tested separately because cross-site Neon Auth may be blocked.
- The underlying M1–M4 dependency-security findings remain open. Do not describe the entire security pipeline as green.

**Stop boundary:** M5.1 code, database, backend and interactive frontend are implemented and deployed; independent real-user multi-device acceptance remains open. **M5.2 has not been started.**
