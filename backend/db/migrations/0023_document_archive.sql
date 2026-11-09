-- M12 document archiving. Additive change for isolated Dayframe Neon database only.
-- Archived documents remain owned and preserved; they are distinct from trash.
ALTER TABLE dayframe.documents
 ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS documents_owner_archive
 ON dayframe.documents(owner_user_id,archived_at DESC,id DESC)
 WHERE archived_at IS NOT NULL AND deleted_at IS NULL;

-- Do not permit a new child under an archived parent. The application also
-- prevents archiving a parent while it has unarchived children.
CREATE OR REPLACE FUNCTION dayframe.guard_document_archive_parent()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.parent_id IS NOT NULL AND EXISTS(
   SELECT 1 FROM dayframe.documents parent
   WHERE parent.id=NEW.parent_id AND parent.owner_user_id=NEW.owner_user_id
   AND parent.archived_at IS NOT NULL
 ) THEN
  RAISE EXCEPTION 'Archived document cannot accept child pages' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS documents_archive_parent_guard ON dayframe.documents;
CREATE TRIGGER documents_archive_parent_guard
 BEFORE INSERT OR UPDATE OF parent_id ON dayframe.documents
 FOR EACH ROW EXECUTE FUNCTION dayframe.guard_document_archive_parent();

INSERT INTO dayframe.schema_migrations(version)
 VALUES('0023_document_archive') ON CONFLICT(version) DO NOTHING;
