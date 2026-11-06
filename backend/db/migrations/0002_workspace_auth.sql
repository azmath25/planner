-- M2.2: per-account workspaces. The "General" workspace is permanently reserved.
-- Run only against Neon project soft-night-61558675, database dayframe.
CREATE SCHEMA IF NOT EXISTS dayframe;
CREATE TABLE IF NOT EXISTS dayframe.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text NOT NULL CHECK (length(owner_user_id) BETWEEN 1 AND 256),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK (kind IN ('general', 'custom')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT general_workspace_name CHECK (kind <> 'general' OR name = 'General')
);
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_one_general_per_user
  ON dayframe.workspaces (owner_user_id) WHERE kind = 'general';
CREATE INDEX IF NOT EXISTS workspaces_owner_created
  ON dayframe.workspaces (owner_user_id, created_at, id);

-- Even a future application query must not accidentally rename, reassign or delete General.
CREATE OR REPLACE FUNCTION dayframe.prevent_general_workspace_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.kind = 'general' THEN
      RAISE EXCEPTION 'The General workspace cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.kind = 'general' THEN
    IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
       OR NEW.name IS DISTINCT FROM OLD.name OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'The General workspace cannot be renamed, moved or converted';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER protect_general_workspace
  BEFORE UPDATE OR DELETE ON dayframe.workspaces
  FOR EACH ROW EXECUTE FUNCTION dayframe.prevent_general_workspace_changes();

INSERT INTO dayframe.schema_migrations(version) VALUES('0002_workspace_auth')
ON CONFLICT(version) DO NOTHING;
