# Dayframe M2.3-W — Archive / Restore custom workspaces

Scope: M2.3-W only. GitHub repository azmath25/planner, main branch only.
Neon project: soft-night-61558675, main, dayframe. Other projects untouched.

## Changes
- `0004_workspace_archive.sql`: adds `archived_at`, partial query index and permanent General protection (both trigger and CHECK).
- Archived workspaces are preserved, not deleted. All their tasks remain in the same Neon rows and reappear upon restore.
- Authenticated `GET /v1/workspaces/archived`, `POST /v1/workspaces/:id/archive`, `POST /v1/workspaces/:id/restore` enforce the verified user ID, custom kind and optimistic revision.
- Active workspace and task lists exclude archived workspaces. Task creation, edits, deletion and Trash restoration do not operate on archived workspace tasks.
- Workspaces navigation has an archive confirmation, archived list and restore action with responsive mobile controls. General has no Archive action.
- Browser-local notes, day-pool records and timer history are preserved on archive; archived task references are not shown until restore. An active browser timer is stopped and saved on archive.
- No profile, hosting, auth, permanent deletion, attachments or new scheduler changes.

## Verification — passed
- Dedicated Neon DB migration `0004_workspace_archive` applied (ledger exactly one row); General CHECK constraint and archive index inspected.
- No existing workspace or task records were deleted or changed by the migration; archived count was zero when verified.
- Backend ownership, revision and General protection unit tests / bundled Node 24 function: [successful CI](https://github.com/azmath25/planner/actions/runs/42355112689).
- Active React application, TypeScript, source and timer checks: [successful CI](https://github.com/azmath25/planner/actions/runs/42355304499).
- Anonymous and forged credentials denied by deployed archive endpoints: [successful live security smoke](https://github.com/azmath25/planner/actions/runs/42355534299).
- Browser-level Playwright tests on 390px mobile and 1440px desktop, including General archive protection, archive confirmation, timer session preservation, hidden active tasks, restore and 320–1440px horizontal overflow: [successful smoke](https://github.com/azmath25/planner/actions/runs/42356165275). This uses simulated account data; no real user records were altered.
- Neon `dayframeapi` deployment 5 reports completed.
- GitHub Pages published successfully from `main` root: [successful branch deployment](https://github.com/azmath25/planner/actions/runs/42356165061).
- Only `main` exists; no separate `gh-pages` or feature branches.

## Remaining manual check
Two real authenticated accounts should still verify cross-account isolation, archive/restore of their own data and cross-device visibility. Browser simulation and mocked ownership tests are not substitutes for this real-user check.

Stop at this checkpoint before future milestones.
