-- Dayframe M6.1: owner-scoped Quick Notes. Staged on feature branch only.
-- No migration execution in production until the integrated release gate.
CREATE TABLE IF NOT EXISTS dayframe.quick_notes (
 id uuid PRIMARY KEY,
 owner_user_id text NOT NULL CHECK(length(owner_user_id) BETWEEN 1 AND 256),
 workspace_id uuid NOT NULL,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
 content text NOT NULL DEFAULT '' CHECK(length(content) <= 8000),
 color text NOT NULL DEFAULT 'cream'
   CHECK(color IN ('cream','lilac','green','blue')),
 pinned boolean NOT NULL DEFAULT false,
 reminder date,
 reminder_time time,
 converted_task_id uuid,
 converted_at timestamptz,
 deleted_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision >= 1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT quick_notes_reminder_time_requires_date
  CHECK(reminder_time IS NULL OR reminder IS NOT NULL),
 CONSTRAINT quick_notes_conversion_fields
  CHECK(converted_task_id IS NULL OR converted_at IS NOT NULL),
 CONSTRAINT quick_notes_workspace_owned
  FOREIGN KEY(workspace_id,owner_user_id)
  REFERENCES dayframe.workspaces(id,owner_user_id),
 CONSTRAINT quick_notes_converted_task_owned
  FOREIGN KEY(converted_task_id,owner_user_id)
  REFERENCES dayframe.tasks(id,owner_user_id)
  ON DELETE SET NULL(converted_task_id)
);
CREATE INDEX IF NOT EXISTS quick_notes_owner_workspace
 ON dayframe.quick_notes(owner_user_id,workspace_id,pinned DESC,updated_at DESC,id);
CREATE INDEX IF NOT EXISTS quick_notes_owner_reminder
 ON dayframe.quick_notes(owner_user_id,reminder,reminder_time)
 WHERE reminder IS NOT NULL;

-- Converting a note must not create two tasks after an uncertain network
-- response. The note is locked, insertion and status change are atomic,
-- and a retry with the same task UUID gets the existing result.
CREATE OR REPLACE FUNCTION dayframe.convert_quick_note(
 p_owner text,p_note uuid,p_revision integer,p_task uuid,p_estimate integer DEFAULT 30
) RETURNS uuid LANGUAGE plpgsql AS $convert_note$
DECLARE
 record_note dayframe.quick_notes%ROWTYPE;
 BEGIN
 IF p_owner IS NULL OR length(p_owner) NOT BETWEEN 1 AND 256
  OR p_note IS NULL OR p_task IS NULL OR p_revision IS NULL OR p_revision<1
  OR p_estimate IS NULL OR p_estimate NOT BETWEEN 1 AND 100000
 THEN
  RAISE EXCEPTION 'Invalid note conversion' USING ERRCODE='23514';
 END IF;
 SELECT * INTO record_note FROM dayframe.quick_notes
 WHERE owner_user_id=p_owner AND id=p_note FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Note unavailable' USING ERRCODE='40001';
 END IF;
 IF record_note.converted_at IS NOT NULL THEN
  IF record_note.converted_task_id=p_task THEN RETURN p_task; END IF;
  RAISE EXCEPTION 'Note was already converted' USING ERRCODE='40001';
 END IF;
 IF record_note.revision<>p_revision THEN
  RAISE EXCEPTION 'Note changed on another device' USING ERRCODE='40001';
 END IF;
 PERFORM 1 FROM dayframe.workspaces w
 WHERE w.id=record_note.workspace_id AND w.owner_user_id=p_owner
  AND w.deleted_at IS NULL AND w.archived_at IS NULL FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Workspace unavailable' USING ERRCODE='40001';
 END IF;
 INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title,notes,estimate_minutes)
 VALUES(p_task,p_owner,record_note.workspace_id,record_note.title,record_note.content,p_estimate);
 UPDATE dayframe.quick_notes
 SET converted_task_id=p_task,converted_at=now(),revision=revision+1,updated_at=now()
 WHERE id=p_note AND owner_user_id=p_owner;
 RETURN p_task;
END $convert_note$;

INSERT INTO dayframe.schema_migrations(version)
 VALUES('0013_quick_notes') ON CONFLICT(version) DO NOTHING;
