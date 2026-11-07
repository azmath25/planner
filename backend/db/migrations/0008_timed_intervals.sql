-- M4.2: account-scoped, fixed local-clock intervals on independent plan dates.
-- One task may have intervals on many days. A block must finish after it starts;
-- spanning midnight requires two separate blocks, one on each date.
CREATE TABLE IF NOT EXISTS dayframe.scheduled_intervals (
 id uuid PRIMARY KEY,
 owner_user_id text NOT NULL,
 task_id uuid NOT NULL,
 plan_day date NOT NULL CHECK(plan_day BETWEEN '2000-01-01' AND '2100-12-31'),
 start_minute smallint NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
 end_minute smallint NOT NULL CHECK(end_minute BETWEEN 1 AND 1440),
 time_zone text NOT NULL CHECK(length(time_zone) BETWEEN 2 AND 64),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT scheduled_valid_duration CHECK(start_minute<end_minute),
 CONSTRAINT scheduled_task_owner FOREIGN KEY(task_id,owner_user_id)
   REFERENCES dayframe.tasks(id,owner_user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS scheduled_owner_day_start
 ON dayframe.scheduled_intervals(owner_user_id,plan_day,start_minute,id);
CREATE INDEX IF NOT EXISTS scheduled_owner_task
 ON dayframe.scheduled_intervals(owner_user_id,task_id,plan_day);

-- The trigger covers ALL writers, not just the HTTP function. A per-owner
-- transactional lock serializes concurrent writes across workers/dates.
CREATE OR REPLACE FUNCTION dayframe.validate_scheduled_interval()
RETURNS trigger LANGUAGE plpgsql AS $schedule_guard$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
    NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id) THEN
   RAISE EXCEPTION 'Schedule identity is immutable' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dayframe:schedule:'||NEW.owner_user_id,4242));
 IF NOT EXISTS(
  SELECT 1 FROM dayframe.tasks t
  JOIN dayframe.workspaces w ON w.id=t.workspace_id AND w.owner_user_id=NEW.owner_user_id
  WHERE t.id=NEW.task_id AND t.owner_user_id=NEW.owner_user_id
    AND t.status='open' AND t.deleted_at IS NULL AND t.archived_at IS NULL
    AND w.deleted_at IS NULL AND w.archived_at IS NULL
 ) THEN
  RAISE EXCEPTION 'Only an active owned task may be scheduled' USING ERRCODE='23503';
 END IF;
 IF EXISTS(
  SELECT 1 FROM dayframe.scheduled_intervals s
  WHERE s.owner_user_id=NEW.owner_user_id AND s.plan_day=NEW.plan_day
    AND s.id IS DISTINCT FROM NEW.id AND s.time_zone<>NEW.time_zone
 ) THEN
  RAISE EXCEPTION 'All blocks on one date must use the same time zone' USING ERRCODE='23514';
 END IF;
 IF EXISTS(
  SELECT 1 FROM dayframe.scheduled_intervals s
  WHERE s.owner_user_id=NEW.owner_user_id AND s.plan_day=NEW.plan_day
    AND s.id IS DISTINCT FROM NEW.id
    AND s.start_minute<NEW.end_minute AND NEW.start_minute<s.end_minute
 ) THEN
  RAISE EXCEPTION 'Time overlaps an existing interval on this date' USING ERRCODE='23P01';
 END IF;
 RETURN NEW;
END $schedule_guard$;
DROP TRIGGER IF EXISTS scheduled_interval_guard ON dayframe.scheduled_intervals;
CREATE TRIGGER scheduled_interval_guard
 BEFORE INSERT OR UPDATE ON dayframe.scheduled_intervals
 FOR EACH ROW EXECUTE FUNCTION dayframe.validate_scheduled_interval();

CREATE OR REPLACE FUNCTION dayframe.save_scheduled_interval(
 p_owner text,p_id uuid,p_task uuid,p_day date,p_start smallint,
 p_end smallint,p_zone text,p_revision integer
) RETURNS integer LANGUAGE plpgsql AS $schedule_save$
DECLARE old_revision integer; new_revision integer;
BEGIN
 IF p_owner IS NULL OR length(p_owner)=0 OR length(p_owner)>256
   OR p_id IS NULL OR p_task IS NULL OR p_day IS NULL
   OR p_day NOT BETWEEN '2000-01-01'::date AND '2100-12-31'::date
   OR p_start IS NULL OR p_end IS NULL OR p_start<0 OR p_end>1440
   OR p_start>=p_end OR p_zone IS NULL OR length(p_zone) NOT BETWEEN 2 AND 64
   OR p_revision IS NULL OR p_revision<0 THEN
  RAISE EXCEPTION 'Invalid timed interval' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dayframe:schedule:'||p_owner,4242));
 SELECT revision INTO old_revision FROM dayframe.scheduled_intervals
  WHERE id=p_id AND owner_user_id=p_owner FOR UPDATE;
 IF NOT FOUND THEN
  IF p_revision<>0 THEN RAISE EXCEPTION 'Interval missing or stale' USING ERRCODE='40001'; END IF;
  INSERT INTO dayframe.scheduled_intervals(id,owner_user_id,task_id,plan_day,start_minute,end_minute,time_zone)
   VALUES(p_id,p_owner,p_task,p_day,p_start,p_end,p_zone);
  RETURN 1;
 END IF;
 IF p_revision=0 THEN
  -- Uncertain create retry: return only if the original payload is identical.
  IF EXISTS(SELECT 1 FROM dayframe.scheduled_intervals s
    WHERE s.id=p_id AND s.owner_user_id=p_owner AND s.task_id=p_task
      AND s.plan_day=p_day AND s.start_minute=p_start AND s.end_minute=p_end
      AND s.time_zone=p_zone) THEN RETURN old_revision; END IF;
  RAISE EXCEPTION 'Idempotency key already used for another interval' USING ERRCODE='40001';
 END IF;
 IF old_revision<>p_revision THEN
  RAISE EXCEPTION 'Interval changed on another device' USING ERRCODE='40001';
 END IF;
 UPDATE dayframe.scheduled_intervals SET
  task_id=p_task,plan_day=p_day,start_minute=p_start,end_minute=p_end,
  time_zone=p_zone,revision=revision+1,updated_at=now()
  WHERE id=p_id AND owner_user_id=p_owner
  RETURNING revision INTO new_revision;
 RETURN new_revision;
END $schedule_save$;

INSERT INTO dayframe.schema_migrations(version)
 VALUES('0008_timed_intervals') ON CONFLICT(version) DO NOTHING;
