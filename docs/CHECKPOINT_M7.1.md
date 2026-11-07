# M7.1 — Account Home and pinned shortcuts

**Branch:** `feature/dayframe-m53-release-20261107`  
**Status:** Source staged only; **not built, integration tested or deployed**. No GitHub Actions, Cloud Shell, production Neon or `main` modifications.

## Implemented source

1. Removed the three hard-coded signed-in Home activity values (demo "Today 2.4h / Week 16h / Month 64h"). Signed-in users now see **all-time saved focus time**, open task count and completed task count based on the already-loaded account timer rollup and task snapshot. If time rollups are absent or still loading, the focus metric displays "—" rather than a fabricated zero. Local demo sample figures are explicitly labeled as demo-only.
2. Home's "Today's plan" number now shows "—" while today's saved pool or schedule is still loading. It no longer presents an empty account plan as known while the asynchronous data is outstanding.
3. Added a "Pinned account shortcuts" Home region. Saved pinned open tasks use the already-loaded task snapshot; pinned workspaces use the already-loaded workspace snapshot. Neither source triggers an additional per-card query.
4. Migration `0017_workspace_pins.sql` stages an additive `dayframe.workspaces.pinned boolean NOT NULL DEFAULT false` and owner-scoped partial index. `WORKSPACE_FIELDS` propagates this field for existing list/create/update/archive/restore API paths.
5. `PUT /v1/workspaces/:id/pin` requires verified JWT owner, Boolean pin and current revision, rejecting missing/archived/stale workspaces safely. A stale pin cannot overwrite another device's revision. General and custom workspaces can both be pinned; the permanent General workspace is otherwise unchanged.
6. The typed frontend API and workspace page provide a pin/unpin action; Home shows those pinned workspaces alongside pinned tasks. The action does not insert sample data into accounts.
7. Staged (unexecuted) tests: `backend/tests/workspace-pins.test.mjs`, `tests/deep-postgres-regression.mjs` with migrations 0001–0017, and `tests/build-m71-harness.mjs` + `tests/m71-home-browser.py` for signed-in Home, pins, optimistic revision and responsive widths.

## Acceptance gaps and caveats

- **No runtime tests executed.** JavaScript source received limited V8 parsing only. TypeScript/Vite build, UI test harness, PostgreSQL migration, multi-device conflict and real signed-in browser behavior all require the one integrated release gate.
- Home's saved focus metric is explicitly **all-time**. Day/week/month period totals, timezone-correct slices and historical data quality labeling are M7.2, not simulated here.
- Deadline/reminder cards use the existing verified account task snapshot and protected reminder inbox; date-only "due soon" grouping still follows the browser-local planning clock. M7.2 should reconcile account timezone for period reporting.
- Full workspace pin data requires migration 0017 and updated backend deployed together. The unchanged production API has no `pinned` field. Never expose staged frontend against unmigrated production.
- The new private-document migration 0016 remains unexecuted; no live account data was read or modified.

**Next:** M7.2 actual day/week/month and workspace/long-term reports, followed by M7.3 Insights/CSV, M8 quality/PWA and the final disposable-database release gate. No merge/deploy until explicit approval.
