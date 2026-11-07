-- M8.1: protect pre-existing private document/task relationships during
-- cross-workspace task moves. Deliberately fail closed: transferring a
-- document hierarchy may also transfer unrelated child pages.
-- A later explicit document relocation flow can implement an atomic move
-- with clear user consent, but must not happen silently on task move.
CREATE OR REPLACE FUNCTION dayframe.guard_task_document_workspace()
RETURNS trigger LANGUAGE plpgsql AS $task_doc_move$
BEGIN
 IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id AND EXISTS(
  SELECT 1 FROM dayframe.documents d
  WHERE d.owner_user_id=OLD.owner_user_id AND d.task_id=OLD.id
   AND d.deleted_at IS NULL
 ) THEN
  RAISE EXCEPTION 'Move blocked by linked private documents'
   USING ERRCODE='DF001';
 END IF;
 RETURN NEW;
END $task_doc_move$;

DROP TRIGGER IF EXISTS task_document_workspace_guard ON dayframe.tasks;
CREATE TRIGGER task_document_workspace_guard
 BEFORE UPDATE OF workspace_id ON dayframe.tasks
 FOR EACH ROW EXECUTE FUNCTION dayframe.guard_task_document_workspace();

-- Restoring a soft-deleted document must revalidate its task/workspace and
-- parent relationship, rather than only checking owner and active workspace.
DROP TRIGGER IF EXISTS documents_structure_guard ON dayframe.documents;
CREATE TRIGGER documents_structure_guard
 BEFORE INSERT OR UPDATE OF workspace_id,task_id,parent_id,deleted_at
 ON dayframe.documents FOR EACH ROW
 EXECUTE FUNCTION dayframe.guard_document_structure();

INSERT INTO dayframe.schema_migrations(version)
 VALUES('0019_task_document_move_guard') ON CONFLICT(version) DO NOTHING;
