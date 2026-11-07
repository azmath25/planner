# M6.1 Quick Notes — feature-branch implementation checkpoint

**Scope:** M6.1 initial slice, staged 2026-11-07.  
**Branch:** `feature/dayframe-m53-release-20261107` (no merge).  
**Production:** original `main` site and Neon function **not changed** by this milestone.  
**Release status:** **NOT READY** — staged implementation, authored but unexecuted verification, reminders delivery pending.

## Implemented in branch source

1. **Additive migration `0013_quick_notes.sql`:** owner-scoped `dayframe.quick_notes` with workspace ownership composite foreign key, title/content caps, color, pin, optional reminder date/local time, optimistic revision, updated timestamps, converted-task pointer, and soft-delete timestamp. No browser-owned user ID in API writes. Does not migrate legacy browser notes automatically.
2. **Atomic note conversion:** `dayframe.convert_quick_note` row-locks the note, verifies owner/revision and active workspace, inserts one task in the same transaction, and saves the converted ID/revision. A retry with the same task UUID is idempotent, while a different second conversion conflicts. Note content is copied to task notes; conversion preserves the source note.
3. **HTTP API:** authenticated `GET/POST /v1/notes`, `PATCH/DELETE /v1/notes/:id`, `POST /v1/notes/:id/convert`. List is paginated, soft-deleted and archived-workspace notes are hidden, creation uses caller-generated UUID for uncertain retries, and updates/deletes use observed revision. All SQL is scoped by verified JWT subject.
4. **Typed frontend service:** verifies cloud note payload shape, paginates, and exposes CRUD/conversion methods.
5. **Signed-in UI:** loads account notes from Neon instead of silently reading old local notes; retains unsynced browser demo samples for anonymous visitors. Supports search, workspace/pinned filters, pinned-first organization, creation, editing, pin toggles, soft deletion confirmation and note-to-task conversion with explicit estimate. Conversion keeps the note and exposes the linked task where accessible. User data rendered escaped.
6. **Reminders:** date/time can be saved but the UI **explicitly states that note notification delivery is not yet active**. No silent claims of push alerts.
7. **Authored regression tests (not run):** `backend/tests/quick-notes.test.mjs`; additions to `tests/deep-postgres-regression.mjs` requiring disposable Postgres and migration 0013; `tests/build-m61-harness.mjs` and `tests/m61-notes-browser.py` for account-mock CRUD, conversion and responsive widths.

## Remaining M6.1 before completion

- Implement note reminder delivery in the existing server-owned notification pipeline, including timezone/quiet-hour semantics, acknowledgements/snoozes or a clearly separate UX, idempotency and retry rules; then remove the 'not yet active' label.
- Provide a practical restore/Trash UI for soft-deleted notes or explicitly defer it to M6.3 without pretending deleted notes are directly recoverable now.
- Review pending conversion retry UX across page reload, failed HTTP responses, and deleted/archive workspaces.
- Add browser regression checks for stale revision, account switching and unexpected offline/network failures.
- **Only during final integrated release gate:** production TypeScript/Vite build, API unit tests, all 13 migrations on disposable Postgres, browser matrix and authenticated integration. Tests in this checkpoint are **written, not claimed passed**. GitHub Actions budget issue is deferred until then; local syntax sanity reviews do not replace the full suite.

## Next roadmap

Finish the remaining M6.1 work, then M6.2 BlockNote documents, M6.3 persistence/media/export, M7 Reports/Insights/Home, M8 quality/PWA/release. M9 Android only after website acceptance, with its own signing and store approval.

See [FEATURE_BRANCH_ROADMAP.md](FEATURE_BRANCH_ROADMAP.md). Keep all implementation commits on the branch and don't change Neon production until the user approves a release.
