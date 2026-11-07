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

## Tests and deployment
- Neon migration ledger and SQL constraints inspected after idempotent application.
- Backend unit tests include owner scoping, revision conflicts, General protection and archive query filtering.
- React source tests include archive/restore UI controls; build and timer CI verify unaffected screens.
- Deployment via existing branch-based GitHub Pages (main / root), plus Neon Function built by backend CI.
- Real authenticated end-to-end UI tests with two separate accounts remain a manual verification step; they must not be reported as passed until run.

Stop at this checkpoint before future milestones.
