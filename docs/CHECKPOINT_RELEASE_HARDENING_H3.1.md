# Dayframe H3.1 — patched dependencies and lockfile gate

**Branch:** `feature/dayframe-m53-release-20261107`  
**Scope:** source-only dependency adoption and a guarded Cloud Shell verification script.  
**Status:** changes committed on feature branch; local lockfile generation and verification pending. No merge, push to main, Neon/GCP writes, GitHub Actions, or deployment.

## Evidence inherited from H2

On 2026-11-08 the user ran `scripts/h2-security-trial.sh` in an isolated Cloud Shell directory. The trial pinned `better-auth`, `@better-auth/drizzle-adapter`, and `@better-auth/oauth-provider` at 1.7.7, and `zod` at 4.6.6 through npm overrides. Its automated tests, TypeScript/Vite build, dist assertions, and `npm audit --omit=dev --audit-level=high` passed, with 7 low-severity transitive advisories still reported. The trial did not exercise real Neon Auth sign-in or session issuance.

## Implementation

1. Added **only those four exact overrides** to tracked `package.json`. They intentionally avoid `npm audit fix --force`, unreviewed major upgrades, and changing the `@neondatabase/auth@0.7.0-beta` direct dependency.
2. Added `scripts/h3-verify-security-lock.sh`. It checks the branch and Node 24+, ensures the overrides match the passing H2 trial, preserves any previous lockfile in a local temporary backup, regenerates the genuine lockfile through npm, checks root dependencies and patched versions throughout lockfile paths, reruns H2 source/domain/API/build/dist checks and the high/critical audit, and prints a concise PASS/failure tail. It does not commit, push, merge or deploy.
3. The existing generated `package-lock.json` remains *only on the user's Cloud Shell checkout*. No synthetic lockfile was added to GitHub.

## Reproducible next action (Cloud Shell)

```bash
cd ~/dayframe-h2
nvm use 24
git pull --ff-only origin feature/dayframe-m53-release-20261107
bash scripts/h3-verify-security-lock.sh
```

**Acceptance before H3.2:** the complete command must pass, the generated `package-lock.json` must be checked for consistent security versions and no high/critical advisories, and that real lockfile must be committed to the feature branch. If the test fails, fix the specific failure rather than weakening or skipping the security gate.

## H3.2 boundary

A green dependency graph **does not prove Neon Auth works**. Browser sign-in (including session retrieval, sign-out, protected API JWT validation, Safari behavior, and refresh across reload) needs an independently approved test setup with no exposure of credentials. Do not access production accounts or migrate production data to supply the test. No production release is authorized.

## H3.1 real Cloud Shell verification — passed on 2026-11-08

The operator pulled the H3.1 dependency override changes and ran `bash scripts/h3-verify-security-lock.sh` on Node 24.22.2/npm 11.19.1 in the existing feature checkout.

Evidence from the terminal:
- `npm install --package-lock-only --ignore-scripts` regenerated the actual local lockfile; script confirmed one lockfile entry each for `better-auth@1.7.7`, `@better-auth/drizzle-adapter@1.7.7`, `@better-auth/oauth-provider@1.7.7`, and `zod@4.6.6`.
- `scripts/h2-bootstrap-local.sh` reached its final PASS after tests, TypeScript, Vite build and PWA/distribution checks.
- `npm audit --omit=dev --audit-level=high` exited successfully: **seven low-severity transitive findings**, no reported high or critical.
- Log saved locally at `~/dayframe-h3-verify.S1SjsP2l.log` and previous lockfile backed up to `/tmp/dayframe-h3-lock-backup.k3681Z1R.json`. Do not rely on these transient locations outside that session.

**Caution:** `ERESOLVE overriding peer dependency` warnings persist. The installed tree includes `@better-auth/core@1.7.18` requiring `@better-fetch/fetch@1.3.3` and `better-call@1.4.5`, while Neon Auth depends on lower versions; the auth UI also has conflicting `better-call@2.0.2` and `@better-auth/api-key@1.7.18`. Passing test suites does **not** demonstrate compatibility of real login, token refresh, or browser sessions. Treat this as a separate H3.2 gate, not a harmless warning.

The tested `package-lock.json` **has not yet been committed** to the feature branch; it resides in the operator's local checkout. Publish only that generated lockfile after inspecting local git status. No prod Neon/GCP changes or deployment have been authorized.
