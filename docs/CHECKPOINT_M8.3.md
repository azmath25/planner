# Dayframe M8.3 — Release verification checkpoint

**Status:** validation tooling staged, but **the release gate has not passed and no release was made**.

## Tooling in the feature branch
- `scripts/m8-verify-local.sh` runs the full nondeploying gate in a trusted local environment: Node 24, lockfile-based npm ci, unit/domain/PWA/API tests, typecheck/build/dist checks, production dependency audit, disposable PostgreSQL 16 with all 20 migrations, and M1–M7 browser regressions.
- `.github/workflows/m8-release-gate.yml` is manual-only, read-only and never deploys. It separates frontend, PostgreSQL/backend, browser and production dependency checks.
- Two former auto-publishing workflows are now manual-only in this feature branch.
- `scripts/check-dist.mjs` additionally verifies PWA assets, manifest scope and icon existence.

## Release blockers
1. **No `package-lock.json`.** Package resolution requires trusted npm access, unavailable here. Do not manufacture a lockfile.
2. **No full test execution.** No installed app dependencies, disposable PostgreSQL or verified browser/device matrix here. A focused JS note-dispatch exercise passed; this is not a replacement.
3. **No runtime performance evidence** for document search and large-account Insights/rollups. Safari, ARIA, two-device conflicts, PWA install/update/offline and account-switch tests remain.
4. **No deployment approval**. Neither production database migrations, protected `main`, release bundles nor published Pages assets may be changed without explicit approval.

## Go/no-go
Generate and review the lockfile; run the local gate on an empty disposable database; fix failures, then rerun the final gate. Test Safari/mobile devices and rollback/export recovery. Confirm Neon scheduler gateway provenance and production deploy configuration. Review the feature-branch diff against current `main`, and obtain approval before merging or deploying.

**Conclusion:** M8 code and verification scaffolding are staged; M8.3 acceptance and production readiness are still blocked. GitHub Actions, Cloud Shell and production services were not used.
