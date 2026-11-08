# Dayframe H4.2 — public Auth/API readiness and browser integration

**Date:** 2026-11-08  
**Branch:** `feature/dayframe-m53-release-20261107`  
**Scope:** verification only; no production data writes, auth setting changes, deployment, or merge.

## H4.1 accepted

The operator reported **all 33/33 tests passing** after the Baku local-time fixture corrections. All 20 migrations were exercised on disposable PostgreSQL 18. Source failures discovered in earlier runs (SQL alias and duplicate test fixtures) were corrected and committed on the feature branch. H4.1 is complete.

## Verified Neon configuration (read-only, 2026-11-08)

Neon project `soft-night-61558675` and branch `br-shiny-king-b9np2anx`:
- Managed Better Auth exists. Trusted origin is `https://azmath25.github.io`, which matches the backend CORS allowlist.
- Email/password is enabled, with sign-up allowed; localhost origins are allowed. These settings have not been changed.
- Neon Auth public base URL equals the hardcoded fallback in `web/src/auth/client.ts`.
- `dayframeapi` and `dayframedue` have active Node 24 function deployments, but deployment status **does not prove** the feature branch's new code is live.
- Existing database's highest migration record is **0012_weekly_targets**. Migrations 0013–0020 were **not** applied to the live branch.

## Added public, read-only smoke

`scripts/h4-auth-public-smoke.mjs` probes the existing public Neon services. No credentials, browser sessions or tokens are supplied, and only GET/OPTIONS requests are used. It validates:

1. GET `/health` returns the Dayframe service's success response.
2. GET `/v1/me` without authentication is rejected with 401.
3. CORS permits the configured Pages origin and rejects an unrelated origin.
4. Public Auth JWKS is reachable and exposes a valid Ed25519 verification key.

The script derives public URLs from the feature source, pins their exact expected Neon hostnames and verifies the Pages origin. **It has not yet been run against the remote endpoints** because the assistant runtime cannot resolve those service hostnames. It is not an interactive user sign-in test.

### Run once from the established Cloud Shell

```bash
cd ~/dayframe-h2
git pull --ff-only origin feature/dayframe-m53-release-20261107
node scripts/h4-auth-public-smoke.mjs
```

This script is safe against the currently deployed environment and does not require credentials. A PASS only establishes public endpoint and CORS readiness.

## Remaining gates

**Manual live-browser verification still required**, particularly Safari cross-site cookie behavior: sign up, sign in, reload with restored session, obtain a JWT, read `/v1/me` with valid bearer token, mutate an isolated test account's task, sign out, and ensure another account's data never appears. These actions must be performed in an explicitly scoped test account/environment, not silently by the assistant. Do not paste credentials or JWTs into a chat.

Local mocked browser harnesses for Dayframe features do not establish real Neon Auth functionality. The actual GitHub Pages `main` branch is still the older M5.3 published tree; do not infer the new feature branch's runtime behavior from that published site. Complete a controlled migration and release readiness gate before publishing the new feature code.

**H4.2 public service gate: PASSED from Cloud Shell (operator log, 2026-11-08). Real browser sign-in remains outstanding and is tracked separately as H4.3.**

## H4.2 operator execution — passed (2026-11-08)

After pulling feature commit `50bc88f`, the operator ran `node scripts/h4-auth-public-smoke.mjs` in the existing Cloud Shell checkout. The complete terminal excerpt showed:

- `PASS Neon Auth public EdDSA JWKS is reachable`;
- `PASS Unauthenticated account endpoint rejects access with 401`;
- `PASS Dayframe API health is 200 and identifies the service`;
- `PASS Only the production Pages origin is allowed by CORS`;
- final `PASS: H4.2 public service readiness (read-only).`

This **closes the public service readiness gate**. It does **not** establish real sign-up/login, Safari cross-site cookie compatibility, JWT-protected API access, account isolation, the latest backend feature deployment, or migration readiness. Maintain the no-production-writes and no-deploy boundaries while those separate gates remain open.
