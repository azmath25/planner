# M6.2 Documents — staged feature-branch checkpoint

**Branch:** `feature/dayframe-m53-release-20261107`  
**Status:** M6.2a backend foundation implemented in source; **NOT BUILT, TESTED, DEPLOYED OR RELEASE READY**.  
**Baseline:** `main`, published site and live Neon remain unchanged. No paid GitHub Actions or Cloud Shell runs.

## M6.2a — private document hierarchy and API (staged)

1. Additive migration `0016_private_documents.sql` adds `dayframe.documents` with owner-scoped workspace and optional task/parent references, title, bounded JSONB blocks, optimistic revision, timestamps, and soft-delete. The active task/workspace relationship is checked on document structure edits.
2. Database trigger serializes structure changes per owner and rejects cross-account references, inactive workspaces/tasks, cross-workspace parents, parent cycles/depth overflow, and moving a parent away from existing active children. No public attachment/document URLs exist.
3. `backend/src/document-blocks.mjs` enforces a small text-only, BlockNote-compatible JSON subset. Only paragraph, heading, list items, checklist, quote, code block and sanitized text runs are accepted. Image/file/embed/link/HTML blocks are deliberately rejected; no arbitrary server-rendered HTML is introduced.
4. Owner-derived, JWT-protected REST source: `GET/POST /v1/documents`, `GET/PATCH/DELETE /v1/documents/:id`, `GET /v1/documents/trash`, `POST /v1/documents/:id/restore`. Lists omit document bodies; details return body only to the verified owner. POST uses client UUIDs for idempotent uncertain retries and PATCH/DELETE/restore use revision checks.
5. Typed frontend API service (`web/src/auth/api.ts`) adds paginated document listing, detail, create/update/delete, Trash and restore methods. It performs shape checks, accepts client-supplied IDs for uncertain retries and does **not** add editor dependencies or additional page requests yet.
6. New `backend/tests/documents.test.mjs` and additions to `tests/deep-postgres-regression.mjs` cover shape validation, blocked unsafe URLs/embeds, JWT scopes, self/cyclic parent relationships, optimistic revisions, soft-delete, and workspace/task ownership. The disposable-db test harness now stages migrations **0001–0016**.

## Not yet implemented (do not claim completion)

- **M6.2b:** actual BlockNote editor, workspace and task document library UI, navigation, document hierarchy/tree, create/edit/restore/delete workflow and responsive keyboard accessibility
- **M6.2c/M6.3:** editor autosave/debounce, conflict recovery, server-side search, export, file/media upload vetting, attachment limits and safer document version recovery
- **Task relocation:** moving a linked task to another workspace may require a coordinated document reassociation in the existing task-move transaction. This must be designed/tested before release to avoid orphaned workspace associations
- **Security and runtime:** PostgreSQL migration execution/rollback, TypeScript bundle, API tests, concurrency, BlockNote format compatibility, XSS-safe rendering, account switching, browser matrix and uploads all remain untested
- **Data:** no production data imported or migrated, and no user-owned documents have been read or changed

## Development and release constraints

Continue M6.2b on this branch only. Do not run GitHub Actions or Cloud Shell; test source locally in an isolated environment when available. No Neon production migrations/functions, GitHub Pages builds, merges or payments without explicit final-release approval. The final M8.3 gate must run comprehensive tests on a **disposable** PostgreSQL database, then browser and authenticated API checks. Production rollout remains a separate permission boundary.


## M6.2a source review and compatibility warning

A syntax-only check parsed the added document validator, server API, dispatcher and JS test sources after stripping ES-module imports/exports. **No actual Node/TypeScript build or PostgreSQL test was executed.** The INSERT query uses the document table alias for `RETURNING`, and document block IDs are restricted to safe characters. BlockNote's default JSON includes several block/inline kinds that the server deliberately disallows for now; M6.2b must restrict editor controls or negotiate a reviewed schema before wiring saves. No unsynchronized `package.json` or `package-lock.json` dependency edits were made.
