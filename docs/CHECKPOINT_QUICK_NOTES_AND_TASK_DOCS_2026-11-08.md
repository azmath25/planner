# Dayframe — Quick Notes autosave and task-linked documents
**Feature branch checkpoint: November 8, 2026**  
**Source:** `azmath25/planner` · `feature/dayframe-m53-release-20261107` · verified source commit `541279939609bf8e934033fa6d110834315b6759`.

## Scope and user decisions

Continue Dayframe development without GitHub Actions. Keep the existing new Dayframe Neon database; **do not migrate older data**. Android Play Store work remains excluded. Do not describe feature-branch changes as already visible on the Vercel production URL unless that specific release is READY and publicly verified.

## Quick Notes — autosave-first

- `web/src/domain/quickNoteDraft.ts`: bounded account-scoped browser-local recovery for pending edits; client UUID retained for an uncertain new-note request. Title falls back to the first sentence when left blank.
- `web/src/domain/quickNoteAutosave.ts`: 1.4-second debounced cloud autosave, serialized write requests, revision fencing, stable IDs for idempotent creates, reconciliation against Neon after an uncertain response, and conflict preservation when another device saves a different version. A typed incomplete reminder is kept locally until a date is selected. A draft is preserved even when cloud requests fail.
- `web/src/legacy/legacy.ts`: Quick Note input and selection changes now feed autosave; the modal no longer requires a name, presents a clear cloud-versus-local save status, preserves focus and the current fields during unrelated background UI refreshes, and includes an optional **Save now** flush. The local-only preview retains an explicit save path and does not pretend to cloud-sync.
- `web/src/styles.css`: mobile-friendly responsive save status and controls.
- **Limit:** a device-only backup is not a confirmed server commit; browser storage may be unavailable or cleared. Unfinished/wrong content is preserved, but the existing 8,000-character note limit and server security/ownership checks remain. Real authenticated browser, reconnect, Safari cookie and multi-device tests are still required.

## Task documents — create, attach, unlink

- The task Notes panel now offers **Add or open documents**, opens the task-filtered document library and displays **New task document**.
- `web/src/components/DocumentPage.tsx` now also offers **Attach an existing document to this task** for previously unassigned root documents from the same workspace with no child pages. It fetches the current revision and uses the existing owner-protected document update API; no duplicate document is created.
- **Remove from task** unlinks an eligible saved root document without deleting content, after checking the latest revision and refusing dirty documents or nested parent/child structures. Both workflows keep their task associations in the existing Neon document table.
- No production database migration was required.

## Verification actually run

In an isolated, temporary Vercel sandbox with the current feature source:
- `npm run test:quicknotes`: **9 passing** unit/integration-wiring tests (including concurrent typing, uncertain create/update, cross-account draft isolation, incomplete reminders and draft retention across edits).
- `node --test tests/taskDocumentsWiring.test.mjs`: **5 passing** source/wiring tests, including task context propagation, safe attach and unlink safeguards.
- `npm run test:documents`, `npm run test:api`, `npm run test:source`, `npm run test:reports`, `npm run test:time`, `npm run test:pwa`: passed.
- `npm run typecheck`, `npm run build` with the existing isolated Dayframe Neon public endpoints, and `npm run check:dist`: passed. Vite PWA manifest remains root-scoped.
- These are **automated code checks, not a real signed-in phone acceptance test**. The separate eight-viewport Chromium test remains blocked in the temporary sandbox by missing system libraries.

## Release gate and remaining web work

The existing production Vercel site remains at `https://dayframe-azmath25s-projects.vercel.app` on its earlier READY deployment. Do not claim Quick Notes autosave, task-document attachment, timer overflow fix, pie reports or document zoom are live before the feature source is actually deployed. A preceding production request received Vercel Hobby daily quota **HTTP 402**; automatic preview deployments were disabled to reduce wasted builds.

A coordinated next release must: publish the feature source to the existing Vercel Production project, deploy the matching Dayframe API with the rotated **public** push key, confirm auth/CORS/health, then enable and test the already-created but **disabled** five-minute Neon reminder schedule. The private push key remains exclusively server-side. Existing push subscribers may need to re-enable notifications.

Outstanding before confidently declaring a complete web product: authenticated mobile Chrome/Safari and desktop tests, document/Quick Note autosave under uncertain connections, multi-device conflict resolution, background reminder delivery proof, offline data sync, and document media attachments. Android Play Store and old-database migration are deliberately excluded.
