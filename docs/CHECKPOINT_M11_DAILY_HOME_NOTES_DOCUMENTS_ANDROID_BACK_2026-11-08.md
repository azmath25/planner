# Dayframe M11 — Daily Home, simplified Quick Notes, rich document exports and browser Back

**Release:** Vercel READY — commit `3af4eab43798878951f0b586c09ee88ed94fc022`  
**Backend:** Current isolated Dayframe Neon branch, `dayframeapi` deployment 9  
**Production URL:** https://dayframe-azmath25s-projects.vercel.app  
**Scope:** Dayframe existing frontend and its matching isolated Neon API, no GitHub Actions, branch merge, old-account migration or Android Play Store work.

## Home

- Removed the secondary Reports shortcut from the large middle action row. Reports remains accessible through existing navigation and contextual buttons.
- Centered the two remaining Home shortcuts (Today's Plan and Start Timer) in equal columns, with more balanced mobile spacing.
- All four Home metrics now refer **only to today**:
  1. Focus today: owner-authenticated `GET /v1/time-report?period=day&day=YYYY-MM-DD` (actual saved session time).
  2. Today's plan: unique tasks in today's scheduled blocks and flexible pool.
  3. Completed today: task completion timestamps matching the current device-local date.
  4. Due today: active task deadlines equal to the current device-local date.
- A missing report displays a loading placeholder rather than a fake total. These four metrics mix exactly the same **date scope**, not week, 48 hours or all time.
- Existing note/workspace/pinned entries remain available.

## Quick Notes

- Home and full Notes library now show compact cards with title and a short text preview.
- Clicking/tapping the note body (or using Enter/Space when focused) opens its editor.
- **Delete** is the single visible action per active note; deleting retains existing confirmation and soft-delete behavior. Trash entries retain **Restore**, because deletion is already done.
- Removed Note photo and Note download actions from the Quick Note UI. Old backend data remains untouched; no data deletion.

## Rich documents

- Kept the existing owner-protected JSON export.
- Added readable, self-contained **Download HTML** from the full document editor. Exports retain headings, bold/italic/code, safe HTTP(S) links, unfinished mathematics as source, and any attached private images. Text and URLs are escaped; no remote scripts are included.
- Added up to four private images per rich document, compressed client-side. Each image is at most 180 KB after compression, with JPEG/PNG/WebP checks. Gallery permits upload and removal, and images are embedded in the HTML download.
- Backend uses three owner-scoped authenticated endpoints for `/v1/documents/{id}/attachments`: GET, PUT, DELETE; binary uploads, arbitrary HTML and public storage URLs are not enabled.
- Additive migration `0022_document_photos.sql` created a private `dayframe.document_photos` table on only the current isolated Dayframe Neon branch, with owner/document foreign key, bounded slots and cascading cleanup on document deletion. No existing documents were changed (four documents counted before and after).

## Android / browser navigation

- The web app now stores page, selected workspace, selected task and Quick Note modal state in the browser's navigation history.
- Browser/Android hardware Back returns to the previous internal screen or closes an open Quick Note, instead of automatically leaving nested pages.
- Leaving an editor with unsynced/uncertain changes retains the existing confirmation protections.
- Back on Home is not trapped; the system may exit normally.
- This is web/PWA history navigation, **not** an Android native launcher implementation.

## Visual alignment and pie charts

- Equal-size centered shortcut buttons, consistent click-target heights and aligned controls in Home, Reports, Settings, Quick Notes and the document toolbar.
- Explicit responsive CSS for wide, 700px, 390px and very narrow devices. Small-screen actions wrap without overflowing parents.
- Pie and donut charts remain **circular** in all themes, including Monochrome; square border styling applies only to cards and other controls.

## Verification performed

- Full `npm run test:ux`, Quick Notes, Documents, Reports, Time, PWA, Source, API and TypeScript checks passed.
- New HTML document export and private-document photo authorization tests passed.
- Vite production-target build and distribution guard passed using current isolated Dayframe Neon endpoints.
- Live production HTTPS homepage, JS, CSS, manifest, and service worker returned 200.
- Live API health 200; anonymous photo access 401; CORS preflight allowed the exact Dayframe origin (204) and rejected an untrusted origin (403).
- Frontend Vercel READY, exact commit above; corresponding Neon API deployed and completed.
- The dedicated eight-viewport browser script was **not executed** in the sandbox: `playwright` is not installed in the current project. Real signed-in Android/iOS navigation, visual alignment, image upload and HTML download acceptance testing remains outstanding. Do not claim verified on every physical device.

## Follow-on

Real Android Chrome PWA and Safari/device tests; browser Back after deep links and document unsynced edits; media uploads from camera and gallery; accessible long-press interactions; accurate backend period-specific per-task reporting.
