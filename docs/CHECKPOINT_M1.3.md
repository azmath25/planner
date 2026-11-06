# Dayframe — M1.3 checkpoint: React + TypeScript foundation

Date: 2026-11-07

## Scope

- Move the static mobile prototype into a maintainable React 19 + TypeScript + Vite project.
- Preserve interactive M1.2 screens and browser-local sample data without introducing backend functionality.
- Keep GitHub Pages in **Deploy from branch → main → /(root)** mode, maintaining **one branch only**.

## Implementation

- `web/` is the Vite project root; `web/src/main.tsx` renders React with an error boundary.
- `web/src/components/App.tsx` owns the preview mount lifecycle and an optional Ctrl/⌘+K quick-capture keyboard action.
- `web/src/domain/models.ts` specifies typed interfaces for Workspace, Task, QuickNote, ScheduledInterval, ActiveTimer and DemoSnapshot.
- `web/src/domain/storage.ts` exposes safe local-demo-cache reading and capability checks.
- `web/src/legacy/legacy.ts` is an intentionally temporary adapter for the working M1.2 UI. Its document listeners and timer are disposed on React unmount; the existing localStorage key is unchanged. The legacy file uses `// @ts-nocheck` pending gradual screen migration; this milestone must not be described as a complete rewrite.
- `.github/workflows/build-branch-pages.yml` builds and commits compiled output to the same `main` branch; Pages remains configured as branch deployment. No deployment or development branches are created. Because GitHub does not trigger branch Pages from `GITHUB_TOKEN` commits, a follow-up GitHub App/human commit on `main` is required to activate the compiled site.

## Verification

- CI: npm install, TypeScript checking, Vite compilation and compiled-site assertions.
- Browser smoke: open live Pages at `/planner/`, test Home, Tasks, daily pool, timed interval, Quick Notes, themes, photo uploads, and task actions on mobile and desktop.
- Confirm single `main` branch; no changes to Neon, Mimo or Quizer.

## Limitations

The UI remains a local demo. No Neon Auth, persistent task records, server notifications, real reports, rich BlockNote editor, or cloud image storage yet. The screen internals are still legacy DOM code behind a React boundary; migration to typed React screens is incremental to avoid regression.

## Next checkpoint

Finish only M1.3, report CI and Pages results, and **stop before M2.1** pending user approval.
