# Dayframe M1–M4: deep audit follow-up and remaining gates

Date: 2026-11-07. Repository: `azmath25/planner`. Scope: M1–M4, specifically concurrency, authorization, reminder delivery, functional UI and deployment. No work on M5.

## Executive result

**M1–M4 core functions are implemented and the expanded functional/regression gate passed. Security audit is NOT fully green.** A live user confirmed receiving a real Dayframe reminder notification in their browser; the earlier gap "no actual notification received" can therefore be marked complete for *that* supported browser and account, not for all browsers/devices.

The latest known full functional deep audit passed at [run 42373585917](https://github.com/azmath25/planner/actions/runs/42373585917): real temporary PostgreSQL (all migrations, concurrent isolation tests), API/worker unit tests, frontend build, and Chromium phone/desktop browser suites. The additional live API authentication/CORS smoke after the most recent deployed functions passed at [run 42374461417](https://github.com/azmath25/planner/actions/runs/42374461417).

The later [run 42374174071](https://github.com/azmath25/planner/actions/runs/42374174071) passed the **postgres-integrity**, **frontend-integrity**, and **browser-integrity** jobs but **failed dependency-security**. Do not describe overall audit CI as fully green.

## Verified remediation in this audit

1. Task Trash and restore now require the caller's observed revision, instead of fetching the current revision from the server immediately before mutating; the database query atomically locks and checks the task root and propagates changes to its descendants. Regression tests cover stale attempts. A Neon SQL rollback rehearsal confirmed stale rev 1 left two tasks untouched, valid rev 2 trashed both, and zero synthetic records remained after rollback.
2. Task archive, unarchive, Trash and restore use the shared `locked_root` CTE to prevent concurrent updates from silently overriding root changes.
3. The scheduled reminder worker rejects mismatched trigger invocation header/body IDs in addition to checking its expected event type and trigger name. This is **not** a substitute for a cryptographically authenticated trigger source.
4. Browser push on sign-out attempts to unregister the current device, while retaining the user's other devices. Stale subscriptions are removed from the browser during account switches. New account enrollment cannot silently transfer an existing endpoint from another user; a cross-owner attempt returns HTTP 409 and is covered by a real PostgreSQL test.
5. Legacy M1 appearance and timer smoke harnesses were modernized to test the **current** React-bridge UI and to run with Playwright-managed Chromium, instead of relying on deleted `app.js` and `styles.css` files.
6. PostgreSQL TLS settings were made explicitly certificate-and-hostname verifying for both the API and the reminder worker. Both were redeployed successfully as **dayframeapi deployment 12** and **dayframedue deployment 4**. Live unauthenticated/security smoke passed afterward.
7. The comprehensive deep audit CI gate exists under `.github/workflows/m1-m4-deep-audit.yml`; it tests actual PostgreSQL constraints and concurrency, backend code, frontend build, responsive UI and domain tests.

## Unresolved high-priority findings

### Security dependency gate — blocking
`npm audit --omit=dev --audit-level=high` on 2026-11-07 reported **10 production dependency advisories (6 low, 3 high, 1 critical)**. The report included transitive `better-auth` / `@better-auth/drizzle-adapter` advisories, `deepmerge` through email/HTML dependencies and `zod`. Those packages arrive in the dependency tree of `@neondatabase/auth@0.7.0-beta`. This audit result is a **dependency-tree warning**, not proof that every vulnerability is exploitable through Dayframe's actual browser and Neon server surfaces. Avoid `npm audit fix --force` without testing the resulting auth SDK compatibility. Pin/lock audited versions and remediate or document justified exceptions before calling the security gate green. There is no committed package lockfile at audit time, making installs potentially nondeterministic.

### Authenticated multi-browser acceptance — blocking
Real Safari session restore/refresh/sign-out and two actual accounts on separate devices have not been independently reproduced in this audit. The mock-account browser test does not prove real Neon Auth cookie compatibility, and cross-account database checks cannot substitute for real-browser sign-in.

### Reminder behavior beyond a successful push — test gate
A user confirmed that a reminder appeared in the browser. Still manually verify snooze after a real delivery, acknowledgment, opt-out, clicking the notification to reopen Dayframe, logout on a shared browser, browser denied-permission behavior, the next 5-minute trigger, and background delivery when the tab is closed. Five-minute polling and push-service delays mean this is best-effort, not exact-to-the-second delivery. Safari and iOS installation/support must be treated separately.

### Broader product features — future scope, not current bugs
Multiple independently scheduled reminders on one task, recurrence, quiet hours, email alerts, and configurable deadline warnings are not implemented. Timer sessions, daily capacity, quick notes and workspace photos remain device-local by design; later milestones cover some of that. The UI still uses a large legacy imperative adapter within React; gradual refactoring is advisable.

### Remaining hardening and reliability
The push trigger source is checked with IDs/header rather than a cryptographic proof; direct HTTP access should eventually be isolated or authenticated more strongly. Outbox Web Push delivery remains at-least-once across crash/receipt boundaries. No fully automated signed-in two-device test exists. The five-minute worker has a recurring Neon resource cost; monitor actual usage.

## Recommendation and release gate

**Do not begin M5 until** (1) high/critical dependency findings are triaged or remediated and the CI result is explicable, (2) real Safari and two-account tests are completed, and (3) the user tests acknowledgment/snooze/opt-out alongside the already-confirmed browser notification. For current test-first M1–M4 scope, all PostgreSQL/frontend/browser/security-smoke functional checks passed; **zero-bug or full security sign-off cannot be claimed**.

Source of truth for implementation is executable code and deployed state; this document is an audit record, not a substitute for a future retest.
