# Dayframe H4.3 — real feature frontend browser UI smoke, isolated from Neon

**Date:** 2026-11-08  
**Feature branch:** `feature/dayframe-m53-release-20261107`  
**Status:** implementation committed; execution and live-auth verification outstanding. No release authorized.

## Inputs and rationale

- H4.1: operator reported 33/33 disposable PostgreSQL 18 regression tests passing, migrations 0001–0020.
- H4.2: operator's Cloud Shell log proved four **live, unauthenticated public service checks passed**: Neon Auth Ed25519 JWKS, Dayframe API health, anonymous `/v1/me` rejection (401), trusted/foreign-origin CORS.
- Existing GitHub Pages `main` site is older than the new feature branch. A Cloud Shell browser-preview origin is neither the production Pages origin used in the backend's CORS allowlist nor a trusted live browser-sign-in proof; do not weaken production CORS to test a preview.
- Live Neon schema still has migrations 0001–0012; newer feature endpoints cannot be declared ready.

## Added `scripts/h4-browser-local-smoke.py`

A self-contained, **non-deploying** Python Playwright Chromium check that uses the **real Vite build** rather than mocked legacy harness source. It:
- Requires feature branch, Node 24+, already-installed dependencies and Python Playwright. No `npm ci`, `pip install`, or browser downloads are performed.
- Checks port 4187 is unused and starts a loopback-only Vite preview of the production build at `/planner/`.
- Blocks every browser network request to non-loopback hosts, including requests to Neon Auth/Neon Functions. Neither accounts nor passwords are supplied or touched.
- Confirms sign-in form renders, sign-up form can be opened and closed, and the local-only demo renders actual mobile navigation without signing in.
- Checks for horizontal overflow at 320, 390, 768 and 1440 px viewport widths.
- Terminates **only its own** preview process group, even on test failure. Does not touch existing development servers, Neon, GitHub main or production.
- A passing result is explicitly **only an isolated frontend UI check**, never evidence of working login, API authorization, session persistence, or Safari.

### One Cloud Shell command block

```bash
cd ~/dayframe-h2
nvm use 24
git pull --ff-only origin feature/dayframe-m53-release-20261107
python3 scripts/h4-browser-local-smoke.py
```

If Python Playwright/Chromium are unavailable, report that blocker. Do not auto-install a large browser on the quota-constrained Cloud Shell disk.

## Remaining signoff

H4.3 local UI smoke remains unexecuted. Genuine authenticated browser flow needs a controlled **same-origin**, feature-compatible environment or preview with suitable Auth origin and API CORS configuration, plus a dedicated test account, before asserting: signup/sign-in, session restore after reload, protected `/v1/me` and owner isolation, logout, Safari/ITP behavior, and mobile/PWA. Deployed `main` still differs from feature branch; do not conflate them.

H5 remains blocked on controlled migrations 0013–0020 to Neon main and a verified matching backend/frontend release. No production schema writes or deployments have occurred in H4.3.
