# M6.1 Quick Notes — feature-branch implementation checkpoint

**Scope:** M6.1 initial slice, staged 2026-11-07.  
**Branch:** `feature/dayframe-m53-release-20261107` (no merge).  
**Production:** original `main` site and Neon function **not changed** by this milestone.  
**Release status:** **IMPLEMENTATION STAGED; NOT RELEASE READY** — M6.1a–c source changes are committed on the feature branch. Full verification, account/device acceptance and deployment remain outstanding.

## Implemented in branch source

1. **Additive migration `0013_quick_notes.sql`:** owner-scoped `dayframe.quick_notes` with workspace ownership composite foreign key, title/content caps, color, pin, optional reminder date/local time, optimistic revision, updated timestamps, converted-task pointer, and soft-delete timestamp. No browser-owned user ID in API writes. Does not migrate legacy browser notes automatically.
2. **Atomic note conversion:** `dayframe.convert_quick_note` row-locks the note, verifies owner/revision and active workspace, inserts one task in the same transaction, and saves the converted ID/revision. A retry with the same task UUID is idempotent, while a different second conversion conflicts. Note content is copied to task notes; conversion preserves the source note.
3. **HTTP API:** authenticated `GET/POST /v1/notes`, `PATCH/DELETE /v1/notes/:id`, `POST /v1/notes/:id/convert`. List is paginated, soft-deleted and archived-workspace notes are hidden, creation uses caller-generated UUID for uncertain retries, and updates/deletes use observed revision. All SQL is scoped by verified JWT subject.
4. **Typed frontend service:** verifies cloud note payload shape, paginates, and exposes CRUD/conversion methods.
5. **Signed-in UI:** loads account notes from Neon instead of silently reading old local notes; retains unsynced browser demo samples for anonymous visitors. Supports search, workspace/pinned filters, pinned-first organization, creation, editing, pin toggles, soft deletion confirmation and note-to-task conversion with explicit estimate. Conversion keeps the note and exposes the linked task where accessible. User data rendered escaped.
6. **Reminders:** date/time can be saved but the UI **explicitly states that note notification delivery is not yet active**. No silent claims of push alerts.
7. **Authored regression tests (not run):** `backend/tests/quick-notes.test.mjs`; additions to `tests/deep-postgres-regression.mjs` requiring disposable Postgres and migration 0013; `tests/build-m61-harness.mjs` and `tests/m61-notes-browser.py` for account-mock CRUD, conversion and responsive widths.

## Additional M6.1 safety slice — Recoverable notes (2026-11-07)

This slice is **committed only on the feature branch**. No production database migration, API function deployment, or public-site publication occurred.

- Added `GET /v1/notes/trash` and `POST /v1/notes/{id}/restore`. Both require the authenticated account and enforce workspace ownership. Restore uses optimistic revision checks and is allowed only when the workspace is active.
- Added `deletedAt` in the API's typed note representation and a **Recently Deleted** view with a Restore action. Deleted notes stay in server storage; a successful restore returns them to **My notes**, rather than creating a duplicate.
- Note-to-task conversion now uses the note's UUID as the default converted-task UUID. It is stable even after a browser reload, allowing the database's idempotent conversion function to return the original task after an uncertain response. This does **not** trigger an automatic retry.
- Expanded staged API, disposable PostgreSQL and responsive browser test coverage for restore, account isolation and deterministic conversion.
- Sanity-only: checked JavaScript parsing of the modified legacy frontend, backend entry point and browser harness. **TypeScript compilation, database migration tests, Playwright and live authentication were not executed; all remain in the final integrated verification gate.**

**Remaining M6.1 work:** verify the staged note delivery and inbox, implement and test quiet-hour behavior, account-switch handling, creation retry after uncertain POST, and integration sign-off. Notes with archived workspaces are hidden from active/deleted lists until the workspace is restored. No live notification behavior is claimed.

## Remaining M6.1 before completion

- **M6.1a staged:** note reminder delivery, timezone semantics, acknowledgement/snooze actions and durable retries are authored in source, and the old 'not yet active' label has been replaced. Quiet-hour behavior, integrated validation, and actual deployment are still required before completion.
- **Staged:** deleted-note restore/Trash UI and owner-scoped endpoints are implemented; still require integrated browser and PostgreSQL verification.
- **Partially addressed:** conversion retry uses a deterministic task UUID after reload; still test uncertain responses, account switching and deleted/archive workspaces.
- Add browser regression checks for stale revision, account switching and unexpected offline/network failures.
- **Only during final integrated release gate:** production TypeScript/Vite build, API unit tests, all 15 migrations on disposable Postgres, browser matrix and authenticated integration. Tests in this checkpoint are **written, not claimed passed**. GitHub Actions budget issue is deferred until then; local syntax sanity reviews do not replace the full suite.

## M6.1a — Quick Note reminder delivery (staged, unverified)

**Source committed on feature branch only. No Cloud Shell, GitHub Actions, live Neon migrations, scheduler invocations, merges or deployments.**

- Additive SQL migration `0014_quick_note_reminders.sql` introduces account-owned note alert occurrence actions (acknowledge/snooze/reset), a separate durable push outbox, and `enqueue_due_note_push` keyed by note, date/time, effective delivery instant, and authorized subscription. Date/time uses the account's stored notification timezone. Existing task delivery tables remain unchanged.
- The existing `dayframe-reminder-dispatch` schedule now invokes a second, separately claimed note-delivery pass. Outbound Web Push remains generic and **does not transmit note titles or content**. Endpoint validation, limited retries, exponential backoff and immediate eligibility rechecking follow the task dispatcher pattern. Deleted notes, archived/deleted workspaces, invalid subscriptions, superseded reminder dates and acknowledged occurrences cannot pass the eligibility query.
- `GET /v1/alerts/combined` returns task alerts plus note alerts in one authenticated browser request. Existing `GET /v1/alerts` remains unchanged for older clients. `POST /v1/note-alerts/:id` enforces JWT-owner scope and revision-fenced occurrence actions.
- Typed browser client and Home inbox distinguish note reminders and route acknowledge/snooze to the appropriate endpoint. Quick Notes guidance differentiates account notification functionality from anonymous local-demo notes.
- Authored (not run) `backend/tests/note-reminders.test.mjs`, plus disposable-Postgres tests in `tests/deep-postgres-regression.mjs` covering migration 0014, account isolation, action revision checks, outbox idempotency, claims and deleted-note protection.

**Important release requirements and unfinished items:**

1. **NOT TESTED:** real Node module execution, TypeScript compilation, actual PostgreSQL migration execution, API unit suite, concurrent worker checks, browser UI, and real push delivery. A minimal V8 parse of the edited backend JS and new unit-test source with ESM imports/exports stripped succeeded; that is only a source syntax sanity check, **not** a Node test or build. Do not describe M6.1a as working in production.
2. **Quiet hours are still missing.** Do not introduce a silent default or imply that a quiet-hour policy is enforced. Design and test user-configurable quiet hours consistently for both existing task and new note reminders before declaring M6.1 complete.
3. Confirm the scheduler's deployment bundling includes the modified worker, and migrate 0013 then 0014 before deploying the combined API/dispatcher. Recheck deployed notification subscription behavior and account-switch safety.
4. Acknowledgement, changed reminders, deleted/archive workspaces, DST gaps/folds, timezone edits, duplicate delivery after uncertain push outcome, HTTP retry exhaustions and notification opt-out require integrated testing. Generic Web Push is at-least-once best effort, not a guaranteed exactly-once notification.
5. M6.1b must still address uncertain note creation, account-switch handling, error/conflict UX and related browser regressions.

**Testing budget:** Keep GitHub Actions at zero during M6–M8 feature development. Cloud Shell is currently unavailable/unreliable. All verification remains deferred, not waived; identify an accessible local or disposable audit environment at the final release gate. No production changes are authorized.

## M6.1b/M6.1c — Reliability and quiet hours (staged, 2026-11-07)

**M6.1 implementation status:** source milestones are staged on the feature branch. Production acceptance and integration testing are **not** complete. GitHub Actions runs: **0**; Cloud Shell runs: **0**; production mutations: **0**.

- **Uncertain note creation:** a new note retains one client-created UUID and the exact payload fingerprint after a lost response; resubmitting the unchanged form reuses its UUID. Changing the form following an uncertain response is blocked until reconciliation, instead of silently creating a duplicate. The component instance is per-account and disposed on unmount. The existing server `ON CONFLICT`/exact-payload check keeps repeated UUID writes idempotent. No automatic blind retries are made.
- **M6.1c quiet hours:** additive migration `0015_notification_quiet_hours.sql` adds optional `quiet_start`/`quiet_end` on account notification settings with all-or-nothing validation. Existing task and note outbox enqueue functions now defer effective push timestamps until the end of local quiet hours; overnight windows are supported. The original due time, note, task and acknowledgement records are untouched.
- **Late delivery safety:** the existing worker rechecks quiet hours immediately before outbound push, including retries originally due before a quiet window. If quiet hours are active, the outbox item is returned to retry with `next_attempt_at` set to the quiet end; it is not sent. Privacy remains no-payload generic Web Push.
- **On-demand UI:** a Quiet hours button in the Home reminder inbox fetches/saves the user's settings explicitly; no additional per-render preference request. A separate authenticated `PUT /v1/notification-preferences/quiet-hours` validates the owner, zone and start/end; the existing zone update leaves quiet times intact. The typed frontend validates returned settings.
- **Regression source (NOT EXECUTED):** `tests/m61-notes-browser.py` and its mock harness cover uncertain creation and quiet-hours toggling; `backend/tests/reminders.test.mjs`, `backend/tests/note-reminders.test.mjs` and `backend/tests/reminder-dispatch.test.mjs` cover authenticated settings, rechecking and quiet deferrals; `tests/deep-postgres-regression.mjs` now expects all **15** staged migrations and checks overnight, UTC, Berlin DST boundaries, account rules and outbox semantics.
- **Limited syntax review:** parsing the edited JavaScript backend and test modules in an isolated JS evaluator after stripping ES module syntax succeeded; this does **not** execute tests, load dependencies, compile TypeScript, or validate SQL.

**Open acceptance risks:** the branch is unbuilt; TypeScript, browser, database and real push behavior are not verified. Note owner/account transitions, interrupted requests, deployed service-worker scope, late-window claim races, timezone changes, DST gap/fold handling and actual scheduler packaging require integrated tests. Browser notifications are best-effort; the in-app inbox remains available without push. Run one comprehensive disposable-environment test gate at M8.3; do not enable production until it passes and the user authorizes release.

**Implementation handoff:** Move on to M6.2 Documents in the same isolated feature branch, in small backend/editor/persistence slices. Do not change live Neon, GitHub Actions budgets or protected branches.

## Next roadmap

Finish the remaining M6.1 work, then M6.2 BlockNote documents, M6.3 persistence/media/export, M7 Reports/Insights/Home, M8 quality/PWA/release. M9 Android only after website acceptance, with its own signing and store approval.

See [FEATURE_BRANCH_ROADMAP.md](FEATURE_BRANCH_ROADMAP.md). Keep all implementation commits on the branch and don't change Neon production until the user approves a release.
