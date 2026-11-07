# Dayframe M6.3 — Document persistence, search, export and media boundary

**Branch:** `feature/dayframe-m53-release-20261107`.  
**Status:** Source implementation staged; **unbuilt, integration tests unrun, not deployed or merged**.  
**Development budget:** No GitHub Actions, Cloud Shell or live Neon operations.

## M6.3a — Autosave and conflict recovery

- `web/src/components/DocumentPage.tsx` debounces editor changes for 1.4 seconds. A captured local draft version protects against a delayed server response overwriting newer local changes. Writes use the active document's last observed revision; editor input is read-only while the request is pending.
- Save outcomes: successful updates advance the server revision; stale revision `409` pauses writes, retains the local draft and offers an explicit draft download or reload of the current server version. Unknown network outcomes pause automatic retries, not an infinite request loop.
- Before allowing a retry after an uncertain network response, `Check server and retry` reads back the owner-scoped document and compares canonical JSON and title/workspace/task/parent fields. Matching content is reconciled as saved; diverging revisions become a manual conflict. Only when the revision is unchanged can autosave be re-enabled following explicit user action.
- Navigation/unload warns while edits, uncertain creation or an account request remain outstanding. No background synchronization, automatic conflict merge, guaranteed browser close save, or offline saving is claimed.
- Browser tests have been authored for debounce, server-confirmed updates, server search, export and two-device conflict recovery; `tests/documentBlocks.test.mjs` includes canonical-json equivalence.

## M6.3b — Private search and export

- `GET /v1/documents/search?q=...` uses a literal case-insensitive substring on the verified owner's active documents. Query length 2–120, bounded pages and optional owner-scoped workspace/task filters. Search returns **metadata only**, even when private document text matches. A 350ms debounce and abort signal prevent unnecessary browser requests.
- `GET /v1/documents/:id/export` returns only the authenticated owner's document, as `dayframe.document.export.v1` JSON with cache-control `no-store`, safe fixed attachment filename and no public URL. The browser downloads this explicitly, with a 240 KB single-document cap. A separate `dayframe.document.draft.v1` download captures a local unsaved conflicted draft.
- No unsolicited indexing by third-party search providers, public shares, server-generated previews or cross-account export.

## M6.3c — Conservative binary/media boundary

- `backend/src/document-media-policy.mjs` contains **pre-admission validation only** for proposed future JPEG/PNG/WebP (maximum 5 MiB) and PDF (maximum 10 MiB) uploads, checking filename characters, declared byte size and file signatures, not just MIME/extension.
- **Uploads deliberately disabled:** `/v1/documents/:id/attachments` responds with HTTP 415 after authentication, before reading an upload body. The text-only BlockNote schema rejects media, HTML, embeds and links. No public media links or binary data are stored.
- A signature check is **not a malware scanner**. Until a vetted private storage service, malware/PDF inspection, owner-authorized download endpoint, quotas and retention/removal are implemented, binary uploads are *not* an available M6 feature.
- `backend/tests/document-media-policy.test.mjs` and `backend/tests/documents.test.mjs` stage corresponding safety checks.

## Unverified and open release risks

- All TypeScript, Vite, Node backend suites, PostgreSQL migration 0001–0016 on a disposable database, Playwright/Safari, accessibility, account-switch timing, delayed promises, DST and live push are still **not executed**. Only limited source/JavaScript syntax checks were performed.
- The feature branch currently has no `package-lock.json`; dependency installation must produce a synchronized lockfile and validate the pinned BlockNote/Mantine versions before `npm ci` can work. BlockNote's custom schema API, editor event props and stylesheet imports were checked against its current documentation, **not** compiled here.
- Search scans JSONB `::text` using literal substring; acceptable only for a bounded initial document collection. Indexing, large-account performance and potential rate/CPU costs require disposable workload benchmarking in M8.
- Validate export fidelity after PostgreSQL JSONB key order changes, browser download permissions, draft recovery, edit retries, multi-device revision collisions and no-payload push privacy.
- A conflict is **never** silently overwritten or merged. The local draft must remain exportable before the user deliberately reloads the server version.
- Maintain account scope and do not save document content in localStorage, logs or analytics.

**Next stage:** M7.1 Home (real account-wide summaries, pinned tasks/workspaces, no fake metrics), then M7.2 Reports, M7.3 Insights, M8 quality/PWA and a single comprehensive release gate. Protected `main`, public site, production Neon, GitHub Actions budget and payments remain unchanged pending authorization.
