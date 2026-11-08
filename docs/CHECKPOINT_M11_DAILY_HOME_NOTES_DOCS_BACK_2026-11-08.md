# Dayframe M11 — Daily Home, compact Quick Notes, document media, and Android Back

**Date:** November 8, 2026  
**Source branch:** `feature/dayframe-m53-release-20261107`  
**Deployment decision:** Existing production Dayframe Vercel and the existing isolated Neon branch; no legacy Neon database transfer.  
**Android Play Store:** Excluded. This milestone improves browser/PWA Back behavior instead.

## User design decisions and changes

1. Home has **exactly two centered, equal-size quick actions**: Today's Plan and Start Timer. The third redundant Reports shortcut has been removed because Reports remains in the navigation header.
2. All **four Home metrics are explicitly daily**: server-recorded focus for today's date, today's plan selected-task count, tasks actually completed today, and open tasks with deadlines due today. No weekly focus or all-time completion figures are labeled as daily. The existing server `/v1/time-report` endpoint is requested with `period=day`. Unknown/loading totals show a neutral dash, not an invented number.
3. Quick Notes on Home and the Notes library are simple text cards. **Tap the note body to open the editor**, or activate it with keyboard Enter/Space. **Delete is the only visible per-note action**; deletion retains its existing confirmation/restore path. Remove card clutter such as workspace labels, pinned status, conversion shortcuts and exports. The Quick Note editor no longer offers photo attachment or export controls. Existing Quick Note content and any historical photo rows are **left intact**, not deleted.
4. **Rich Documents**, distinct from Quick Notes, receive a self-contained HTML download of current editor content (including unfinished or incorrect LaTeX text as visible source, safe HTTP/HTTPS links, headings and formatting), plus an owner-private gallery of up to four separately stored photos per document. Each image is JPEG/PNG/WebP, selected up to 5 MB and compressed on the client to ≤180 KB. Export embeds the loaded images into the single offline-readable file. JSON export remains in More.
5. **Browser/Android Back** follows Dayframe's client-side page history, including task details, workspaces and note modals, rather than immediately leaving the installed PWA from a nested screen. Back from a note closes it first; Back from Notes returns Home. Explicit Close consumes its modal history entry so Back does not reopen it. Repeated Reports/Settings click still returns Home. Dirty document and unsynced Quick Note protections are respected. Android launcher integration is not claimed.
6. **Symmetry/alignment:** Matching heights, grid widths, wrapping and centered labels for Home controls, Settings/profile preferences, report chart filters, document toolbar/photo actions, modal footers and compact notes, with mobile-specific behavior at narrow widths. **Pie and donut charts remain circular even in Monochrome**; square corners apply to cards and controls, not circles.

## Database / API change

`backend/db/migrations/0022_document_photos.sql` adds a single account-owned `dayframe.document_photos` table with four bounded slots per document, a composite owner/document foreign key, cascade only if the document is actually deleted, and no public image URL. New owner-authenticated `GET/PUT/DELETE /v1/documents/{id}/attachments` routes validate document visibility before reading/writing. The server rejects arbitrary attachments (including SVG and HTML), unsupported verbs, oversized images, mismatched MIME signatures and invalid slot numbers.

This change is **additive schema creation**, not the user-rejected old-data migration. Existing tasks, notes and documents are preserved, and the old Quick Note photo API/table are not removed during this milestone.

## Verification results

- TypeScript `npm run typecheck`: passed.
- Backend API suite `npm run test:api`: **95 passing**, including updated document attachment method rules.
- Document photo security tests: **3 passing**, owner rejection, bounded MIME/size and scoped photo deletion.
- Readable document HTML tests: **2 passing**, safe links, unfinished LaTeX and embedded data image.
- UI/report/task-document wiring `npm run test:ux`: **17 passing**.
- Existing documents, Quick Notes, Reports, timer, PWA and source suites: passed.
- `npm run build` using the current isolated Dayframe Neon public endpoints and `npm run check:dist`: passed.
- **Actual Chromium geometry checks passed at 320, 360, 390, 430, 600, 768, 1024 and 1440 px** for timer, document toolbar, Home two-button symmetry, Quick Notes, Settings and circular pie geometry.
- **Real browser navigation smoke in isolated local-preview mode passed at 390 px and 1280 px**: Home → Notes → New Quick Note → browser Back closes modal → browser Back returns Home; clicking selected Reports or Settings returns Home. Explicit Close → Back also returns Home without reopening the editor.
- Browser visual tests use a disposable, non-production fixture and no user account or API. **Still unverified:** signed-in Android Chrome/Safari/PWA real-device flow, end-to-end photo ownership across accounts, real downloaded HTML on a phone, and full app screen-by-screen authenticated visual testing.

## Release safety

- Only the source branch is updated; no branch merge or GitHub Actions.
- Deploy the matching backend/photo schema before the new frontend so the document editor never points to a missing photo route.
- Vercel uses the existing `dayframe` production project and unchanged Neon Auth/API target. Do not substitute old production database `soft-night-61558675`.
- Keep existing five-minute reminder trigger settings untouched.
