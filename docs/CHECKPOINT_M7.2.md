# Dayframe M7.2 — Day/week/month account reporting

**Branch:** `feature/dayframe-m53-release-20261107`  
**Status:** Source staged; **not built, database-tested, browser-tested, deployed or merged**. GitHub Actions and Cloud Shell usage: **0** in this development work.

## Backend

- `backend/src/time-period-report.mjs` provides one owner-scoped PostgreSQL query for daily, weekly and monthly reporting. Calendar boundaries use the account's stored IANA notification timezone (default UTC), including local midnight/month/week boundaries. End dates are exclusive.
- Exact recorded focus time sums overlapping finished session segments and the currently running segment at the request instant. Paused time is excluded. Historical residual time without full segment detail is **not** falsely counted as exact: it is reported separately as an estimate associated with the session-start period.
- Workspace rows use the immutable workspace-at-time-session-start snapshot for focus time and include archived/deleted-workspace history where identifiable. Fixed planned minutes use saved scheduled intervals. Long-term task rows include current descendant tasks once per ancestor; overlapping ancestor rows must never be added to derive the account total.
- `GET /v1/time-report?period=day|week|month&day=YYYY-MM-DD` validates date and period bounds, derives owner exclusively from verified JWT, queries one server-side snapshot and returns `no-store` JSON.

## Frontend

- `web/src/domain/timeReports.ts` parses and reconciles numeric durations, rejects unsafe values and checks per-workspace totals against the account total.
- `web/src/auth/api.ts` exposes a typed report client. The signed-in `Reports` page in `web/src/legacy/legacy.ts` includes period toggle, date picker and manual Refresh; it fetches reports only on entering Reports or when the user changes period/date.
- Reports distinguish **Recorded focus time**, **Fixed plan** and **Historical time estimate**. Workspace and long-term task tables explain archived workspaces and overlapping long-term parent/child totals. The unsigned local design preview remains explicitly illustrative.

## Authored tests, not executed

- `backend/tests/time-period-report.test.mjs`: authentication, owner-derived SQL arguments, date/period validation, no accidental POST or arbitrary owner.
- `tests/timeReports.test.mjs`: parser reconciliation, numeric precision and shape rejection.
- `tests/build-m72-harness.mjs` and `tests/m72-period-browser.py`: isolated signed-in report UI, date/period changes, historical-gap text, responsive widths.
- `tests/m72-reports-browser.py` adds an overlapping authored variant with 390px coverage and checks for removal of fake rates. Both are unrun; consolidate redundant browser checks before the final suite to avoid duplicate work.
- `tests/deep-postgres-regression.mjs` now includes **authored, unexecuted** M7.2 segment-boundary, Asia/Baku midnight split, spring Europe/Berlin DST, legacy separation, long-term and owner-isolation checks. Run only against the disposable `audit:...@127.0.0.1:5432/dayframe_audit` database.

## Unresolved validation and product boundaries

- **No tests or actual PostgreSQL queries have been executed** in this session. The SQL and TypeScript need the M8 integration gate, including cross-midnight/DST spans, active timers, deleted tasks, database query plans and large-account pagination/performance.
- Historical residuals are approximations attributed by session-start date. The UI labels this limitation; they must never be presented as exact segment history.
- Fixed planned minutes are the current saved intervals, not immutable historical snapshots of previous schedules; task moves can affect current-workspace plan attribution. Account totals and historical workspace-at-session-start tracking remain independent.
- The query does not implement independent task-completion-on-time or deadline-history metrics. Those belong to **M7.3 Insights** and must not be invented.
- The branch is not compatible with the current unmigrated production database; no production migrations have been executed.

**Next milestone:** M7.3 — sourced insights, estimate accuracy, deadline history and CSV export, then M8 Quality/PWA/release gate. No merge, Actions run, Cloud Shell job, billing change or production deployment without authorization.
