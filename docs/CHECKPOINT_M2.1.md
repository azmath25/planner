# Dayframe M2.1 checkpoint — dedicated Neon backend foundation

Date: 2026-11-07
Scope: M2.1 only. Do not begin M2.2 without approval.

## Infrastructure created

- Separate Neon project: dayframe (soft-night-61558675).
- Region: aws-eu-central-1. PostgreSQL 18.
- Database: dayframe; role: dayframe_owner; default branch: main.
- Compute setting: 0.25 CU minimum and maximum; Neon account rejected custom suspend timeout, so account default remains.
- Dayframe-only namespace and migration ledger created with idempotent SQL.
- Neon Function slug dayframeapi deployed using Node.js 24 to branch main. Neon reports deployment ID 1 completed.

## Security behavior

- GET /health returns non-sensitive service status only.
- /v1/* always returns 401 even if a fabricated bearer token is supplied.
- Browser CORS restricted to the configured GitHub Pages origin; CORS is not authorization.
- No task data endpoints, sign-in, tokens, user records, or cross-workspace permissions have been enabled.
- No database credentials stored in repository or browser frontend.

## Verification

- PASS: node --check backend/src/index.mjs.
- PASS: node --test backend/tests/*.test.mjs (4 tests).
- PASS: SQL migration applied twice with one ledger row (idempotent).
- PASS: PostgreSQL connection verified to database dayframe under role dayframe_owner.
- PASS: Neon get_function reports deployment status completed.
- LIMITATION: External HTTP smoke request could not resolve the Neon endpoint from the execution environment; network-level reachability remains unverified.
- GitHub CI workflow added to run syntax and security route tests on main.

## Remaining work

M2.2: Neon Auth, login/session integration, verified JWT or server-side session enforcement, and permanent General workspace bootstrap. Do not activate data routes without identity and ownership checks. No Android work, no Mimo or Quizer changes, no frontend publication changes.
