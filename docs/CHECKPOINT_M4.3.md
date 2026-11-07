# Dayframe — M4.3 Reminders deployment checkpoint

**Date:** 2026-11-07  
**Repository:** `azmath25/planner` (only `main`)  
**Project:** Dayframe-only Neon `soft-night-61558675`, branch `br-shiny-king-b9np2anx`, database `dayframe`  
**Implementation:** Deployed. **Human-device and cross-account acceptance remain outstanding.** Do not interpret a green build as proof of a delivered browser notification.

## Implemented
- Existing soft reminder and hard deadline fields remain independent. Acknowledging or snoozing an occurrence never changes the task's due date, reminder date, completion state, or schedule.
- Account-specific acknowledgment/snooze records are keyed to the original kind + source date + clock time; changing that event creates a fresh occurrence.
- The Home screen shows a signed-in, server-backed reminder inbox, a one-hour snooze, and acknowledgment. The inbox includes due/overdue events and those within 48 hours, with an explicit account time-zone option.
- Users can **opt in or opt out** of Web Push from Home. Permission is requested only after a click. A minimal service worker displays a generic notification: no task titles, secret keys, task contents, or authenticated API calls are embedded in push payloads.
- A separate Neon Function `dayframedue` delivers an empty Web Push signal to opted-in devices. It uses the production VAPID private key supplied only through Neon's Function environment. The browser receives only the public key.
- Neon Function Trigger `dayframe-reminder-dispatch`: `*/5 * * * *` (UTC). Native trigger invokes `/dispatch` every five minutes.
- Durable PostgreSQL outbox deduplicates event + destination, uses claim leases and retry backoff, and rechecks task state, action state, due date, and owner before attempting outbound sends. Expired subscription endpoints are removed on push-service 404/410; redirects are forbidden and push hostnames are allowlisted.
- New authenticated endpoints for list/change of alerts, account time-zone preference, push enroll/unenroll, and current-account subscription status. All API access requires a verified Neon Auth JWT; no owner ID is taken from browser request bodies.

## Deployed components
- `backend/db/migrations/0009_reminder_actions.sql` and `0010_notification_delivery.sql` are applied; all ten migrations `0001` through `0010` were verified from the live `dayframe.schema_migrations` table.
- `dayframeapi` Function deployment **10**, status completed.
- `dayframedue` Function deployment **2**, status completed.
- The five-minute trigger is **enabled**. Worker logs show a scheduled invocation at `2026-11-07T12:00:02Z` without an application exception. A PostgreSQL client SSL-mode warning is visible in logs; it is not evidence of a delivery failure.
- GitHub Pages uses `main` branch root, with `sw.js` published at the site root. Website: https://azmath25.github.io/planner/

## Verification evidence
- Backend unit and ownership CI: https://github.com/azmath25/planner/actions/runs/42370782465 — passed. Covers alert route authorization, date/time/revision validation, VAPID ES256 signature construction, push destination restrictions, and dispatcher eligibility.
- Live deployed M4.3 API security smoke: https://github.com/azmath25/planner/actions/runs/42370801019 — passed for health, anonymous/forged JWT denial, browser CORS restrictions and worker denial without a trigger header.
- The live SQL rehearsal was run inside a savepoint: due reminder enqueued once, immediate repeat enqueued **zero**, acknowledgment saved with revision 1. Rolled back the savepoint and then verified **zero** synthetic tasks, workspaces, subscriptions and deliveries remained.
- Frontend typecheck/build and branch-Pages CI passed for M4.3 source. Mobile Chromium reminder-inbox regression workflow: `m43-reminders-browser.yml` (record its final result before closing acceptance).

## Limits and remaining acceptance
1. **Actual Web Push arrival to a real subscribed device is not yet verified.** This requires a real authenticated account and browser permission. Browser/OS suppression, Safari's first-party auth restrictions, and unsupported iOS non-installed websites are not solved by a passing API test.
2. Scheduled delivery may be a few minutes later than the exact reminder time (five-minute polling, queue retries, browser push scheduling). This is not a hard real-time guarantee. The UI inbox can still be checked manually if push is unsupported or denied.
3. The present task editor has a **single legacy soft reminder date/time per task**, not multiple separate reminders. Recurrence, quiet hours, multiple notification channels (email), deadline warning-time customization, and a full DST fold/gap interaction design are still missing from the broader product vision. These are explicit **product-plan gaps**, not silently claimed complete.
4. User's device time zone is adopted when enabling notifications if no account setting exists; user can explicitly update it. Travel/daylight-saving behavior and cross-device agreement need human verification.
5. Browser-local historical intervals were not imported, and timer sessions, daily capacity, quick notes and workspace photos remain local as before. No unrelated migrations, Quizer or Mimo resources were changed.
6. Security hardening option: the Neon schedule-example header is an invocation marker, not a cryptographic signature. A public caller able to forge the marker cannot submit arbitrary push endpoints or task data, and the outbox enforces once-per-event claims, but a stronger source-only trigger trust boundary is desirable before large-scale use.
7. The scheduled trigger creates recurring Neon Function/DB activity; monitor project usage rather than assuming it is cost-free.

## Acceptance procedure
Sign in on a real supported browser, open Home, choose **Use device time zone**, then **Enable browser notifications**, and explicitly allow permission. Create a task with a soft reminder several minutes in the future, close the Dayframe tab, then verify a push appears and opens Dayframe. Repeat with a hard deadline, snooze, acknowledge, and **Disable browser notifications**. Repeat signed in on a separate device/account, including a rejected/blocked-permission case. Verify that another account cannot see the first account's alerts.

**Boundary:** M4.3 core implementation deployed and unit/security/SQL verified; keep user-device acceptance open. Stop before M5.1.
