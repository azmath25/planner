-- M5.1: authoritative time sessions, no migration of browser-demo timers.
-- Start and all transitions use PostgreSQL server time. One open session
-- (running OR paused) per owner is enforced by a partial unique index.
CREATE TABLE IF NOT EXISTS dayframe.time_sessions (
 id uuid PRIMARY KEY,
 owner_user_id text NOT NULL CHECK(length(owner_user_id) BETWEEN 1 AND 256),
 task_id uuid,
 task_title_snapshot text NOT NULL CHECK(length(task_title_snapshot) BETWEEN 1 AND 160),
 workspace_id_snapshot uuid NOT NULL,
 started_at timestamptz NOT NULL,
 segment_started_at timestamptz,
 accumulated_ms bigint NOT NULL DEFAULT 0 CHECK(accumulated_ms >= 0),
 state text NOT NULL CHECK(state IN ('running','paused','stopped')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision >= 1),
 ended_at timestamptz,
 end_reason text CHECK(end_reason IN ('stopped','switched','task_closed','workspace_archived')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT time_sessions_task_owned FOREIGN KEY(task_id,owner_user_id)
  REFERENCES dayframe.tasks(id,owner_user_id) ON DELETE SET NULL (task_id),
 CONSTRAINT time_sessions_lifecycle_check CHECK(
  (state='running' AND segment_started_at IS NOT NULL AND ended_at IS NULL AND end_reason IS NULL)
  OR (state='paused' AND segment_started_at IS NULL AND ended_at IS NULL AND end_reason IS NULL)
  OR (state='stopped' AND segment_started_at IS NULL AND ended_at IS NOT NULL AND end_reason IS NOT NULL)
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS time_sessions_single_open_per_owner
 ON dayframe.time_sessions(owner_user_id) WHERE state IN ('running','paused');
CREATE INDEX IF NOT EXISTS time_sessions_owner_started
 ON dayframe.time_sessions(owner_user_id,started_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS time_sessions_owner_task
 ON dayframe.time_sessions(owner_user_id,task_id,started_at DESC);

CREATE OR REPLACE FUNCTION dayframe.time_session_snapshot(s dayframe.time_sessions)
RETURNS jsonb LANGUAGE sql VOLATILE AS $snapshot$
 SELECT jsonb_build_object(
  'id',s.id, 'taskId',s.task_id, 'taskTitle',s.task_title_snapshot,
  'workspaceIdAtStart',s.workspace_id_snapshot, 'state',s.state,
  'startedAt',s.started_at,'segmentStartedAt',s.segment_started_at,
  'accumulatedMs',s.accumulated_ms, 'revision',s.revision,
  'endedAt',s.ended_at,'endReason',s.end_reason,
  'serverNow',clock_timestamp()
 );
$snapshot$;

CREATE OR REPLACE FUNCTION dayframe.transition_time_session(
 p_owner text,p_action text,p_session uuid,p_task uuid DEFAULT NULL,
 p_revision integer DEFAULT NULL,p_previous uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $transition$
DECLARE
 previous dayframe.time_sessions%ROWTYPE;
 current_row dayframe.time_sessions%ROWTYPE;
 started_task record;
 t timestamptz;
 gained bigint;
BEGIN
 IF p_owner IS NULL OR length(p_owner) NOT BETWEEN 1 AND 256
   OR p_session IS NULL OR p_action NOT IN ('start','pause','resume','stop','switch')
   OR (p_action IN ('start','switch') AND p_task IS NULL)
   OR (p_action IN ('pause','resume','stop') AND p_task IS NOT NULL)
   OR (p_action IN ('pause','resume','stop','switch') AND (p_revision IS NULL OR p_revision < 1))
   OR (p_action='start' AND (p_revision IS DISTINCT FROM 0 OR p_previous IS NOT NULL))
   OR (p_action='switch' AND (p_previous IS NULL OR p_previous=p_session))
   OR (p_action IN ('pause','resume','stop') AND p_previous IS NOT NULL)
 THEN RAISE EXCEPTION 'Invalid time session transition' USING ERRCODE='23514'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('dayframe:time:'||p_owner, 5101));

 IF p_action IN ('start','switch') THEN
  -- Replay with the same new UUID is safe, even after a lost HTTP response.
  SELECT * INTO current_row FROM dayframe.time_sessions WHERE id=p_session;
  IF FOUND THEN
   IF current_row.owner_user_id<>p_owner OR current_row.task_id IS DISTINCT FROM p_task THEN
    RAISE EXCEPTION 'Time session ID collision' USING ERRCODE='40001'; END IF;
   RETURN dayframe.time_session_snapshot(current_row);
  END IF;

  -- Root task lock prevents a parallel task completion/archive from accepting
  -- a new running session for a now-closed task.
  SELECT t.title,t.workspace_id INTO started_task
   FROM dayframe.tasks t
   JOIN dayframe.workspaces w ON w.id=t.workspace_id AND w.owner_user_id=p_owner
   WHERE t.id=p_task AND t.owner_user_id=p_owner AND t.status='open'
     AND t.deleted_at IS NULL AND t.archived_at IS NULL
     AND w.deleted_at IS NULL AND w.archived_at IS NULL
   FOR SHARE OF t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Time session task unavailable' USING ERRCODE='40001'; END IF;

  IF p_action='switch' THEN
   SELECT * INTO previous FROM dayframe.time_sessions
    WHERE id=p_previous AND owner_user_id=p_owner FOR UPDATE;
   IF NOT FOUND OR previous.state NOT IN ('running','paused') OR previous.revision<>p_revision
   THEN RAISE EXCEPTION 'Time session changed' USING ERRCODE='40001'; END IF;
   t:=clock_timestamp();
   gained:=CASE WHEN previous.state='running'
     THEN GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (t-previous.segment_started_at))*1000)::bigint)
     ELSE 0 END;
   UPDATE dayframe.time_sessions SET accumulated_ms=accumulated_ms+gained,
    segment_started_at=NULL,state='stopped',ended_at=t,end_reason='switched',
    revision=revision+1,updated_at=t WHERE id=p_previous;
  ELSE
   IF EXISTS(SELECT 1 FROM dayframe.time_sessions
      WHERE owner_user_id=p_owner AND state IN ('running','paused')) THEN
    RAISE EXCEPTION 'Another time session is already open' USING ERRCODE='40001'; END IF;
  END IF;
  t:=clock_timestamp();
  INSERT INTO dayframe.time_sessions
    (id,owner_user_id,task_id,task_title_snapshot,workspace_id_snapshot,
     started_at,segment_started_at,state,revision)
  VALUES(p_session,p_owner,p_task,started_task.title,started_task.workspace_id,
   t,t,'running',1)
  RETURNING * INTO current_row;
  RETURN dayframe.time_session_snapshot(current_row);
 END IF;

 SELECT * INTO previous FROM dayframe.time_sessions
   WHERE id=p_session AND owner_user_id=p_owner FOR UPDATE;
 IF NOT FOUND OR previous.state='stopped' OR previous.revision<>p_revision
 THEN RAISE EXCEPTION 'Time session changed' USING ERRCODE='40001'; END IF;
 IF p_action='pause' AND previous.state<>'running'
 THEN RAISE EXCEPTION 'Time session already paused' USING ERRCODE='40001'; END IF;
 IF p_action='resume' AND previous.state<>'paused'
 THEN RAISE EXCEPTION 'Time session not paused' USING ERRCODE='40001'; END IF;

 IF p_action='resume' THEN
  PERFORM 1 FROM dayframe.tasks t
   JOIN dayframe.workspaces w ON w.id=t.workspace_id AND w.owner_user_id=p_owner
   WHERE t.id=previous.task_id AND t.owner_user_id=p_owner AND t.status='open'
     AND t.deleted_at IS NULL AND t.archived_at IS NULL
     AND w.deleted_at IS NULL AND w.archived_at IS NULL FOR SHARE OF t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Time session task unavailable' USING ERRCODE='40001'; END IF;
 END IF;

 t:=clock_timestamp();
 gained:=CASE WHEN previous.state='running'
    THEN GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (t-previous.segment_started_at))*1000)::bigint)
    ELSE 0 END;

 IF p_action='pause' THEN
  UPDATE dayframe.time_sessions
   SET accumulated_ms=accumulated_ms+gained,segment_started_at=NULL,
    state='paused',revision=revision+1,updated_at=t
   WHERE id=p_session RETURNING * INTO current_row;
 ELSIF p_action='resume' THEN
  UPDATE dayframe.time_sessions
   SET segment_started_at=t,state='running',revision=revision+1,updated_at=t
   WHERE id=p_session RETURNING * INTO current_row;
 ELSIF p_action='stop' THEN
  UPDATE dayframe.time_sessions
   SET accumulated_ms=accumulated_ms+gained,segment_started_at=NULL,
    state='stopped',ended_at=t,end_reason='stopped',revision=revision+1,updated_at=t
   WHERE id=p_session RETURNING * INTO current_row;
 END IF;
 RETURN dayframe.time_session_snapshot(current_row);
END $transition$;

-- Task closure, Trash and archive never leave a running stopwatch behind.
-- Keep the recorded history even after a task is permanently removed.
CREATE OR REPLACE FUNCTION dayframe.close_sessions_for_task()
RETURNS trigger LANGUAGE plpgsql AS $close_task$
DECLARE t timestamptz;
BEGIN
 IF TG_OP='DELETE' OR (
   (NEW.status<>'open' OR NEW.deleted_at IS NOT NULL OR NEW.archived_at IS NOT NULL)
   AND (OLD.status='open' AND OLD.deleted_at IS NULL AND OLD.archived_at IS NULL)
 ) THEN
  t:=clock_timestamp();
  UPDATE dayframe.time_sessions s SET
   accumulated_ms=s.accumulated_ms+CASE WHEN s.state='running'
    THEN GREATEST(0,FLOOR(EXTRACT(EPOCH FROM(t-s.segment_started_at))*1000)::bigint)
    ELSE 0 END,
   state='stopped',segment_started_at=NULL,ended_at=t,
   end_reason='task_closed',revision=s.revision+1,updated_at=t
  WHERE s.owner_user_id=OLD.owner_user_id AND s.task_id=OLD.id
   AND s.state IN ('running','paused');
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $close_task$;
CREATE OR REPLACE TRIGGER stop_session_on_task_close
 BEFORE UPDATE OF status,archived_at,deleted_at OR DELETE ON dayframe.tasks
 FOR EACH ROW EXECUTE FUNCTION dayframe.close_sessions_for_task();

CREATE OR REPLACE FUNCTION dayframe.close_sessions_for_workspace()
RETURNS trigger LANGUAGE plpgsql AS $close_workspace$
DECLARE t timestamptz;
BEGIN
 IF (NEW.archived_at IS NOT NULL OR NEW.deleted_at IS NOT NULL)
  AND OLD.archived_at IS NULL AND OLD.deleted_at IS NULL THEN
  t:=clock_timestamp();
  UPDATE dayframe.time_sessions s SET
   accumulated_ms=s.accumulated_ms+CASE WHEN s.state='running'
    THEN GREATEST(0,FLOOR(EXTRACT(EPOCH FROM(t-s.segment_started_at))*1000)::bigint)
    ELSE 0 END,
   state='stopped',segment_started_at=NULL,ended_at=t,
   end_reason='workspace_archived',revision=s.revision+1,updated_at=t
  WHERE s.owner_user_id=NEW.owner_user_id
   AND s.task_id IN (SELECT id FROM dayframe.tasks WHERE owner_user_id=NEW.owner_user_id AND workspace_id=NEW.id)
   AND s.state IN ('running','paused');
 END IF;
 RETURN NEW;
END $close_workspace$;
CREATE OR REPLACE TRIGGER stop_session_on_workspace_close
 BEFORE UPDATE OF archived_at,deleted_at ON dayframe.workspaces
 FOR EACH ROW EXECUTE FUNCTION dayframe.close_sessions_for_workspace();

INSERT INTO dayframe.schema_migrations(version)
VALUES('0011_time_sessions') ON CONFLICT(version) DO NOTHING;
