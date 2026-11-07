-- Dayframe M6.2a: private workspace/task document hierarchy.
-- Additive and staged; do NOT run against live Neon before release approval.
CREATE TABLE IF NOT EXISTS dayframe.documents (
 id uuid PRIMARY KEY,
 owner_user_id text NOT NULL CHECK(length(owner_user_id) BETWEEN 1 AND 256),
 workspace_id uuid NOT NULL,
 task_id uuid,
 parent_id uuid,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
 blocks jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK(jsonb_typeof(blocks)='array' AND octet_length(blocks::text)<=262144),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
 deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT documents_owned_id UNIQUE(id,owner_user_id),
 CONSTRAINT documents_workspace_owned FOREIGN KEY(workspace_id,owner_user_id)
  REFERENCES dayframe.workspaces(id,owner_user_id),
 CONSTRAINT documents_task_owned FOREIGN KEY(task_id,owner_user_id)
  REFERENCES dayframe.tasks(id,owner_user_id) ON DELETE SET NULL(task_id),
 CONSTRAINT documents_parent_owned FOREIGN KEY(parent_id,owner_user_id)
  REFERENCES dayframe.documents(id,owner_user_id) ON DELETE SET NULL(parent_id),
 CONSTRAINT documents_no_self_parent CHECK(parent_id IS NULL OR parent_id<>id)
);
CREATE INDEX IF NOT EXISTS documents_owner_workspace
 ON dayframe.documents(owner_user_id,workspace_id,updated_at DESC,id)
 WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_owner_task
 ON dayframe.documents(owner_user_id,task_id,updated_at DESC,id)
 WHERE task_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_parent
 ON dayframe.documents(owner_user_id,parent_id,updated_at DESC,id)
 WHERE parent_id IS NOT NULL AND deleted_at IS NULL;

-- A trigger protects direct database writes as well as authenticated API
-- writes. Serialize structural changes within each owner to prevent two
-- concurrent parent moves from constructing a cycle.
CREATE OR REPLACE FUNCTION dayframe.guard_document_structure()
RETURNS trigger LANGUAGE plpgsql AS $documents_guard$
DECLARE v_task_workspace uuid; v_parent_workspace uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('dayframe:documents:'||NEW.owner_user_id,6022));
 PERFORM 1 FROM dayframe.workspaces w
 WHERE w.id=NEW.workspace_id AND w.owner_user_id=NEW.owner_user_id
  AND w.deleted_at IS NULL AND w.archived_at IS NULL FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Workspace unavailable' USING ERRCODE='23514';
 END IF;

 IF NEW.task_id IS NOT NULL THEN
  SELECT t.workspace_id INTO v_task_workspace FROM dayframe.tasks t
   WHERE t.id=NEW.task_id AND t.owner_user_id=NEW.owner_user_id
    AND t.deleted_at IS NULL AND t.archived_at IS NULL FOR SHARE;
  IF NOT FOUND OR v_task_workspace<>NEW.workspace_id THEN
   RAISE EXCEPTION 'Document task belongs to another workspace' USING ERRCODE='23514';
  END IF;
 END IF;

 IF NEW.parent_id IS NOT NULL THEN
  SELECT p.workspace_id INTO v_parent_workspace FROM dayframe.documents p
   WHERE p.id=NEW.parent_id AND p.owner_user_id=NEW.owner_user_id
    AND p.deleted_at IS NULL FOR SHARE;
  IF NOT FOUND OR v_parent_workspace<>NEW.workspace_id THEN
   RAISE EXCEPTION 'Document parent belongs to another workspace' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
   WITH RECURSIVE ancestors AS (
    SELECT d.id,d.parent_id,1 AS depth FROM dayframe.documents d
    WHERE d.id=NEW.parent_id AND d.owner_user_id=NEW.owner_user_id
    UNION ALL
    SELECT d.id,d.parent_id,a.depth+1 FROM dayframe.documents d
    JOIN ancestors a ON d.id=a.parent_id
    WHERE d.owner_user_id=NEW.owner_user_id AND a.depth<64
   )
   SELECT 1 FROM ancestors WHERE id=NEW.id OR depth>=64
  ) THEN RAISE EXCEPTION 'Document hierarchy cycle or depth limit' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $documents_guard$;

DROP TRIGGER IF EXISTS documents_structure_guard ON dayframe.documents;
CREATE TRIGGER documents_structure_guard
 BEFORE INSERT OR UPDATE OF workspace_id,task_id,parent_id
 ON dayframe.documents FOR EACH ROW
 EXECUTE FUNCTION dayframe.guard_document_structure();

INSERT INTO dayframe.schema_migrations(version)
 VALUES('0016_private_documents') ON CONFLICT(version) DO NOTHING;
