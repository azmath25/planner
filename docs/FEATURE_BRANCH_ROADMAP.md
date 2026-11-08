# Dayframe — consolidated feature-branch roadmap

**Approved strategy, 2026-11-07:** Continue beyond M5.3 with M6, M7, M8 and the remaining roadmap. Work **only** on `feature/dayframe-m53-release-20261107`. **Do not merge/push to `main`, deploy Neon migrations/functions, or publish compiled assets** until explicit final-release approval. GitHub Actions budget restriction is deferred to release readiness; it is not bypassed by moving branches.

## Working agreement

- Implement in **small, independently understandable code checkpoints** even when batching release verification. Keep a short implementation and open-risk log after each completed slice.
- During implementation, run only low-cost **local/static sanity checks** needed to avoid knowingly broken commits. No repeated remote CI, Cloud Shell build, live database mutations, or public release tests.
- Near release run one integrated verification covering `npm ci`, source/time/API/typecheck/build/dist checks, PostgreSQL on a **disposable audit database**, full Playwright responsive suite, account isolation, unauthenticated and authenticated API checks, Safari/two-device tests, accessibility and backup/export recovery. Repeat **once after fixes** where necessary; a third pass requires a newly identified blocker and agreement. Never claim an unrun test passed.
- **Budget:** GitHub Actions paid/private-repo runners currently blocked before any step; when ready, inspect GitHub account Billing & licensing → Budgets and alerts and Actions usage. Do not change limits or enable payments without the account owner's explicit approval. If Actions remains blocked, run the integration checks locally/Cloud Shell and deploy manually **only with release approval**.
- `main` remains production. No Neon schema changes to current live Dayframe before release; additive migration scripts may be authored in feature branch.

## Implementation queue

| Phase | Deliverable | Boundary |
|---|---|---|
| M5.3 acceptance closure | Diagnose remaining task estimates, weekly goal client/API, compilation and historical time precision. | Do not falsely mark current public frontend as M5.3: published assets still reflect M5.2. |
| **M6.1 Quick Notes** | Account-owned notes; create/edit/pin/organize, optional reminders, convert to task without losing note until conversion succeeds. | No implicit import of browser-local signed-in notes; no sample records in production. |
| **M6.2 Documents** | Task/workspace document library, document hierarchy, BlockNote editor, safe JSON schema and access control. | No public document/attachment links. |
| **M6.3 Persistence** | Debounced autosave, optimistic revisions/conflict UX, server-side search, export, safe file/media validation. | Export privacy and storage limits checked before release. |
| **M7.1 Home** | Real account-wide deadlines, reminders, running timer, daily plan, pinned workspaces/tasks. | No fake activity metrics for authenticated users. |
| **M7.2 Reports** | Day/week/month account, workspace and long-term-task reports; timezone-correct slices. | Historical data gaps explicitly labeled. |
| **M7.3 Insights** | Estimate accuracy, progress/trends, deadline history and CSV export. | Avoid double counts; source data reconciles. |
| **M8.1 Quality** | Responsive, keyboard/ARIA, Safari/mobile, performance and security/dependency review. | High/critical advisory gate remains unresolved until verified. |
| **M8.2 PWA** | Installability, offline semantics, update handling and notification behavior. | No false offline-save claim. |
| **M8.3 Release** | Disposable-db integration, backup/export and recovery, browser matrix, security checks; separate permission for deployment/merge. | One full suite; targeted rerun if needed. |
| **M9 Android (after website acceptance)** | Capacitor package, native notifications, store/privacy artifacts and Play release review. | Separate Google Play credentials, signing and publishing approval. |

Optional habits, AI, calendar integration, whiteboards and new infrastructure remain out of scope unless specifically approved.

## Checkpoints

Commit feature work to this branch only. Do not modify the production database while staging. Keep `docs/CHECKPOINT_M6.1.md`, etc., with what exists and **what has not been tested**. At the final release gate, reconcile branch head against `main`, check for intervening production changes and ask for authorization before any merge or deployment.

## Deployment platform decision — 2026-11-08

The owner specified **Vercel's free Hobby plan** for the **next Dayframe frontend deployment**, replacing the earlier GitHub Pages release path. This is a future deployment choice, **not** permission to publish now. Keep the existing Pages site and live Neon project untouched until a separate deployment approval.

- The Hobby tier is for personal, non-commercial use only. Confirm that Dayframe's eventual use qualifies before relying on it; if it becomes commercial, revisit the plan.
- Host only the static Vite-built frontend on Vercel; keep database, Managed Better Auth and protected APIs on Neon. Do not expose server connection strings, passwords, JWTs or Neon database credentials as Vite environment variables.
- Prefer a **dedicated staging Vercel project** or isolated preview with staging-only Auth/API targets. The production bundle must not accidentally call the staging backend, and a staging bundle must not accidentally call production.
- Configure the exact Vercel origin in **staging-only** Auth trusted origins and backend CORS after the preview URL is known. Do not relax production CORS to `*` or add disposable preview origins to the production database.
- Vercel's Git integration/builds do not require paid GitHub Actions. Do not silently enable automatic publishing from branch pushes before the staging security and release gates are approved.
- Current frontend contains a `/planner/` GitHub Pages base path; review Vite base, asset references, routing and PWA scope for a root-hosted Vercel deployment before publishing.
- First complete staging migration/Auth/API tests, cross-browser session verification, account isolation and security checks, then request explicit approval for any public production cutover.
