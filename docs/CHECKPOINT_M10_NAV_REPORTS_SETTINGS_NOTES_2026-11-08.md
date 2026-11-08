# Dayframe M10 — Navigation, contextual Reports, cleaner Settings, and note media

**Date:** November 8, 2026  
**Source branch:** `feature/dayframe-m53-release-20261107`  
**Frontend release commit:** `581199d1aa075eceea52f38a80b42d6a21627cda`  
**Scope:** Existing Dayframe web/PWA and current Neon project. No Android Play Store work and no legacy-account migration.

## What changed

1. **Selected navigation toggles to Home.** The common navigation handler sends a second click on Reports, Appearance/Settings or another active non-Home destination to Home, while retaining the unsaved-document guard. A fresh visit to Reports resets a previous workspace/task context.

2. **Home is compact.** The oversized duplicate weekly reporting card was removed. Home keeps a lightweight weekly focus metric, today's task list, start-timer shortcut, Quick Notes and its separate Reports navigation control.

3. **Contextual Reports.** Workspace details have a Reports tile. Task details now have six top-level metric tiles, with Reports as the sixth; long-term tasks use a workflow scope. These actions navigate to Reports with the selected item as context and a dedicated “All reports” reset control. Period-specific workspace and long-term-project totals are taken from the existing API; individual task focus is still all-time direct focus and is labeled accordingly. The overall detailed report tables remain available for account-wide comparison. This is not a claim that the backend already provides per-task period slices.

4. **Standard Settings and Monochrome.** Appearance/Settings uses flatter rows for theme, density, cover options, privacy/activity and account controls instead of stacks of cards. Monochrome uses black/white, gray, straight borders, square controls and no color accents in the main interface; user photos retain visual fidelity. Activity history is hidden by default in task pages but can be exposed from Settings. Hiding it does not delete logs.

5. **Quick Note links and exports.** Plain HTTP(S) URLs in note previews become clickable links with safe escaping and `rel="noopener noreferrer"`. Note cards and the Quick Note editor offer downloads. Single-file HTML exports preserve note text, clickable links and an embedded attached photo; they are readable offline. HTML input is escaped rather than executed.

6. **Private Quick Note photos (one per note).** Supports JPEG, PNG and WebP selection, client-side compression, add/replace/remove, and authenticated retrieval. Images are limited to 180 KB after compression and belong to the signed-in note owner. Local preview images remain device-specific. No public photo URLs, no arbitrary HTML or remote-image embedding.

## Database and API

An **additive** schema migration `0021_quick_note_photos.sql` was applied only to current project `wispy-meadow-90135924`, branch `br-delicate-violet-b9cnjyuh`, database `dayframe`. New table `dayframe.note_photos` references `dayframe.quick_notes(id, owner_user_id)` with an owner-scoped composite foreign key and cascades only on actual note deletion. Previous notes/tasks/documents were not migrated or deleted.

Current Neon `dayframeapi` deployment **8**, built from source SHA `1b6930432518f13e5a1f0fd833ad25692856d1ba` (the later frontend patch affects only `legacy.ts` and a wiring test). Owner-protected routes:
- `GET /v1/notes/{id}/photo`
- `PUT /v1/notes/{id}/photo`
- `DELETE /v1/notes/{id}/photo`

The existing `dayframedue` reminder Function/schedule is unchanged. No GitHub Actions, merges, old-Neon migrations, or project deletion.

## Automated checks

- Existing backend API suite: **89 passing**.
- New private photo API suite: **3 passing**, including JWT ownership isolation, size/type rejection and owner-qualified writes/deletes.
- New note presentation/export suite: **3 passing**, including safe links and photo-contained HTML.
- New UI navigation/settings/report/note wiring tests and existing M9 Home tests: passed.
- Existing Quick Notes, documents, reports, time, PWA and source suites: passed.
- TypeScript check, Vite production-target build and distribution guard: passed.
- The final follow-up test confirms a file-picker change cannot trigger a second unscheduled autosave.

**Not established yet:** authenticated end-to-end photo upload and persistence across a real mobile browser, image display after full account re-login, browser-accessible download behavior on iOS Safari, all eight viewport Chromium layouts, and real-device push delivery. Automated tests use mocks for several backend paths.

## Follow-on

1. Test a real signed-in note: create, edit, attach photo, reopen on a different device, export HTML and remove photo.
2. Verify no sideways overflow in Android Chrome, iOS Safari, tablet and desktop.
3. Add historical **per-task period** reporting to the backend rather than mislabeling all-time focus.
4. Consider multiple photos, full offline-first sync, and text/Markdown export options as later enhancements.
