# Dayframe — M5.2 Time Rollups and workspace creation checkpoint

**Date:** 2026-11-07  
**Scope:** M5.2 plus the requested workspace-level Add task action. Repository `azmath25/planner`, `main` only.  
**Neon:** existing Dayframe project `soft-night-61558675`, database `dayframe`; no migration, destructive data edit, or automatic import.  
**Boundary:** stop before M5.3 (estimates, targets, remaining-work forecasts).

## User-reported bugs addressed

1. **Parent recorded time omitted subtasks.** Task details now show **inclusive recorded time** from the task, children, grandchildren and deeper descendants, plus an explicit **Own time / Subtasks time** breakdown. The subtask count now counts all visible descendants and separately identifies how many children are direct.
2. **Workspace Add task action was hard to discover.** Workspace detail now has a prominent **Add task** button in its header and another in the task card. Clicking either opens the existing creation form with that workspace selected; submitting saves the task to that workspace.
3. **Workspace time metric used an old local task field.** It now comes from recorded Neon sessions. Reports show an actual account all-time total and workspace totals instead of hard-coded sample figures for authenticated users. Period charts and unrelated forecasts remain explicitly deferred to M7.

## Accounting invariants and historical semantics

- Each `time_sessions` row contributes **once** to the account total. Workspace totals are grouped by the **immutable workspace_id_snapshot recorded at session start**. Moving or archiving a task does not rewrite the workspace that historically earned those minutes. Permanently deleted tasks still contribute to their original workspace and account total.
- Task totals follow the **current surviving task hierarchy**, with one recursive leaf-to-ancestor path per task. A parent includes its own direct time and each descendant once, no matter how deeply nested; a subtask's historical time moves with it when the hierarchy is changed. The UI displays direct and inclusive time distinctly. The sum of all parent rollups is **never** used for workspace/global totals.
- If a task is permanently deleted, its session's nullable task_id no longer identifies a parent; its time remains in workspace/global history, not attributed to an arbitrary surviving parent. This is a deliberate M5.2 historical rule, not a lost record.
- An active running segment is **not** included in stored `accumulated_ms` until pause/stop. API snapshot provides `activeAncestorIds` and the browser adds that in-progress segment using the monotonic timer exactly once to each relevant displayed rollup. A paused segment is not counted again.
- All rollups use authenticated JWT ownership from the API, a single PostgreSQL statement and no additional browser fetch. `GET /v1/time-session` preserves M5.1's `session` and `taskTotals` response fields and adds `rollups`; the browser validates nonnegative safe integers and that workspace sums reconcile to the account total.

## Verification

- The actual M5.2 SQL statement was executed read-only on Neon with a synthetic nonexistent owner. It returned empty task/workspace sets and zero account time without SQL errors. There was no user mutation.
- The ephemeral PostgreSQL integration suite exercised a parent/child/grandchild/sibling hierarchy, independent workspace, permanently deleted task, owner isolation, active ancestor map and reparenting. It verified direct totals 1000 + 2000 + 3000 + 4000 + 5000 ms = 15000 ms while the account also retained 6000 ms of deleted-task history; the account total remained 21000 ms. Reparenting changed the displayed parent, not the historical workspace.
- [Dedicated M5.2 responsive browser regression](https://github.com/azmath25/planner/actions/runs/42379019943) **passed**, including three nested depths, direct-versus-descendant breakdown, General/custom workspace Add task form defaults and persisted placement, account totals and 320/390/768/1440px layouts.
- Main source-focused frontend/build CI and isolated PostgreSQL jobs passed before final minor UI hardening. Some GitHub Actions attempts for the last UI commit failed almost immediately without producing step logs; retry their jobs rather than calling them a code regression or a pass. Record final rerun evidence before complete release sign-off.
- Neon `dayframeapi` **deployment 14** completed with the new backend bundle. No new credentials or project were introduced.

## Open items

- Real two-device signed-in exercise and Safari auth were outstanding before this milestone. They remain acceptance tests, not automated evidence.
- The M1–M4 deep audit's high/critical transitive Neon Auth dependency advisories remain unresolved. A security CI failure must not be characterized as full audit success.
- M5.3 estimates/weekly targets and M7 date-scoped charts are **not** implemented. All-time rollups are deliberately not mislabeled as daily/weekly totals.
- Session-by-session historical timeline, historical-parent snapshot attribution and a user-reviewed migration of old browser-only timer history would require their own design; no historical browser records were overwritten.

**Stop at M5.2.** Preserve only GitHub `main`; do not begin M5.3 or modify Quizer/Mimo.
