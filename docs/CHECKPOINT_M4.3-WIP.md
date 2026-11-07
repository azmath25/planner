# Dayframe — M4.3 Reminders, implementation checkpoint (INCOMPLETE)

**Date:** 2026-11-07  
**Repository:** `azmath25/planner`, `main` only  
**Status:** Initial in-app alert lifecycle code committed; **NOT a delivered M4.3 release**. Stop before M5.1.

## Implemented in source

- New additive migration `backend/db/migrations/0009_reminder_actions.sql` stores acknowledgment and snooze decisions by owner, task, alert kind, and the *current* source date/time. This prevents a reminder moved to a new date from inheriting a dismissal for the old date.
- PostgreSQL owner/task foreign keys and active-task validation prevent cross-account writes and decisions on completed, archived or trashed tasks.
- A transaction-scoped advisory lock plus revision checks reject stale concurrent alert updates. A snooze may be at most 30 days ahead. The hard deadline and soft reminder fields never change on acknowledge or snooze.
- The authenticated `GET /v1/alerts?timeZone=...` endpoint returns active soft reminders already due and hard deadlines upcoming within 48 hours (plus overdue alerts) for an IANA time zone supplied by the browser. A signed-in Home inbox displays them and offers Acknowledge and Snooze 1 hour.
- Owner-scoped endpoint validation/regression tests were added under `backend/tests/reminders.test.mjs`.

## Unfinished / verification gates

1. SQL migration 0009 is **not yet applied to Neon** and the updated API Function has **not been deployed**. The current live API may return 404 for the new routes; website UI should not be regarded as operational M4.3 functionality.
2. A scheduled server-side due-delivery worker and a verified delivery channel (web push / email with user opt-in) are **not implemented**. In-app list refresh depends on the site being open; it is not a replacement for reliable closed-browser delivery.
3. Account-level time-zone/quiet-hour settings, DST gap/fold policies, multiple independent reminders per task, recurrence, delivery retries, and deduplicated channel receipts are still outstanding. Current inbox uses the browser IANA zone; cross-device consistency needs an account preference.
4. Regression tests and build CI are needed at the final commit, plus real Neon rollback rehearsal, verified deployment, mobile/browser acceptance, and two-account tests.
5. The legacy task-level reminder date/time schema remains unchanged for backward compatibility. No browser-local interval imports, timer synchronization or unrelated project changes were attempted.

**Do not label M4.3 complete, deploy delivery or proceed to M5.1 until these gates are resolved.**
