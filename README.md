# Dayframe — mobile-first personal planner

**M1.3: React + TypeScript frontend foundation.** The mobile website is the first product; Android is deliberately later.

## Run locally

```bash
npm install
npm run dev
npm run typecheck
npm run test:source
npm run build
npm run check:dist
```

Vite serves `web/`. The application source lives in `web/src/` and a small typed domain layer is under `web/src/domain/`.

The existing M1.2 interactive UI is mounted by a **temporary compatibility adapter** (`web/src/legacy/legacy.ts`) under a React 19 root. This preserves task creation, hard deadlines and soft reminders, global Home, hybrid day planning, quick notes, six themes, and task/workspace cover and avatar previews. It is **not** a completed migration of all screen logic into React components. Follow-on milestones can move each screen and state into typed React incrementally.

### Preview safety

All tasks, images and reminders are still demo data stored only in this browser's localStorage using the unchanged key `dayframe.m1.design-demo.1`. No Neon, login, push service, or real persistent task tracking is connected. Do not rely on this prototype for actual reminders, critical deadlines, confidential content or recorded time.

## GitHub Pages, one branch

The repo retains exactly one branch: `main`. In **Settings → Pages**, use **Deploy from a branch → main → /(root)**. GitHub Actions runs `npm run build`, verifies assets and then commits Vite's built `index.html` and `assets/` to **main itself**. GitHub Pages does not automatically publish bot-authored commits; the milestone deployment is finalized by a separate human/app-authored `main` commit after CI verification. The Pages source never changes to GitHub Actions; no `gh-pages` branch is needed.

Published preview: https://azmath25.github.io/planner/

Do not manually edit generated root `index.html` or `assets/`. Edit `web/` instead. Generated assets are committed so the branch-based Pages source can serve them.

## Documentation

- [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) — long-term product requirements and milestones.
- [`docs/CHECKPOINT_M1.3.md`](docs/CHECKPOINT_M1.3.md) — implementation, verification, limitations and next step.
- Historic M1.1 and M1.2 checkpoints remain unchanged.

## Security

The frontend must never contain database connection strings, private API tokens, or cloud credentials. Quizer, Mimo and all Neon projects are independent and unchanged.
