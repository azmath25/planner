# Dayframe H4.1 — disposable PostgreSQL 18 regression gate

**Date:** 2026-11-08  
**Feature branch:** `feature/dayframe-m53-release-20261107`  
**Status:** script implemented, pending execution in an environment with Docker; do not merge or deploy.

## Verified context

- H3.1 genuine patched lockfile is now committed at `47d7c9a` on the feature branch. Previous H3 automated tests, TypeScript, bundle, PWA, and high/critical npm audit passed.
- The connected Dayframe Neon project `soft-night-61558675` uses PostgreSQL 18. Production/main branch `br-shiny-king-b9np2anx` has migration versions 0001–0012; repository scripts continue through 0020.
- The Neon account rejected an attempted **short suspend timeout** for a new test branch, so the attempt **created no new branch**. We deliberately did not launch an always-on Neon test compute that could accumulate charges.
- Local regression suite `tests/deep-postgres-regression.mjs` explicitly loads migration files 0001–0020 and exercises actual API SQL and concurrency on an isolated database. Its connection guard only allows `postgres://audit:auditpass@127.0.0.1:5432/dayframe_audit`.

## Implementation

Added `scripts/h4-postgres18-disposable.sh`:
- Refuses any branch other than the Dayframe feature branch and requires Node 24 and local Docker.
- Refuses an occupied local PostgreSQL port (never reuses an existing developer/prod database).
- Uses a uniquely named `postgres:18-alpine` Docker container, bound **only** to `127.0.0.1:5432`, with fixed test-only credentials and temporary storage.
- Runs the exact `tests/deep-postgres-regression.mjs` suite against that container, including migrations 0001–0020.
- Removes the test container in an EXIT trap and emits error-tail logs only on failure. Does not call Neon, GitHub, GCP, or a deployed API.
- Checks free disk space before pulling the official test image. If Docker is unavailable, it exits safely without touching a database.

## How to run (one local command)

```bash
cd ~/dayframe-h2
git pull --ff-only origin feature/dayframe-m53-release-20261107
bash scripts/h4-postgres18-disposable.sh
```

## Unresolved gates

H4.1 must be **executed and pass** before release can proceed. A successful disposable test also does not apply migration 0013–0020 to the real Dayframe database; a separate controlled schema update is still needed. Neon Auth real login/refresh/logout with protected API route, front-end Chromium/mobile/Safari/PWA browser testing, and backend deployment alignment remain unverified.

**No production writes or deployment performed.**
