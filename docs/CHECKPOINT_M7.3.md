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

**Next implementation:** M8.1 Quality/security/performance and browser acceptance checklists, M8.2 PWA/offline behavior, and M8.3 a reproducible **local disposable-environment** release verification gate. Merging/deploying remains subject to separate user approval.
