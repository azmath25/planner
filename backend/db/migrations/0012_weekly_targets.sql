-- M5.3: recurring per-workspace weekly targets and exact future week attribution.
-- Non-destructive. Existing sessions cannot be split accurately across weeks
-- from accumulated_ms alone; residual pre-migration time stays explicitly
-- classified as legacy attribution in weekly API responses.
CREATE TABLE IF NOT EXISTS dayframe.weekly_workspace_targets (
 owner_user_id text NOT NULL CHECK(length(owner_user_id) BETWEEN 1 AND 256),
 workspace_id uuid NOT NULL,
 target_minutes integer NOT NULL CHECK(target_minutes BETWEEN 0 AND 10080),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_user_id,workspace_id),
 CONSTRAINT weekly_targets_workspace_owned
 FOREIGN KEY(workspace_id,owner_user_id)
 REFERENCES dayframe.workspaces(id,owner_user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dayframe.time_session_segments (
 session_id uuid NOT NULL REFERENCES dayframe.time_sessions(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL,
 ended_at timestamptz NOT NULL,
 duration_ms bigint NOT NULL CHECK(duration_ms>=0),
 CONSTRAINT segment_after_start CHECK(ended_at>=started_at),
 PRIMARY KEY(session_id,started_at)
);
CREATE INDEX IF NOT EXISTS time_segments_start_end
 ON dayframe.time_session_segments(started_at,ended_at);

-- PostgreSQL owns both timestamps. Every future active span is recorded on
-- pause, stop, task completion, workspace archive or task switch; paused time
-- is never counted. The transition and insert share the same transaction.
CREATE OR REPLACE FUNCTION dayframe.record_time_session_segment()
RETURNS trigger LANGUAGE plpgsql AS $record_segment$
BEGIN
 IF OLD.state='running' AND NEW.state IN ('paused','stopped') THEN
  IF OLD.segment_started_at IS NULL OR NEW.updated_at<OLD.segment_started_at
    OR NEW.accumulated_ms<OLD.accumulated_ms THEN
   RAISE EXCEPTION 'Invalid time session segment transition' USING ERRCODE='23514';
  END IF;
  INSERT INTO dayframe.time_session_segments(session_id,started_at,ended_at,duration_ms)
  VALUES(OLD.id,OLD.segment_started_at,NEW.updated_at,NEW.accumulated_ms-OLD.accumulated_ms);
 END IF;
 RETURN NEW;
END $record_segment$;
CREATE OR REPLACE TRIGGER capture_time_session_segment
 AFTER UPDATE OF state ON dayframe.time_sessions
 FOR EACH ROW WHEN(OLD.state='running' AND NEW.state IN ('paused','stopped'))
 EXECUTE FUNCTION dayframe.record_time_session_segment();

INSERT INTO dayframe.schema_migrations(version)
VALUES ('0012_weekly_targets') ON CONFLICT(version) DO NOTHING;
