# M6.2 Documents — staged feature-branch checkpoint

**Branch:** `feature/dayframe-m53-release-20261107`  
**Status:** M6.2a backend and M6.2b private document UI/editor are implemented in feature-branch source; **NOT BUILT, INTEGRATION-TESTED, DEPLOYED OR RELEASE READY**.  
**Baseline:** `main`, published site and live Neon remain unchanged. No paid GitHub Actions or Cloud Shell runs.

## M6.2a — private document hierarchy and API (staged)

1. Additive migration `0016_private_documents.sql` adds `dayframe.documents` with owner-scoped workspace and optional task/parent references, title, bounded JSONB blocks, optimistic revision, timestamps, and soft-delete. The active task/workspace relationship is checked on document structure edits.
2. Database trigger serializes structure changes per owner and rejects cross-account references, inactive workspaces/tasks, cross-workspace parents, parent cycles/depth overflow, and moving a parent away from existing active children. No public attachment/document URLs exist.
3. `backend/src/document-blocks.mjs` enforces a small text-only, BlockNote-compatible JSON subset. Only paragraph, heading, list items, checklist, quote, code block and sanitized text runs are accepted. Image/file/embed/link/HTML blocks are deliberately rejected; no arbitrary server-rendered HTML is introduced.
4. Owner-derived, JWT-protected REST source: `GET/POST /v1/documents`, `GET/PATCH/DELETE /v1/documents/:id`, `GET /v1/documents/trash`, `POST /v1/documents/:id/restore`. Lists omit document bodies; details return body only to the verified owner. POST uses client UUIDs for idempotent uncertain retries and PATCH/DELETE/restore use revision checks.
5. Typed frontend API service (`web/src/auth/api.ts`) adds paginated document listing, detail, create/update/delete, Trash and restore methods. It performs shape checks, accepts client-supplied IDs for uncertain retries and does **not** add editor dependencies or additional page requests yet.
6. New `backend/tests/documents.test.mjs` and additions to `tests/deep-postgres-regression.mjs` cover shape validation, blocked unsafe URLs/embeds, JWT scopes, self/cyclic parent relationships, optimistic revisions, soft-delete, and workspace/task ownership. The disposable-db test harness now stages migrations **0001–0016**.

## Not yet implemented (do not claim completion)

- **M6.2b (staged):** BlockNote editor, workspace/task library navigation, hierarchy, explicit Save, Trash/restore and responsive layout are authored. Dependency resolution, keyboard/Safari behavior and browser tests are pending; the UI is **not** verified functional yet.
- **M6.2c/M6.3:** editor autosave/debounce, conflict recovery, server-side search, export, file/media upload vetting, attachment limits and safer document version recovery
- **Task relocation:** moving a linked task to another workspace may require a coordinated document reassociation in the existing task-move transaction. This must be designed/tested before release to avoid orphaned workspace associations
- **Security and runtime:** PostgreSQL migration execution/rollback, TypeScript bundle, API tests, concurrency, BlockNote format compatibility, XSS-safe rendering, account switching, browser matrix and uploads all remain untested
- **Data:** no production data imported or migrated, and no user-owned documents have been read or changed

## Development and release constraints

Continue with M6.3 persistence, search, export and media safety on this branch only, after reviewing M6.2b integration risks. Do not run GitHub Actions or Cloud Shell; test source locally in an isolated environment when available. No Neon production migrations/functions, GitHub Pages builds, merges or payments without explicit final-release approval. The final M8.3 gate must run comprehensive tests on a **disposable** PostgreSQL database, then browser and authenticated API checks. Production rollout remains a separate permission boundary.


## M6.2a source review and compatibility warning

A syntax-only check parsed the added document validator, server API, dispatcher and JS test sources after stripping ES-module imports/exports. **No actual Node/TypeScript build or PostgreSQL test was executed.** The INSERT query uses the document table alias for `RETURNING`, and document block IDs are restricted to safe characters. BlockNote's default JSON includes several block/inline kinds that the server deliberately disallows for now; M6.2b must restrict editor controls or negotiate a reviewed schema before wiring saves. No unsynchronized `package.json` or `package-lock.json` dependency edits were made.

## M6.2b — BlockNote document library and editor (staged, 2026-11-07)

**Implementation source committed to the feature branch only.** No GitHub Actions jobs, Cloud Shell operations, live Neon migrations, Pages publication, protected-branch edits, deployment, or paid-budget changes.

- Pinned `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine` to `0.57.0` and `@mantine/core`, `@mantine/hooks`, `@mantine/utils` to `9.7.5` in `package.json`. BlockNote's Mantine integration upgraded to major v9 in its 0.50 release. **Package installation and dependency resolution have NOT been executed.** No `package-lock.json` exists in the feature branch; generate and commit a synchronized lockfile in an isolated local setup before final `npm ci`.
- New `web/src/components/BlockDocumentEditor.tsx` renders real BlockNote using a deliberately restricted schema (paragraphs, headings, text list items, checklists and code blocks). Media, links, tables, arbitrary HTML, uploads and embedded remote content are not enabled; these require separate vetted support. Browser and backend text-block validation are aligned and default heading toggle metadata is explicitly handled.
- New `web/src/components/DocumentPage.tsx` renders an account-owned document library: workspace/task filtering, nested document rows, create root/child, select/edit title and blocks, explicit revision-based Save, discard, leaf-only deletion, Recently Deleted, restore and refresh. The document body is fetched only when opening a page. The UI shows save/conflict errors, retains unsaved edits on a failed save and reuses the client document UUID after uncertain creation attempts.
- `web/src/legacy/legacy.ts` adds Documents navigation and links from Quick Notes, workspace pages and task details. It lazy-loads a separate React root only for signed-in document pages, preserves that editor root through unrelated legacy UI redraws, asks before leaving with unsaved edits and disposes the root on account unmount.
- Added responsive/focus-visible styles in `web/src/styles.css`, a typed frontend block guard in `web/src/domain/documentBlocks.ts`, and `tests/documentBlocks.test.mjs` (targeted `npm run test:documents`).
- Added `tests/m62-documents-cloud-mock.mjs`, `tests/m62-documents-entry.tsx`, `tests/build-m62-documents-harness.mjs` and `tests/m62-documents-browser.py`. Once dependencies are installed, this is an **isolated browser harness** for actual BlockNote editing, explicit save, nested pages, Trash/restore and 320/768/1440 px widths. The mock uses only in-memory data, never a live Neon endpoint.

### Verification evidence and unresolved issues

- Limited V8 parsing of the edited legacy JS and backend sources succeeded with ESM/type annotations removed for the check. This is **not** a TypeScript, Vite, esbuild, PostgreSQL, Node test or browser run.
- The source was reviewed against BlockNote documentation, including custom schemas and its October 2026 release; **actual BlockNote 0.57.0/Mantine 9.7.5 peer compatibility and emitted block JSON remain unverified**.
- Test the real editor with pasted text, keyboard shortcuts, selection and focus, theme variants, mobile Safari/Chrome, long documents, failed saves, delayed requests, second-device revisions, account switches, uncertain create responses and delete/restore hierarchy.
- The currently staged backend migration `0016_private_documents.sql` remains unexecuted. Verify SQL, hierarchy trigger behavior, complete migration chain 0001–0016, and task/workspace relocation consistency on a disposable PostgreSQL database before any deployment. **The document API and UI will not work against the unchanged production Neon schema.**
- Autosave/debounce, conflict merge/reload, export, full-text search, version recovery and vetted attachments/media are intentionally deferred to M6.3. Existing signed-in documents do **not** claim offline saving or real-time collaboration.

**Acceptance boundary:** M6.2b implementation is staged, not approved for production. Continue M6.3 feature work; comprehensive dependency, browser, SQL and security verification remains part of M8.3.
