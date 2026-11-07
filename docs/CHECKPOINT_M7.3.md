# Dayframe M7.3 — Insights, deadline history and safe CSV

**Development branch:** `feature/dayframe-m53-release-20261107`  
**Status:** SOURCE IMPLEMENTATION STAGED, NOT RELEASE READY.  
No GitHub Actions, Cloud Shell, live Neon, production Pages build, protected `main` branch or paid-budget change.

## Committed source slices

### M7.3a — Period CSV export
- `web/src/domain/reportCsv.ts` exports the already validated owner-scoped period-report object, with account, per-workspace and long-term-task rows.
- CSV uses UTF-8 BOM, CRLF line endings, quoted/escaped fields and leading-apostrophe protection against spreadsheet formula injection from user-controlled titles. Long-term rollups are explicitly labeled as overlapping, not additive account totals.
- `web/src/legacy/legacy.ts` provides a user-triggered Download CSV control; export uses the report already loaded in the browser, with **zero new API calls**. `tests/reportCsv.test.mjs` authored, not run.

### M7.3b — Completion insights and estimate comparison
- `backend/src/time-insights.mjs` derives period calendar bounds in the account's current IANA timezone. The historical source is `dayframe.task_events`: each completion event contains **the deadline and estimate snapshot at completion time**, rather than current mutable task fields.
- Shows count of completion **events** (not unique tasks), number with/without deadlines, on-time vs late events, and the newest 30 completion entries. Date-only deadlines finish at the end of their stated local day. A later re-completion may create another episode; do not misrepresent this as a task-based success rate.
- Estimate comparison uses the latest completion event per task in the period and sums directly associated exact recorded time segments up to the completion instant. Tasks with detected legacy residual time are excluded, so the resulting recorded-to-estimate percentage is *measured coverage*, not a full account-wide accuracy score. Historical time-zone settings were not snapshotted.
- Owner-scoped `GET /v1/time-insights?period=day|week|month&day=YYYY-MM-DD` validates the JWT, period and date and returns one bounded summary. Migration `0018_completion_insights_index.sql` adds an owner/time index for completion events.
- `web/src/domain/timeInsights.ts` rejects malformed/inconsistent summaries; `cloudApi.getTimeInsights()` is typed. Insights on signed-in Reports load **only when the user clicks Load insights**, avoiding automatic extra calls. The panel shows coverage limitations, event counts and history.

## Tests authored, NOT executed
- `backend/tests/time-insights.test.mjs`, `tests/timeInsights.test.mjs`, `tests/reportCsv.test.mjs`.
- Disposable PostgreSQL `tests/deep-postgres-regression.mjs` expects all migrations **0001–0018**, and stages owner isolation, event snapshot at completion, on-time date+time, date-only late completion and exclusion/coverage checks.
- Isolated browser `tests/build-m73-harness.mjs` + `tests/m73-insights-browser.py` cover opt-in loading, event labels and changing the period without stale insights.
- Limited source parsing of updated JavaScript backends, test sources and legacy UI **passed** with ESM/TS wrappers removed. This is not Node module execution, type checking, npm dependency resolution, SQL execution or Playwright.

## Open acceptance risks and nonclaims
- **No actual PostgreSQL, TypeScript build, Node tests, browser/Safari tests or deployed API checks have run.** On-time counts and estimate ratios are not production-verified.
- SQL performance and accuracy with reopened tasks, sessions continuing across completion, long completion histories, legacy residuals and renamed/deleted tasks require isolated audits. The earliest historical event data cannot reconstruct missing pre-audit deadlines.
- Current account timezone is applied to past events. Exact historical time-zone-at-completion records do not exist. A period report is not a user analytics tracker and no fabricated trends or activity events are stored.
- No file uploads or public document sharing were enabled in M6.3. No automated releases, payments or GitHub Actions workflows have been triggered.

## M7.3c — Audited six-week trends, safer estimate coverage and Insight CSV

**Source staged on the same feature branch; final acceptance is still blocked on unrun integration tests.**

- One canonical authenticated endpoint remains: `GET /v1/time-insights`. An overlapping draft `GET /v1/insights` implementation and its duplicate parser/client were removed, so there are no competing metric definitions or additional browser calls.
- `backend/src/time-insights.mjs` now includes **six ISO weeks** of owner-scoped focus-tracking segments and completion **events**, with exact timezone-adjusted week boundaries. A currently running segment is counted through one database snapshot instant. Pre-segment legacy residuals are excluded from this time-series and are **not** silently converted to exact focus.
- Estimate comparison now requires both a positive direct tracked duration and a recorded completion-time estimate, with zero known legacy residual. The API separately counts `untrackedTasks` and `excludedLegacyTasks`; it also returns the sum of task-level absolute estimate-versus-tracked differences. These metrics measure **recorded time coverage**, not total human labor or a prediction of task duration. Latest completion per task is used for comparisons; repeated completion events are counted independently for deadline history.
- Date-only deadlines end **strictly before** the following local midnight; explicit time deadlines include the stated instant. A task completed exactly at the next midnight is late for a date-only deadline. Historical timezones were not captured at completion; the current account timezone remains a limitation.
- `web/src/domain/timeInsights.ts` validates the complete trend, estimate exclusion counts, event shapes, time precision and cross-field totals. Its `timeInsightsCsv()` emits quoted/escaped UTF-8 CSV, CRLF, and leading-apostrophe protection for formula-like task titles. CSV export occurs **only on user click** from a loaded, owner-validated Insights response; it makes **zero extra network requests**. The history section is capped at 30 events, clearly labeled, while summary counts cover the full selected period.
- The Reports UI shows four sourced Insight metrics, the six-week trend table/bars, date-only deadline semantics and completion-audit detail. It avoids silent requests: Insights load on demand and previous results are invalidated on period/date change.
- Focused regression source was updated for the new payload: `tests/timeInsights.test.mjs`, `backend/tests/time-insights.test.mjs`, isolated `tests/build-m73-harness.mjs` and `tests/m73-insights-browser.py`. A disposable PostgreSQL scenario was added to `tests/deep-postgres-regression.mjs`, checking separate owners, local-midnight cutoff, exact focus vs legacy, estimate difference and weekly trend. A duplicate SQL symbol import found during integration review was fixed.

**Verification executed here:** limited V8 source parsing for the edited JavaScript backend, browser legacy module and harness (with import/known TypeScript syntax stripped) passed. The isolated CSV formatter was actually evaluated against a synthetic task title beginning with `=HYPERLINK(...)`; its output contained the required escape prefix, doubled quotes, BOM and CRLF. This is **not** a TypeScript build, `npm test`, PostgreSQL query execution or Playwright run. Local GitHub checkout was blocked by DNS; no Cloud Shell or Actions workaround was used.

**Outstanding release risks:** SQL planning and exact behavior on a disposable PostgreSQL server, source install/typecheck/build, browser harness (including CSV downloads), account and date isolation, realtime event races, Safari mobile, performance with long audit histories, PWA update handling and high/critical dependency advisory review all remain unverified. Migration `0018_completion_insights_index.sql` is only authored; no live schema was changed.

**Next implementation:** M8.1 Quality/security/performance and browser acceptance checklists, M8.2 PWA/offline behavior, and M8.3 a reproducible **local disposable-environment** release verification gate. Merging/deploying remains subject to separate user approval.
