# Dayframe M2.2 — Managed Auth + protected General workspace

**Project:** `soft-night-61558675` · **Neon branch/database:** `main` / `dayframe` · **Repo branch:** `main`

## Implemented

- Enabled Managed Better Auth in the dedicated Dayframe Neon project; other projects untouched.
- Trusted production origin `https://azmath25.github.io`, as a scheme + origin (not a pathname).
- React sign-up/sign-in, session restoration, sign-out, and API-bootstrapped General workspace.
- Server verifies EdDSA JWT signature, issuer and expiry against Neon JWKS before database access.
- `GET /v1/me` creates General idempotently and returns the authenticated user's General workspace.
- `GET /v1/workspaces` lists only rows with `owner_user_id = verifiedJwt.sub`, never from a request parameter.
- PostgreSQL partial unique index guarantees at most one General per user; trigger rejects rename, reassign, conversion and deletion.
- Fail-closed errors, explicit errors/retry, restricted CORS, no cross-user query controls.
- Browser demo task and timer state namespaced to signed-in user; **not** synchronized to Neon. No actual task API yet.

## Verification

- Auth provisioned in Neon and origin registered. PostgreSQL migration applied idempotently.
- Backend unit tests: forged/missing bearer denial, CORS, spoofed owner, protected paths, outage, user-scoped SQL.
- **PASS:** GitHub backend authentication tests and function packaging ([run 42299665481](https://github.com/azmath25/planner/actions/runs/42299665481)).
- **PASS:** React TypeScript build and branch-based Pages publishing ([React run 42299858997](https://github.com/azmath25/planner/actions/runs/42299858997)); [latest Pages deployment 42300100417](https://github.com/azmath25/planner/actions/runs/42300100417)).
- **PASS:** Live Neon API smoke ([run 42300101306](https://github.com/azmath25/planner/actions/runs/42300101306)): `/health` responded with `stage: auth-workspaces`, anonymous and forged bearer tokens returned 401, approved CORS preflight returned 204, and untrusted origin returned 403.
- **PASS:** Neon Function `dayframeapi` deployment 2 reported completed, migration index and trigger verified. Synthetic same-user General creation returned exactly one row and test data was rolled back.
- **No automated end-to-end real email sign-up or login was run.** User must verify with their own credentials before trusting the flow for everyday use.
- No stored database passwords or user tokens in GitHub or frontend.

## Limitations and next milestone

No account-created tasks, reminders, notes, timers or photos are stored in Neon yet; those remain demonstrative browser-local screens. Auth shared SMTP is for development; production custom SMTP is still required. A signed-in account must never mistake demo data for synchronized data.

**STOP** before M2.3 task/workspace CRUD and permanent data migration. Do not create any additional Git branches.
