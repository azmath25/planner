-- Dayframe M3 task lifecycle, hierarchy, audit history and compact private task media.
-- Applies ONLY to project soft-night-61558675 / dayframe.
ALTER TABLE dayframe.tasks
 ADD COLUMN IF NOT EXISTS archived_at timestamptz,
 ADD COLUMN IF NOT EXISTS completed_at timestamptz,
 ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
 ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE TABLE IF NOT EXISTS dayframe.task_events (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 owner_user_id text NOT NULL,
 task_id uuid NOT NULL,
 event_type text NOT NULL CHECK (event_type IN (
  'created','updated','completed','cancelled','reopened','archived',
  'unarchived','trashed','trash_restored','permanently_deleted','moved')),
 before_state jsonb,
 after_state jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_events_owner_task_time ON dayframe.task_events(owner_user_id,task_id,event_id DESC);
CREATE INDEX IF NOT EXISTS task_events_owner_recent ON dayframe.task_events(owner_user_id,event_id DESC);
CREATE INDEX IF NOT EXISTS tasks_active_owner_deadline ON dayframe.tasks(owner_user_id,deadline)
 WHERE deleted_at IS NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS tasks_owner_parent ON dayframe.tasks(owner_user_id,parent_id);
CREATE INDEX IF NOT EXISTS tasks_owner_archived ON dayframe.tasks(owner_user_id,archived_at)
 WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION dayframe.validate_task_hierarchy()
RETURNS trigger LANGUAGE plpgsql AS $task_guard$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR NEW.id IS DISTINCT FROM OLD.id
   THEN RAISE EXCEPTION 'Task ownership and identifier are immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.parent_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
  IF NEW.parent_id=NEW.id THEN RAISE EXCEPTION 'Cannot parent a task to itself' USING ERRCODE='23514'; END IF;
  IF EXISTS (
   WITH RECURSIVE ancestors AS (
    SELECT t.id,t.parent_id,ARRAY[t.id] AS path FROM dayframe.tasks t
    WHERE t.id=NEW.parent_id AND t.owner_user_id=NEW.owner_user_id
    UNION ALL
    SELECT p.id,p.parent_id,a.path||p.id FROM ancestors a
    JOIN dayframe.tasks p ON p.id=a.parent_id AND p.owner_user_id=NEW.owner_user_id
    WHERE NOT p.id=ANY(a.path)
   ) SELECT 1 FROM ancestors WHERE id=NEW.id
  ) THEN RAISE EXCEPTION 'A task cannot be its own ancestor' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status='done' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'done') THEN
  NEW.completed_at=now();NEW.cancelled_at=NULL;
 ELSIF NEW.status='cancelled' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'cancelled') THEN
  NEW.cancelled_at=now();NEW.completed_at=NULL;
 ELSIF NEW.status='open' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'open') THEN
  NEW.completed_at=NULL;NEW.cancelled_at=NULL;
 END IF;
 RETURN NEW;
END $task_guard$;
DROP TRIGGER IF EXISTS task_hierarchy_guard ON dayframe.tasks;
CREATE TRIGGER task_hierarchy_guard BEFORE INSERT OR UPDATE ON dayframe.tasks
 FOR EACH ROW EXECUTE FUNCTION dayframe.validate_task_hierarchy();

CREATE OR REPLACE FUNCTION dayframe.task_audit_event()
RETURNS trigger LANGUAGE plpgsql AS $task_audit$
DECLARE old_state jsonb;new_state jsonb;kind text;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  old_state=jsonb_build_object('status',OLD.status,'workspace',OLD.workspace_id,
   'parent',OLD.parent_id,'title',OLD.title,'priority',OLD.priority,
   'estimate',OLD.estimate_minutes,'deadline',OLD.deadline,'deadlineTime',OLD.deadline_time,
   'reminder',OLD.reminder,'reminderTime',OLD.reminder_time,'long',OLD.long_term,
   'pinned',OLD.pinned,'tags',OLD.tags,'archived',OLD.archived_at IS NOT NULL,
   'trashed',OLD.deleted_at IS NOT NULL);
 END IF;
 IF TG_OP <> 'DELETE' THEN
  new_state=jsonb_build_object('status',NEW.status,'workspace',NEW.workspace_id,
   'parent',NEW.parent_id,'title',NEW.title,'priority',NEW.priority,
   'estimate',NEW.estimate_minutes,'deadline',NEW.deadline,'deadlineTime',NEW.deadline_time,
   'reminder',NEW.reminder,'reminderTime',NEW.reminder_time,'long',NEW.long_term,
   'pinned',NEW.pinned,'tags',NEW.tags,'archived',NEW.archived_at IS NOT NULL,
   'trashed',NEW.deleted_at IS NOT NULL);
 END IF;
 IF TG_OP='INSERT' THEN kind='created';
 ELSIF TG_OP='DELETE' THEN kind='permanently_deleted';
 ELSIF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
  kind=CASE WHEN NEW.deleted_at IS NULL THEN 'trash_restored' ELSE 'trashed' END;
 ELSIF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
  kind=CASE WHEN NEW.archived_at IS NULL THEN 'unarchived' ELSE 'archived' END;
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  kind=CASE NEW.status WHEN 'done' THEN 'completed' WHEN 'cancelled' THEN 'cancelled' ELSE 'reopened' END;
 ELSIF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN kind='moved';
 ELSE kind='updated';
 END IF;
 IF TG_OP='UPDATE' AND old_state=new_state THEN RETURN NEW; END IF;
 INSERT INTO dayframe.task_events(owner_user_id,task_id,event_type,before_state,after_state)
 VALUES(CASE WHEN TG_OP='DELETE' THEN OLD.owner_user_id ELSE NEW.owner_user_id END,
  CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,kind,old_state,new_state);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $task_audit$;
DROP TRIGGER IF EXISTS task_audit ON dayframe.tasks;
CREATE TRIGGER task_audit AFTER INSERT OR UPDATE OR DELETE ON dayframe.tasks
 FOR EACH ROW EXECUTE FUNCTION dayframe.task_audit_event();

-- The composite parent FK must defer while a whole subtree changes workspace in one transaction.
ALTER TABLE dayframe.tasks ALTER CONSTRAINT tasks_parent_same_owner_workspace DEFERRABLE INITIALLY IMMEDIATE;

CREATE OR REPLACE FUNCTION dayframe.move_task_subtree(
 p_owner text,p_task uuid,p_workspace uuid,p_parent uuid,p_revision integer
) RETURNS void LANGUAGE plpgsql AS $move_task$
DECLARE old_workspace uuid;current_revision integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner,13817));
 SELECT t.workspace_id,t.revision INTO old_workspace,current_revision
 FROM dayframe.tasks t
 JOIN dayframe.workspaces w ON w.id=t.workspace_id AND w.owner_user_id=p_owner
 WHERE t.id=p_task AND t.owner_user_id=p_owner AND t.deleted_at IS NULL
 AND t.archived_at IS NULL AND w.deleted_at IS NULL AND w.archived_at IS NULL FOR UPDATE OF t;
 IF NOT FOUND OR current_revision<>p_revision THEN
  RAISE EXCEPTION 'Task moved or changed' USING ERRCODE='40001';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=p_workspace
 AND w.owner_user_id=p_owner AND w.deleted_at IS NULL AND w.archived_at IS NULL) THEN
  RAISE EXCEPTION 'Destination workspace unavailable' USING ERRCODE='23503';
 END IF;
 IF p_parent IS NOT NULL THEN
  IF p_parent=p_task OR NOT EXISTS(
   SELECT 1 FROM dayframe.tasks t WHERE t.id=p_parent AND t.owner_user_id=p_owner
   AND t.workspace_id=p_workspace AND t.deleted_at IS NULL AND t.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'Invalid new parent' USING ERRCODE='23503'; END IF;
  IF EXISTS(
   WITH RECURSIVE descendants AS (
    SELECT id,parent_id,ARRAY[id] AS path FROM dayframe.tasks
    WHERE id=p_task AND owner_user_id=p_owner
    UNION ALL
    SELECT child.id,child.parent_id,d.path||child.id
    FROM dayframe.tasks child JOIN descendants d ON child.parent_id=d.id
    WHERE child.owner_user_id=p_owner AND NOT child.id=ANY(d.path)
   ) SELECT 1 FROM descendants WHERE id=p_parent
  ) THEN RAISE EXCEPTION 'Cannot make a descendant the parent' USING ERRCODE='23514'; END IF;
 END IF;
 SET CONSTRAINTS tasks_parent_same_owner_workspace DEFERRED;
 WITH RECURSIVE descendants AS (
  SELECT id,ARRAY[id] AS path FROM dayframe.tasks WHERE id=p_task AND owner_user_id=p_owner
  UNION ALL
  SELECT child.id,d.path||child.id FROM dayframe.tasks child
  JOIN descendants d ON child.parent_id=d.id
  WHERE child.owner_user_id=p_owner AND NOT child.id=ANY(d.path)
 )
 UPDATE dayframe.tasks t SET
  workspace_id=p_workspace,
  parent_id=CASE WHEN t.id=p_task THEN p_parent ELSE t.parent_id END,
  revision=revision+1,updated_at=now()
 FROM descendants d WHERE t.id=d.id AND t.owner_user_id=p_owner;
 SET CONSTRAINTS tasks_parent_same_owner_workspace IMMEDIATE;
END $move_task$;

CREATE TABLE IF NOT EXISTS dayframe.task_media (
 task_id uuid NOT NULL,
 owner_user_id text NOT NULL,
 slot text NOT NULL CHECK (slot IN ('cover','avatar')),
 mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
 image_bytes bytea NOT NULL CHECK(octet_length(image_bytes) BETWEEN 16 AND 180000),
 focal_y smallint NOT NULL DEFAULT 50 CHECK(focal_y BETWEEN 0 AND 100),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(task_id,slot),
 CONSTRAINT task_media_owned FOREIGN KEY(task_id,owner_user_id) REFERENCES dayframe.tasks(id,owner_user_id)
);
CREATE INDEX IF NOT EXISTS task_media_owner ON dayframe.task_media(owner_user_id,task_id);

INSERT INTO dayframe.schema_migrations(version)
 VALUES('0005_task_management') ON CONFLICT(version) DO NOTHING;
