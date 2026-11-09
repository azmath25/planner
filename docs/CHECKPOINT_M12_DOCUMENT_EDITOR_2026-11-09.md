# Dayframe M12 — quiet document canvas, archive and navigation (feature-branch checkpoint)

**Date:** 2026-11-09  
**Source branch:** `feature/dayframe-documents-ux-20261109`  
**Production:** NOT DEPLOYED. Existing Dayframe Vercel production remains at its earlier M11 release.  
**Scope:** Existing Vercel Dayframe frontend + isolated Dayframe Neon document API only; no GitHub Actions, merges, production migrations or legacy account transfers.

## Implemented on the branch

- Replaced the crowded active-document toolbar with a **single left Back arrow**, non-interactive save status, and compact top-right `⋯` menu.
- Back opens the parent page if the current page has a known parent; otherwise returns to the document library. Unsaved edits retain the existing confirmation and local backup protections.
- `⋯` contains **Save now / Retry sync**, **Download as…** (HTML, browser **Print / Save PDF**, saved JSON, unsynced local JSON), **New child page**, **Go to task** where linked, **Go to workspace**, **Remove from task** when valid, **Discard edits**, **Archive**, and **Delete**. Delete and Archive are distinct operations; they keep their confirmation/revision safety.
- Real **Archive** backend model: additive `0023_document_archive.sql`, per-owner `archived_at`, archive listing, revision-fenced archive/unarchive, leaf-only archiving and parent-state checks. Archived pages are hidden from normal search/list/detail, shown in a separate Archive view, and can be restored. The schema migration must be applied only to the isolated Dayframe Neon branch before deploying the new backend and frontend.
- Small zoom controls (60–150%, plus reset) float at the **right lower corner** and disappear while the BlockNote writing surface is focused. No permanent zoom controls above the title.
- Child pages appear as navigable page references below the active editing canvas, and the Back arrow provides their parent navigation.
- Existing safe HTTP/HTTPS inline links remain supported. Added an optional **third heading level** to BlockNote and the HTML exporter. Existing documents with old heading levels continue to load through compatibility mapping.
- Existing private document photos, HTML export with embedded photos, unfinished LaTeX, autosave/revision protections, Quick Notes, and Dayframe themes are preserved.

## PDF and embedding limitations — do not overclaim

- **Print / Save PDF** opens the browser's print dialog from the safe self-contained exported HTML; the user chooses **Save as PDF** in the browser. This is **not yet a direct binary PDF download**. A later direct exporter needs a reviewed renderer and compatible license; BlockNote's XL PDF package has copyleft/commercial license conditions.
- External site/video/PDF iframe embeds and actual inline internal-page embed blocks are **not yet implemented**. A separate reviewed block schema is needed. External embeds must have a provider/URL allowlist and sandboxed rendering (no arbitrary HTML/JavaScript), private Dayframe page embeds must verify owner access on each read, and invalid links must not silently persist. Child-page navigation is functional but is not an inline embedding engine.
- Optional cover/header images and title-area decorative headers are separate from the existing heading blocks and are not implemented yet.
- Real device Android browser Back for nested document-to-document transitions is not verified. The new onscreen arrow opens the parent.
- Real signed-in image/media and PDF print acceptance testing is not yet performed.

## Verification (isolated temporary Vercel sandbox, no GitHub Actions)

- `npm run typecheck`: PASS.
- `npm run test:api`: **99/99 passed**, including four new archive ownership/revision/restore checks.
- `npm run test:documents`: **11/11 passed**.
- `npm run test:ux`: **21/21 passed**, including four new toolbar/zoom/archive source regressions.
- `npm run build && npm run check:dist`: PASS. Mantine/Rolldown emitted existing nonfatal `use client` directive warnings.
- This verifies compilation and test contracts, **not full visual or production database integration**.
- A Vercel preview deployment attempt for the new branch was **CANCELED by the existing project Ignored Build Step**, which currently allows only `feature/dayframe-m53-release-20261107`. It is not evidence of a build failure and did not change the production alias. Do not change this safeguard without an explicit release decision.

## Release order / guardrails

1. Verify the isolated Dayframe Neon branch (never the legacy database) and apply only additive migration `0023_document_archive.sql`. Review data ownership and real parent/child conflicts.
2. Deploy the matching `dayframeapi` backend from this exact branch; perform signed-in archive/restore and multi-account authorization checks.
3. Build and visually verify the frontend at 320/390/768/1280px including keyboard, screen reader, parent arrow, menu overflow, internal navigation, print-to-PDF and archive. Adjust Vercel branch build gate only when authorized.
4. Publish reviewed frontend to the existing Dayframe production project, verify deployed commit and all entrypoints; do not merge or invoke GitHub Actions unless separately approved.

## Next document-engine milestone

- Safe external embedded media blocks (allowlisted sources only), true in-flow Dayframe page references, internal backlinks/navigation and cycle checks.
- Private images as anchored, resizeable BlockNote content blocks instead of a separate four-photo gallery; preserve old photos and convert only with a tested migration/adaptation plan.
- Optional cover/header layouts, improved headings/outline, and a reviewed direct PDF export path that retains headings, links, images and math without violating licensing.
