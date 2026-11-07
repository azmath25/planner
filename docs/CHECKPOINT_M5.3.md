# Dayframe M5.3 — Estimates, Weekly Targets and Planned vs Recorded

**Checkpoint date:** 2026-11-07  
**Scope:** M5.3 only. No M6 work, no branch cleanup or unrelated app changes.  
**Repository:** `azmath25/planner`, only `main`.  
**Neon:** project `soft-night-61558675`, branch `br-shiny-king-b9np2anx`, DB `dayframe`.

## Status — backend deployed, frontend release not yet verified

- **Schema `0012_weekly_targets` applied**: `dayframe.weekly_workspace_targets` stores one recurring minute target per owner/workspace with optimistic revisions. `dayframe.time_session_segments` records future active spans in the same transaction as pause/stop/switch/task closure. All original M5.1 sessions remain intact.
- **`dayframeapi` revision 15 is deployed**. The custom GitHub Actions builder failed before its steps began, so a validated temporary ZIP was produced by inserting the exact M5.3 weekly SQL and route into the previously compiled M5.2 Node bundle. This compiled `index.mjs` passed JavaScript syntax verification and the ZIP passed CRC/size validation before deployment. The bundle was committed at `backend/packaged/dayframeapi.b64`. **Rebuild it with the normal esbuild workflow when GitHub Actions is available again.** The source of truth remains `backend/src/index.mjs`.
- **Frontend code implemented on `main`**, including the workspace target editor, current-week Reports summary and task remaining-estimate cards. However **the normal frontend Vite build and publish workflow did not run**. Built-in GitHub Pages deployment of previously committed assets is **not** evidence that these new frontend sources were compiled/published. The public site may still show M5.2.
- **Full M5.3 acceptance is NOT signed off.** Do not begin M6 under the assumption that this release has passed browser/CI verification.

## What was implemented

### Remaining work

On each task detail, show the independent **own estimate**, **own remaining**, and **remaining including nested subtasks**. Remaining time is `max(0, estimate - own recorded time)` on open tasks, while completed/cancelled tasks have zero remaining work. Sum descendant remaining time **once per visible task**. A parent’s own estimate is not silently assumed to replace its subtask estimates; the UI labels the distinction. Running time continues advancing via the M5.1 monotonic timer; historical direct totals come from Neon.

### Weekly targets

A recurring weekly target can be set from each active workspace: **0 disables it; maximum 168 hours**. The UI uses quarter-hour increments. Target changes require the last observed revision; stale updates return HTTP 409, are refreshed, and surface a conflict message. JWT account identity, not a browser-supplied owner field, determines SQL ownership. Targets survive account sessions and are never inserted into another owner’s workspace.

### Planned vs recorded time

`GET /v1/time-week` returns the **current Monday-to-Monday week** according to the owner’s saved `dayframe.notification_preferences.time_zone` (default UTC until configured, so users should use **Home → Use device time zone** when appropriate). The result includes each workspace’s current **fixed scheduled minutes** (M4.2 blocks), **actually recorded time** (M5.1/M5.3 segments), goal and progress, and separate account totals.

These measures are intentionally independent: a fixed schedule is a *current plan*, not a frozen historical commitment; an actual session may be unscheduled. Flexible daily-pool selections do not imply additional fixed minutes. Workspace actual time follows the immutable workspace snapshot recorded at session start, never double-counts nested task totals, and includes sessions from archived or deleted tasks.

Future recorded active spans are sliced by the **actual IANA-local week boundary**, so crossing a week boundary or DST offset is handled at the timestamp level. Completed spans are written when running transitions to pause/stop; the current running span is included in a snapshot without being stored twice. Existing pre-0012 sessions only contain total accumulated time: residual historical milliseconds **cannot be accurately split into past weeks**. They are assigned to the session-start week and explicitly reported in `legacyEstimatedMs`; no fictitious historical segment rows were fabricated.

## Evidence checked in this turn

- **Live additive migration rehearsal** of all six DDL/ledger statements inside a savepoint succeeded, then rolled back; later applied successfully to Neon.
- **Live read-only weekly query** for an owner with no data returned the correct current week, no workspace rows and zero aggregates.
- **Live synthetic rollback rehearsal** created one workspace, one old session, one 180-minute goal and one 90-minute fixed interval; the query returned `actualMs: 45000`, `legacyEstimatedMs: 45000`, `plannedMinutes: 90`, `targetMinutes: 180`, `Asia/Baku` time zone. Synthetic data was rolled back and a follow-up confirmed **0 surviving synthetic workspaces, sessions and goals**.
- **Owner/revision checks** using the exact production target SQL: create at revision zero succeeded, stale create had zero changed rows, correct revision incremented the target, and a different owner had zero changed rows.
- **Server segment lifecycle**: synthetic `start → pause → resume → stop` wrote two completed active segments, with total segment milliseconds equaling the saved time-session milliseconds, zero `legacyEstimatedMs`, and no persisted test rows after rollback.
- **Static JavaScript syntax checks** passed for `web/src/legacy/legacy.ts`, `backend/src/index.mjs`, and the M5.3 browser harness. The patched compiled bundle also passed syntax and ZIP checksum validation.
- **Nonmutating deployed endpoint security smoke** is now also authored in `tests/live-m53-week.mjs` with `.github/workflows/live-m53-week.yml` (health, anonymous/forged-JWT refusal, allowed/forbidden CORS). GitHub Actions execution of this smoke remains unverified.
- **Automated tests authored but not successfully executed due GitHub Actions infrastructure:** `backend/tests/time-week.test.mjs` (auth, validation, concurrency conflict mapping); extensions to `tests/deep-postgres-regression.mjs` (12 migrations, crossing-week time, fresh segment capture, concurrent target revisions); `tests/m53-week-browser.py` and associated harness/workflow (320, 390, 768, 1440 pixels, remaining estimates, goal revisions, conflict display, plan/actual). GitHub Actions workflows failed within seconds with no job steps/logs on multiple attempts, including reruns. These must not be represented as passing CI.
- **Published Neon Function**: revision 15 reports `completed`. A direct external HTTP smoke of the new deployed endpoint could not be completed through available public browsing access. Normal live route/auth checks still require a successful CI runner or authenticated device.

## Follow-up audit: runner failure and extra lifecycle checks (2026-11-07)

- The GitHub API identifies this repository as **private**, not public. In failed M5.3 browser run [42382733137](https://github.com/azmath25/planner/actions/runs/42382733137), its second attempt's job had **runner_id=0, an empty runner_name and zero steps**; other private-repository CI jobs show the same symptom. This indicates a **pre-runner admission failure**. GitHub usage/billing or account entitlement is a plausible cause, but the required check-run annotation cannot be retrieved using the connected GitHub APIs, so the exact billing state is **unconfirmed**. GitHub's public status listed Actions operational on Nov 7. Pages deployment on the same account still succeeds, but that is a different workflow mechanism and does not fix hosted-runner access.
- Account owner should inspect **GitHub Settings → Billing & licensing → Budgets and alerts** and Actions usage/payment notifications. Do **not** raise a paid limit automatically. If those are healthy and hosted jobs still fail with zero steps, contact GitHub Support with the run ID above and its check-run annotations.
- The exact production Neon SQL was additionally exercised in an isolated rollback: **start → switch → stop**, followed by a fresh session that was **auto-stopped by workspace archive**. All three resulting stopped sessions had exactly one active span each, with summed `time_session_segments.duration_ms` equal to saved `time_sessions.accumulated_ms` and correct `switched`, `stopped`, `workspace_archived` stop reasons. The test transaction was rolled back, leaving no test data.
- Added [`scripts/m53-verify-local.sh`](../scripts/m53-verify-local.sh): a **single-command, non-deploying** local fallback. Run `bash scripts/m53-verify-local.sh` from a checked-out main. It explicitly distinguishes failing checks from unavailable Playwright/isolated-Postgres checks; it never reports a partial run as green, and does not access GitHub billing or modify Neon.
- The outstanding M1–M4 production dependency advisories remain a separate failing security gate, regardless of runner availability.

## Outstanding gates and follow-up

1. Restore custom GitHub Actions job execution; run **backend authentication checks and bundle**, **M1–M4 Deep Audit Gate**, **M5.3 Weekly Goals and Estimates UI**; do not confuse GitHub Pages’ built-in publish status with passing the Vite build. Once the builder is healthy, repackage/deploy the standard esbuild bundle and publish the newly built site assets from `main`.
2. Run live unauthenticated/forged-JWT and CORS smoke against `/v1/time-week` and `PUT /v1/time-week/targets/{workspaceId}`, and manually confirm an authenticated weekly target saves and recovers on a second browser.
3. Existing M1–M4 dependency-security findings (Neon Auth transitive high/critical advisories) and Safari/two-account acceptance remain open. No forced upgrade or auth package changes were made in M5.3.
4. Preserve original browser-only timer history; it is not automatically imported. Date-scoped charts and historical plan snapshots are still deferred to M7.

**Stop boundary:** M5.3 backend implemented/deployed and frontend coded but **frontend publication/automated acceptance blocked by custom GitHub Actions**. No M6 changes.
