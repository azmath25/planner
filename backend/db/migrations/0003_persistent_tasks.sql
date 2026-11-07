-- M2.3: server-owned workspaces and tasks. Run only on Dayframe project soft-night-61558675.
-- Backwards-compatible addition; existing General workspaces remain intact.
ALTER TABLE dayframe.workspaces
  ADD COLUMN IF NOT EXISTS subtitle text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#85a99d',
  ADD COLUMN IF NOT EXISTS cover text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_owner_pair ON dayframe.workspaces(id,owner_user_id);
-- General must be immutable and can never be archived through any SQL writer.
CREATE OR REPLACE FUNCTION dayframe.prevent_general_workspace_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.kind='general' THEN RAISE EXCEPTION 'The General workspace cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.kind='general' THEN
    IF NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.id IS DISTINCT FROM OLD.id
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    THEN RAISE EXCEPTION 'The General workspace is permanent'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TABLE IF NOT EXISTS dayframe.tasks (
  id uuid PRIMARY KEY,
  owner_user_id text NOT NULL CHECK (length(owner_user_id) BETWEEN 1 AND 256),
  workspace_id uuid NOT NULL,
  parent_id uuid,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  estimate_minutes integer NOT NULL DEFAULT 30 CHECK (estimate_minutes BETWEEN 1 AND 100000),
  long_term boolean NOT NULL DEFAULT false,
  deadline date,
  deadline_time time,
  reminder date,
  reminder_time time,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (deadline_time IS NULL OR deadline IS NOT NULL),
  CHECK (reminder_time IS NULL OR reminder IS NOT NULL),
  CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT tasks_workspace_owned FOREIGN KEY(workspace_id,owner_user_id)
    REFERENCES dayframe.workspaces(id,owner_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS tasks_id_owner_workspace ON dayframe.tasks(id,owner_user_id,workspace_id);
DO $
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_parent_same_owner_workspace'
                AND conrelid='dayframe.tasks'::regclass) THEN
  ALTER TABLE dayframe.tasks ADD CONSTRAINT tasks_parent_same_owner_workspace
  FOREIGN KEY(parent_id,owner_user_id,workspace_id)
  REFERENCES dayframe.tasks(id,owner_user_id,workspace_id);
 END IF;
END $;
CREATE INDEX IF NOT EXISTS tasks_by_owner ON dayframe.tasks(owner_user_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS tasks_live_workspace ON dayframe.tasks(owner_user_id,workspace_id,created_at DESC) WHERE deleted_at IS NULL;
INSERT INTO dayframe.schema_migrations(version) VALUES('0003_persistent_tasks')
ON CONFLICT(version) DO NOTHING;
