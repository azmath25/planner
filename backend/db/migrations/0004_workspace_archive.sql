-- M2.3-W: archive custom workspaces without deleting or changing their tasks.
ALTER TABLE dayframe.workspaces ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE OR REPLACE FUNCTION dayframe.prevent_general_workspace_changes()
RETURNS trigger LANGUAGE plpgsql AS $fn$
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
   OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
  THEN RAISE EXCEPTION 'The General workspace is permanent'; END IF;
 END IF;
 RETURN NEW;
END $fn$;
DO $check$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='workspaces_general_never_archived'
 AND conrelid='dayframe.workspaces'::regclass) THEN
  ALTER TABLE dayframe.workspaces
   ADD CONSTRAINT workspaces_general_never_archived CHECK (kind <> 'general' OR archived_at IS NULL);
 END IF;
END $check$;
CREATE INDEX IF NOT EXISTS workspaces_owner_archive ON dayframe.workspaces(owner_user_id,archived_at,created_at) WHERE deleted_at IS NULL;
INSERT INTO dayframe.schema_migrations(version) VALUES('0004_workspace_archive') ON CONFLICT (version) DO NOTHING;
