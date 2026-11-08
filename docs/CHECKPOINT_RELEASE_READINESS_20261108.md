# Dayframe H3–H5 release readiness — verified facts (2026-11-08)

**Feature branch:** `feature/dayframe-m53-release-20261107` (no merge or deployment authorized by this checkpoint). **GitHub main:** older M5.3 build, not the tested M8 feature tree.

## H3.1 — dependency reproducibility

- User's Node 24.22.2 Cloud Shell run passed the entire H3.1 script: source/domain/API tests, TypeScript, Vite build, dist/PWA checks, npm audit at high severity.
- The genuine patched lockfile exists **only in the Cloud Shell checkout**. Its git commit failed solely because the shell lacked a configured author identity. The file was already staged.
- `scripts/h3-finalize-lock.sh` resolves that exact case, validating the staged lockfile and assigning the verified connected GitHub identity *only for the commit*. It refuses unexpected staged/unstaged tracked files and moves **only the feature branch**.
- Runtime dependency peer warnings remain (Neon Auth / Better Auth core / better-call / @better-fetch), even though tested bundles compile. Seven low-severity transitive npm advisories remain.

## H3.2 — read-only live Neon inspection completed, integration still blocked

Connected Neon project `soft-night-61558675` (`dayframe`, PostgreSQL **18**, main branch `br-shiny-king-b9np2anx`) was inspected without writes. Its Managed Neon Auth configuration is present with `https://azmath25.github.io` as a trusted origin; email/password login and Google OAuth provider are configured, signup is enabled, email verification is not required, and localhost origins are allowed. These are **settings**, not proof that sign-in and session refresh actually succeed. Do not create test users or modify login settings without a controlled release plan.

The branch has deployed functions `dayframeapi` and `dayframedue`, but function existence does not prove the current feature branch's API source or UI bundle was deployed. Browser login/token refresh, real protected-route access, logout, Safari/cross-site cookies, and account switching remain **unverified**.

## H4 — database schema drift: real blocker

The actual `dayframe.schema_migrations` table reports **0001–0012 only**. The GitHub feature branch includes migration scripts **0001–0020**. Therefore eight migrations (0013–0020: notes, notification settings, documents, workspace pins, completion index and guards) are **not recorded as applied** on the existing Neon main branch. Their new tables are also absent. The M8 application cannot be declared fully working against this database.

Do **not** apply missing migrations directly to main as a test. Rehearse the exact migration scripts and SQL regression suite on a disposable PostgreSQL instance or isolated Neon branch first, then use controlled migration authorization, checks and rollback strategy. `scripts/m8-verify-local.sh` currently restricts the SQL regression to a local disposable PostgreSQL **16**, whereas the connected Neon project is PostgreSQL **18**. Verify compatibility with the actual target version before release.

## H5 — release block

Do not deploy the unverified feature tree to GitHub Pages or update Neon functions until:
1. The genuine security-patched lockfile is committed to the feature branch;
2. Real Neon Auth/browser and identity verification pass;
3. Migrations 0013–0020 pass isolated rehearsal and controlled production application;
4. Browser PWA/mobile/Safari tests pass (and bundle size warnings are reviewed);
5. Main merge/deployment are explicitly reviewed against these gates.

No production SQL writes, changes to Neon Auth, function deployments, protected-branch merges, or Cloud Shell commands were performed by the assistant in this inspection.
