# Dayframe — release hardening H1: document creation recovery

**Branch:** `feature/dayframe-m53-release-20261107`  
**Status:** one focused fix and tests staged; no merge, deployment, GitHub Actions, Cloud Shell or database operations.

## Why
Following M8's read-only audit, `DocumentPage.tsx` kept `pendingCreate` after any failed POST. Although same-ID Retry creation worked, an unrecoverable error could leave the entire private document library blocked. Clearing the pending ID silently would be dangerous because an earlier request could have committed.

## Implementation
- Retain the original UUID and exact payload for the existing Retry creation action. Retrying never uses a new ID.
- Add **Abandon retry** with an explicit confirmation explaining that an uncertain earlier request might already have committed and should be checked in My documents. This does not delete the server record, reset the current editor or silently create a new document.
- On acknowledgment, clear only the pending-create request. The UI directs the user to Refresh to check for possible saved results. If the user dismisses the confirmation, pending-create protection remains.
- Extend the disposable browser mock with an explicit rejection *before* insertion (HTTP 400), distinct from the already-covered lost response *after* insertion.
- Extend `tests/m62-documents-browser.py` for same-UUID reconciliation, cancellation declined/accepted, ability to create after cancel, and preservation of already committed documents after abandoning a retry.

## Verification performed here
Read the updated files back from the feature branch. 11 targeted source consistency checks passed, including a V8 syntax parse of the mock and checks that Retry creation still reuses its original UUID. **Browser tests have been written but not run**.

## Remaining release blockers and follow-up
1. `package-lock.json` remains missing. The actual dependency build, TypeScript check and CI gate cannot run until a trusted npm-enabled environment generates it.
2. Full PostgreSQL migration 0001–0020 regression suite, real BlockNote browser tests, Safari/mobile, PWA install/offline/update and performance tests remain unrun.
3. The backend follows Neon's published Managed Better Auth verification example (EdDSA, issuer, valid subject). Audience validation must be assessed against **an actual Dayframe-issued session token** before imposing a potentially incompatible mandatory claim. Do not log or paste tokens. Never claim a token-purpose isolation gate was verified.
4. A separate H2 checkpoint should resolve verified build/runtime failures after lockfile generation. Release authorization and deployment remain separate.

**No production changes or runtime claims.**
