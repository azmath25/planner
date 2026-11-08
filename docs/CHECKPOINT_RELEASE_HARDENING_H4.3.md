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

## First Cloud Shell attempt and missing-Playwright fallback (2026-11-08)

The operator ran the original `python3 scripts/h4-browser-local-smoke.py` from Node 24.22.2 after pulling the feature branch. It exited immediately with **`Python Playwright is not installed`**, before opening a browser or running any UI checks. No Neon/Auth/backend requests or data writes occurred.

To avoid consuming Cloud Shell disk on Python Playwright/browser downloads, added `scripts/h4-browser-cdp-smoke.mjs` and updated the existing Python entrypoint to **automatically delegate to it** when Playwright is missing. The Node 24 script uses native `WebSocket` and the already installed system Chromium's Chrome DevTools Protocol. It builds the real Vite frontend, serves loopback-only on port 4187, attaches to a clean Chromium profile, blocks all non-loopback page requests, verifies login/signup UI navigation, local demo mounting and four responsive widths, and removes its own temporary preview/browser processes. No packages are installed and no credentials are used. The system Chromium binary must already exist; no browser is downloaded.

A CDP mini-page control-flow validation passed in the assistant's isolated test environment (form transitions, demo render, and responsive widths). That environment prohibits normal Chromium navigation (administrator policy), so **the full Dayframe UI against Vite has not been verified yet**. Source implementation and GitHub commits are not a substitute for operator-side acceptance.

GitHub commits: `865082e` (native Chromium fallback), `e558ef5` (Python entrypoint delegates), `ae06022` (localhost proxy override and interrupt cleanup).

The operator can use the **same command** as before, without adding a Python dependency:

```bash
cd ~/dayframe-h2
nvm use 24
git pull --ff-only origin feature/dayframe-m53-release-20261107
python3 scripts/h4-browser-local-smoke.py
```

**H4.3 remains pending until the actual UI smoke passes.** A PASS will still not verify live session/JWT, Safari cookies or the missing live Neon migrations 0013–0020.
