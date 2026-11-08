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

## Isolated staging environment — actual work on 2026-11-08

**Separate Neon project created:** `wispy-meadow-90135924` (`dayframe-h44-staging-20261108`), region `aws-eu-central-1`, PostgreSQL 18. Its initial branch is `br-delicate-violet-b9cnjyuh`, database `dayframe`, role `dayframe_owner`. It was created as an **empty project**, not by branching the live Dayframe project. No production records were copied.

- A requested explicit 300-second compute suspend timeout was rejected by Neon HTTP 412 (not permitted by account); the successful create omitted that override and used 0.25-CU minimum/maximum with provider-managed default suspension.
- Provisioned **separate Managed Better Auth** for the staging database. Its Auth base URL is `https://ep-wispy-surf-b94f834t.neonauth.c-7.eu-central-1.aws.neon.tech/dayframe/auth`. Email/password and signup are enabled; trusted origins are still empty; localhost is allowed. **No staging test accounts or sessions have been created.**
- Applied the exact migration source files `backend/db/migrations/0001_foundation.sql` through `0020_requeue_notification_preferences.sql` in order, as separate transactional SQL statements where needed, **only to this new staging project**. Their migration-ledger query returned **20 applied versions**, from `0001_foundation` through `0020_requeue_notification_preferences`.
- Verified 19 Dayframe application tables exist, and `workspaces=0`, `tasks=0`, `quick_notes=0`, `documents=0`. These checks do not establish a complete functional API test or a repeat-migration idempotency run.
- Staging functions inventory returned `[]`: **no feature-matched staging API has been deployed**. Feature source still has fixed production Auth/API endpoints and production-only CORS. Do not connect a staging browser to the production API just to simulate a pass.
- The production Neon project `soft-night-61558675`, its main migrations, functions and Auth settings, and the GitHub Pages production site were **not** altered during this staging setup.
- At the owner's request, use the **Vercel free Hobby plan** for the next frontend deployment after separate authorization, rather than GitHub Pages/GitHub Actions; restrict use to personal/non-commercial projects. No Vercel project was linked or deployed in this checkpoint.

### Next H4.4 actions (not yet performed)

1. Build and review an explicit staging-only frontend configuration and full M8 API bundle. Do not reuse the older M5.3 prepackaged API ZIP as if it included M6–M8.
2. After a Vercel preview origin exists, allow that **exact origin only** in staging Auth and staging backend CORS. Keep the production frontend/API defaults unchanged and establish hard guards against cross-environment requests.
3. Deploy only to the isolated staging project after an explicit staging-deploy checkpoint; run signed-out API, user A/B separation, session restore, logout, Safari and mobile/browser tests. Protect credentials and suppress token logging.
4. H4.4 acceptance and H5 production release are still **pending**. No Actions, production migration, main merge or public production deployment authorized.

## H4.4 isolated Vercel staging wiring — 2026-11-08

The owner's preferred next frontend platform is **Vercel Hobby**; the connected team `azmath25s-projects` confirmed the `hobby` plan. Created standalone, **unlinked and undeployed** Vercel project `dayframe-h44-staging` (ID `prj_boouNVDs7mB9LfI9Ekwo7Cam8nkj`), with Vite, `npm ci`, `npm run build`, `dist`, and preview auto-deploy disabled. No domain or deployment exists. The project currently reports Node 26.x; the frontend's source gate accepts Node 24+, and the Neon API runtime remains Node 24.

Feature-branch source changes:
- Explicit `VITE_DAYFRAME_TARGET=staging` selects root-hosted Vite assets, stages the PWA manifest `id`/`start_url`/`scope` to `/` via `scripts/finalize-site.mjs`, and uses the isolated staging Auth URL. Default production/GitHub Pages output remains `/planner/`.
- Staging compilation **must** specify `VITE_DAYFRAME_STAGING_API_URL` as a *separate* Neon Function endpoint. It rejects an absent URL, an incorrectly shaped endpoint, or the original production endpoint. The optional staging Auth override must exactly equal the known separate staging Auth URL. No private credentials may enter `VITE_*` variables.
- Backend staging CORS supports exactly one `DAYFRAME_STAGING_ORIGIN` with a `*.vercel.app` HTTPS host. It refuses to activate staging CORS unless `DAYFRAME_ENV=staging` and its injected `NEON_AUTH_BASE_URL` matches the **isolated** staging Auth service. Otherwise, the original production Pages origin remains.
- Updated `scripts/check-dist.mjs` to verify the correct target's asset and manifest scope; the unauthenticated H4.2 public smoke still probes the pinned **production** endpoints.
- No staging API was deployed; the previous `backend/packaged/dayframeapi.b64` artifact predates M6–M8 and is NOT feature-matched. Rebuild the full source with esbuild/Node 24 before any staging API deploy.

### Operator checks before any staging deployment

From the feature checkout (do not use GitHub Actions):
```bash
cd ~/dayframe-h2
git pull --ff-only origin feature/dayframe-m53-release-20261107
node -v
npm run test:source
npm run test:api
npm run build
npm run check:dist
```
The default build checks GitHub Pages output and never deploys. Do not set `VITE_DAYFRAME_TARGET=staging` for Vercel until a separate staging API HTTPS URL exists and `VITE_DAYFRAME_STAGING_API_URL` is pinned. After that, rerun the build and `check:dist` with both variables set, and verify no production hostname was compiled into the staging bundle before releasing the preview.

**Still pending:** stage-compatible full Neon API deployment, staging CORS origin pin, Vercel preview launch, two-account browser sign-in/ownership tests, Safari session persistence and PWA install review. An unlinked Vercel project and a staged database are **not** a running or accepted Dayframe release.

## Cloud Shell source/build result and staged API package tool

On 2026-11-08 the operator submitted a Cloud Shell output showing:
- `npm run typecheck` completed, and Vite 8.3.6 compiled 1,235 modules and reported `built in 1.59s`.
- `scripts/finalize-site.mjs` printed `Dayframe PWA manifest scope: /planner/`, the correct **default** GitHub Pages build; this is not a staging build.
- `npm run check:dist` printed PASS for the PWA assets, and PASS for React assets with Pages subpath.
- Vite warned about entry and BlockNote editor chunks larger than 500 kB, plus `MODULE_LEVEL_DIRECTIVE` warnings from Mantine/Rolldown. They were **non-fatal**; they merit future bundle/performance review but do not establish an app failure.
- The attached output **did not include `npm run test:source` or `npm run test:api` results**. They remain unverified from this operator log; do not silently mark them passed.

Added `scripts/h44-package-staging-api.py` (feature branch only), to prepare the next isolated API deployment **without deploying it**. It checks branch, Node 24+, staging issuer guard, and installed esbuild. `--plan` performs only preflight; `--build` runs targeted `test:source` and `test:api`, bundles the full current `backend/src/index.mjs` with esbuild, checks Node syntax/ZIP integrity, and writes an untracked ZIP under `/tmp`. This avoids using the stale M5.3 artifact, GitHub Actions and production Neon credentials. Its operator execution is **pending**.

Cloud Shell commands (no release):
```bash
cd ~/dayframe-h2
git pull --ff-only origin feature/dayframe-m53-release-20261107
python3 scripts/h44-package-staging-api.py --plan
python3 scripts/h44-package-staging-api.py --build
```
Do not run a Neon deploy or enable Vercel preview publishing without verifying the exact target, staging origin and build; no app-hosted user/session acceptance has been performed.
