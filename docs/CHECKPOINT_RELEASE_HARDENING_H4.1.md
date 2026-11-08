# Dayframe H4.1 — disposable PostgreSQL 18 regression gate

**Date:** 2026-11-08  
**Feature branch:** `feature/dayframe-m53-release-20261107`  
**Status:** H4.1 disposable PostgreSQL 18 gate **passed (33/33, operator-reported)**; no live Neon migration or deployment.

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

## Actual PostgreSQL 18 test result and corrective patch — 2026-11-08

The operator ran `bash scripts/h4-postgres18-disposable.sh` with 1.2 GB free. It pulled the official `postgres:18-alpine` image, started a disposable loopback-only test database, applied **all 20 migrations**, and executed **33 real PostgreSQL integration tests**. **30 passed, 3 failed**. The test container was cleaned up automatically; no Neon or project database was modified. Cloud Shell storage remained about 1.2 GB free.

Two M6.2a documents tests failed with PostgreSQL `42601` at `INSERT INTO dayframe.documents d (...)`: PostgreSQL requires `AS d` for an `INSERT` table alias. Patched `DOCUMENT_INSERT_SQL` in `backend/src/index.mjs` to `INSERT INTO dayframe.documents AS d (...)`, preserving the existing `RETURNING d.*` columns. Added `backend/tests/documents.test.mjs` unit assertion to prevent regression.

One M7.3 insights test failed with `23505 workspaces_pkey` because its workspace ID `e7111111-...` duplicated an ID inserted by the preceding M7.2 period report test. The M7.3 test now uses seven separate `c9...` fixture UUIDs, statically verified not to occur in any other integration-test block. This changes **test fixtures only**, not application code or migration SQL.

GitHub commits: `bcfaa28` (document query), `bf2b11f` (fixture IDs), `edb441d` (regression assertion). Source checks on the committed files confirm the corrected alias and disjoint UUIDs. **The patched PostgreSQL suite has not yet been executed**, so H4.1 remains *pending* rather than passed.

Retest on the same Cloud Shell after pulling the branch:

```bash
cd ~/dayframe-h2
git pull --ff-only origin feature/dayframe-m53-release-20261107
bash scripts/h4-postgres18-disposable.sh
```

Do not run migration scripts 0013–0020 on Neon main or deploy functions based on this patch alone. Real auth, browser/mobile/PWA/Safari signoff, and schema drift are later release gates.

## PostgreSQL 18 rerun: 32/33, last fixture collision corrected (2026-11-08)

The operator reran `scripts/h4-postgres18-disposable.sh` after the SQL alias and M7.3 UUID fixes. All **20 migrations passed**; **32 of 33** integration tests passed. Both M6.2a documents tests now passed, confirming the source SQL correction.

The sole failure was `23505 notification_preferences_pkey`: M7.3 audit-event test inserted `owner_user_id=m73-insights-owner`, which an earlier M7.3 source-backed test had already inserted. The prior UUID fix only isolated row IDs, not **owner-scoped records**; it did not fully isolate the fixtures.

Fixed `tests/deep-postgres-regression.mjs` by giving the M7.3 audit-event test distinct `m73-events-owner` and `m73-events-other` identities, in addition to its already-isolated `c9...` UUIDs. Verified through source inspection that the two M7.3 blocks now share neither owners nor record UUIDs. Git commit `5a7ab56` on the feature branch.

The disposable test container was removed after failure; no Neon main writes occurred. **33/33 passing is not yet demonstrated**. Run the same isolated command again after pulling the branch. Keep H4.1 pending until the rerun passes. The subsequent Neon production migration and browser/Auth gates remain separate.

## Third PostgreSQL 18 run — 32/33; actual calendar-day fixture defect (2026-11-08)

The operator's latest `scripts/h4-postgres18-disposable.sh` run again applied all 20 migration files without errors and passed **32 of 33 tests**. M7.3 audit-event assertions failed at `tests/deep-postgres-regression.mjs:767`: `deadline.completedEvents` was 1 instead of the fixture's expected 2. This is *not* another UUID or preference collision; the SQL ran successfully.

Root cause confirmed against `backend/src/time-insights.mjs`: the daily report filters completion events by **Asia/Baku local day**, with bounds from `start_day AT TIME ZONE zone` through exclusive `end_day AT TIME ZONE zone`. The test assigned the second completion `2026-11-07T20:00:00Z`, which is **November 8 at 00:00 Asia/Baku** and therefore correctly excluded from the November 7 report. The SQL behavior is correct; changing the production query to count that event would introduce a timezone bug.

Fix committed:
- `d59e585`: M7.3 second task's date-only deadline changed to **November 6**, and its completion set to **2026-11-07T19:00:00Z** (November 7 23:00 in Baku), making it legitimately late *within the selected November 7 local day*. The first task completes November 7 at 19:00 local and is on time. Both events now belong in the daily report; the separate midnight-boundary regression remains unchanged.
- `f190ac8`: added a direct PostgreSQL date check that both generated completion audit events map to `2026-11-07` using `(created_at AT TIME ZONE 'Asia/Baku')::date`. This guards against future fixture mistakes.

Only **test files** changed in this latest correction. Production time-insights SQL and migrations were not modified. The disposable PostgreSQL container was removed, and no production/Neon writes were made.

**H4.1 stays pending until a rerun confirms 33/33.** Do not proceed to production migrations or deployment based only on the source patch.

## H4.1 acceptance — all 33 PostgreSQL regressions passed (reported 2026-11-08)

After `d59e585` and `f190ac8` corrected the Asia/Baku calendar-day fixture, the operator reported **“all pass”** for the same disposable `postgres:18-alpine` test script. Record this as **33/33 passing, user-confirmed**; a complete terminal log for this successful run was not attached to the conversation. Do not falsely label the latest successful output independently inspected. Earlier PostgreSQL 18 runs demonstrably applied migrations 0001–0020, and prior test failures were documented and fixed on the feature branch.

**H4.1 is accepted.** The actual Neon main database remains at migration 0012. H4.2 browser/Managed Neon Auth and H5 controlled schema migration + deployment remain pending. No live Neon SQL writes, branch merge, or production release occurred as part of H4.1.
