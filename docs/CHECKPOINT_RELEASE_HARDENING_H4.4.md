# Dayframe H4.4 — authenticated browser readiness and honest test boundary

**Date:** 2026-11-08  
**Branch:** `feature/dayframe-m53-release-20261107`  
**Status:** read-only environment/source inspection complete; **real authenticated browser acceptance NOT passed**. No deploy, merge, production migration or account creation authorized by this checkpoint.

## What was actually observed

- The operator confirmed the Dayframe feature build rendered correctly in Cloud Shell Web Preview (H4.3 **manual** UI smoke). The automated Chromium smoke did **not** pass: the available shell lacked an installed Chromium browser. Do not claim automated H4.3 evidence.
- Neon Auth on project `soft-night-61558675`, default branch `br-shiny-king-b9np2anx`, has Better Auth configured with email/password and sign-up enabled; the trusted origin includes `https://azmath25.github.io`; localhost allowance is enabled. These are settings only, **not evidence of a successful session**.
- Neon functions `dayframeapi` (deployment 15, 2026-11-07) and `dayframedue` (deployment 4, 2026-11-07) are deployed under Node 24. Their existence does **not** prove their code is up to date with the feature branch.
- The feature frontend uses `@neondatabase/auth`. `AuthScreen.tsx` calls `signIn.email` / `signUp.email`, then `getSession()`, and reloads only if a user is present. `App.tsx` requires `useSession()` and a successful `loadCloudSnapshot` for the signed-in app. `api.ts` requests an auth token, falls back to the cookie-backed `/token` route when necessary, and sends a Bearer token to protected endpoints. It does not put the JWT in localStorage. Logout revokes the auth session and reloads after best-effort push endpoint cleanup.
- The feature backend restricts CORS to `https://azmath25.github.io`. Cloud Shell Web Preview is an **untrusted different origin** and must **not** be added to production CORS solely to make this test work.
- Existing GitHub Pages `main` is an older feature build; current live Neon main contains only migrations 0001–0012, whereas feature source expects through 0020. Neither Pages sign-in on the older build nor success within a local-only demo proves H4.4 feature compatibility.

## Remaining H4.4 test protocol

Only run the following against a feature-compatible **approved** browser origin and backend/database with migrations 0001–0020 rehearsed, using dedicated test accounts. Do **not** share passwords, tokens, session cookies, or identity-bearing responses in a chat or commit.

1. **Signed out:** protected `/v1/me` returns 401; visible account screen has no previous user's workspace content.
2. **Account A:** sign up or sign in with dedicated credentials using the real interface. Confirm the authentication service accepted the sign-in **and** `getSession()` returned the same user after a reload; ensure the app loads its single General workspace, not local demo records.
3. **Authorized API:** the actual browser obtains a short-lived auth token through the supported Neon SDK/token route; a protected `GET /v1/me` succeeds for the current user. Do not print or persist the token for evidence.
4. **Persistence and logout:** reload and open a new tab; confirm A's session and workspace remain. Sign out, reload, then confirm `/v1/me` rejects unauthenticated access and A's personal tasks are no longer visible.
5. **Account isolation:** sign in as distinct dedicated account B, verify A's tasks/notes/documents are not accessible by B; an authenticated cross-owner read/write must be rejected or return no data. Do not use real personal records or cross-owner production IDs.
6. **Browser matrix:** repeat session restore/sign-out at the real allowed origin in desktop Chrome and Safari (including Safari's cross-site cookie restrictions), plus a small-screen browser. Distinguish auth cookie blocked, invalid JWT, CORS rejected, missing migration, and backend API error in the report.
7. **Security evidence:** report test outcome, browser/device, HTTP status classes and redacted errors only; never paste secrets or full auth headers.

## Explicit blockers and release boundary

- No end-to-end browser login, token, authenticated `/v1/me`, account separation or Safari evidence has been supplied yet.
- Do not substitute a script-only bearer request or a local demo for browser cookie/session behavior.
- Do not modify trusted origins/CORS, provision a production account, deploy frontend/API or apply migrations 0013–0020 merely to make H4.4 green. A controlled isolated rehearsal environment or separate approved release step is required.
- H5 remains **blocked** until the feature-compatible backend/schema/origin and real session tests are demonstrated, followed by explicit release authorization.
