-- M7.1 workspace shortcuts: owner-controlled pin for Home.
-- Additive only; do not apply to production before release approval.
ALTER TABLE dayframe.workspaces
 ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS dayframe_workspaces_pinned_home
 ON dayframe.workspaces(owner_user_id,updated_at DESC,id)
 WHERE pinned IS TRUE AND deleted_at IS NULL AND archived_at IS NULL;

INSERT INTO dayframe.schema_migrations(version)
 VALUES('0017_workspace_pins') ON CONFLICT(version) DO NOTHING;
