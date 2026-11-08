# Dayframe post-audit implementation checkpoint — 2026-11-08

## User decisions and limits

- Keep the current public Vercel Dayframe URL `https://dayframe-azmath25s-projects.vercel.app`; no “staging” name in its public URL.
- **No migration** from the older Neon Dayframe project. Do not delete old account data or migrate users or records.
- Finish web/PWA functionality and improve all screen sizes; **Android Play Store publication is explicitly out of scope**.
- No GitHub Actions (budget restricted). Use the existing GitHub-linked Vercel project and the existing Neon Dayframe branch.

## Code completed on feature branch

Source branch: `feature/dayframe-m53-release-20261107`, last build-checked commit `78f1b1f6f71efa1d49cb800d4642936c262cc393`.

1. **Floating timer width safety.** `web/src/styles.css` now uses a two-row grid on phone widths, a constrained task-name column with ellipsis, a separate tabular-numeric timer value, and wrapping controls. At 320–360px the timer title and digits cannot force the action row beyond the viewport by flexbox sizing. No user data involved.
2. **Actual pie reports.** `web/src/domain/reportPie.ts` safely aggregates finite positive saved values into up to eight accessible slices, groups excess workspaces as “Other”, and renders honest zero states. `web/src/legacy/legacy.ts` embeds two pie charts in signed-in Daily/Weekly/Monthly Reports: *recorded focused time by workspace* and *planned minutes by workspace*. The existing tables, CSV downloads and insights remain available. Palette and accessible legends live in `web/src/styles.css`.
3. **Document zoom.** `web/src/components/DocumentPage.tsx` exposes accessible `−`, numeric percent/reset, `+` controls, **60–150% in 10% steps**, remembered per account in browser-local storage. Zoom affects only the writing canvas and never the saved document JSON or editor autosave revision.
4. **Document preservation first.** Earlier pending `DocumentPage.tsx`, `BlockDocumentEditor.tsx` and `documentDraftBackup.ts` changes save unfinished/incorrect mathematics without front-end semantic blocking, back up unsynced drafts in account-and-document-scoped local storage, reconcile uncertain network writes before resending, and preserve conflicts. Backend still rejects oversized documents, executable media and unauthorized writes.
5. **Push sender packaging and key rotation preparation.** Current Neon project `wispy-meadow-90135924` / branch `br-delicate-violet-b9cnjyuh` now has a `dayframedue` Function deployment 1 (Node24, **completed**), backed by that branch's database and a private VAPID signing key stored **only** in Neon environment variables. `backend/src/index.mjs` and `backend/src/reminder-dispatch.mjs` contain the corresponding **public** key, and `web/src/legacy/legacy.ts` refreshes a browser subscription when its key differs after a future frontend release. The schedule `dayframe-reminder-dispatch` is created for `*/5 * * * *` but **disabled** until matching frontend and API are deployed, to avoid breaking existing device subscriptions. Manual GET `/dispatch` returns 404 and a forged POST returns 403.

## Verification actually performed

- Backend unit/API suite: **89 pass, 0 fail**.
- Document validation / account-scoped draft backup suite: **11 pass, 0 fail**.
- Report and pie chart suite: **11 pass, 0 fail**.
- Time-tracking suite: **6 pass, 0 fail**.
- PWA service worker suite: **3 pass, 0 fail**.
- Source and insights helper suite: **pass**.
- TypeScript/Vite compiled; `npm run check:dist` verified Vercel root PWA and **isolated Neon endpoints**: **pass**. Node24 on disposable Vercel sandbox, no GitHub Actions.
- A repeatable eight-viewport Chromium layout test is committed in `tests/responsive-layout-browser.mjs`. **It was NOT successfully executed**: the disposable Vercel sandbox contains Chromium but lacks required system libraries (`libnss3`, `libglib`, `libatk`, and others). This is a test-environment blocker, not evidence the phone layout has passed. Samsung, Safari, tablets, iOS and keyboard/focus checks remain to be run on actual browser infrastructure.
- No end-to-end *authenticated browser* test with two real accounts or successful push delivery was performed in this checkpoint.

## Deployment and blocking prerequisites

**Vercel production remains the last READY deployment at source SHA `ffd1e080349fb584197d761b0651ed885e06b9e4`**; the newly implemented frontend is not yet published. An authorized Vercel production deploy attempt earlier on 2026-11-08 was rejected **HTTP 402 `api-deployments-free-per-day`**, meaning the Hobby team has exhausted its daily deployment allowance; the API requested a 24-hour retry. It must not be described as a working release.

The current public site's Neon API is still deployment **6**, serving its previous public push key. The new `dayframedue` function has its own new signing key and therefore **must remain unscheduled** until a coordinated release:
1. Once Vercel allows deployments again, publish the exact feature commit on the same `dayframe` project with its existing production-only `VITE_*` settings. Verify it is READY and the public URL serves its versioned assets. GitHub Actions are not required.
2. Deploy the matching API build to **only** current Neon project `wispy-meadow-90135924`, preserving its current Auth issuer, JWKS and exact Vercel domain CORS. Confirm `GET /health` = 200, anonymous `/v1/me` = 401, trusted CORS = 204, unknown CORS = 403.
3. Enable the already-created **current-project** reminder schedule. Verify a controlled scheduled invocation and delivery audit without sending fake notification data.
4. Existing browsers must refresh/re-enable browser push so their subscription uses the new VAPID key. This is handled by the new frontend's “Enable browser notifications” action. Do not assume old subscriptions are deliverable.
5. Test real signed-in mobile document editing including intentionally malformed LaTeX (retained and saved), zoom 60/100/150%, timer 320px widths/very long elapsed time, and empty/nonempty pie reports.

## Remaining incomplete items (not silently declared done)

- **P0:** Publish frontend and API in coordinated release (Vercel Hobby quota), then enable verified background reminders and obtain a real delivery result.
- **P1:** Real device/browser acceptance matrix (Samsung/Android Chrome, iOS Safari PWA, tablet and desktop), including mobile keyboard focus, 320px timer width, zoom and account-specific drafts.
- **P1:** Auth refresh and two-account ownership tests against the live backend; test multi-device timer and conflict recovery.
- **P1:** Quick Notes retain an explicit Save action; full cloud autosave for Quick Notes remains separate work.
- **P2:** Full offline-first task/notes sync and binary document/image attachments remain unimplemented. Present PWA worker intentionally caches only public assets; offline personal APIs are not cached, by design.
- **Excluded:** Android Play Store publication and migration of the older Neon project.

No production DB schema changes, old data deletion, branch merge, GitHub Actions, or Quizer/Mimo work occurred in this checkpoint.

## Task-linked documents — stale M6.3 banner removal

- Removed the visible “Autosave arrives in M6.3” text from the task Notes panel and replaced the generic “Task documents” button with **“Add or open documents.”**
- The button continues to open the task-filtered Documents library. That library now explicitly says **“Task documents”**, identifies the selected task, and offers **“New task document.”** New pages inherit the selected task ID and workspace.
- Removed the obsolete “Save edits explicitly” guidance from the Notes page. Rich document drafts autosave; Quick Notes remain a separate explicit-save workflow.
- Regression: `node --test tests/taskDocumentsWiring.test.mjs` passed all three checks; TypeScript typecheck, source tests, document tests and Vite distribution build passed in a disposable sandbox.
- **Not yet live:** production remains on the earlier Vercel READY release until its Hobby deployment quota resets. No GitHub Actions or database changes.
