-- M6.1c: optional quiet hours for task and note Web Push.
-- No production migration execution until the explicit final release gate.
ALTER TABLE dayframe.notification_preferences
 ADD COLUMN IF NOT EXISTS quiet_start time,
 ADD COLUMN IF NOT EXISTS quiet_end time;
DO $constraints$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='dayframe.notification_preferences'::regclass
   AND conname='notification_quiet_hours_pair'
 ) THEN
  ALTER TABLE dayframe.notification_preferences ADD CONSTRAINT notification_quiet_hours_pair
  CHECK((quiet_start IS NULL AND quiet_end IS NULL) OR
        (quiet_start IS NOT NULL AND quiet_end IS NOT NULL AND quiet_start<>quiet_end));
 END IF;
END $constraints$;

-- Postpone an event only when its effective fire instant falls inside the
-- account's quiet window. Acknowledgements and reminder dates are unchanged.
-- A crossing-midnight range (22:00->07:00) ends the following local morning.
-- PostgreSQL determines timezone transitions; DST gaps/folds require audit tests.
CREATE OR REPLACE FUNCTION dayframe.defer_push_quiet_hours(
 p_fire timestamptz,p_zone text,p_start time,p_end time
) RETURNS timestamptz LANGUAGE plpgsql STABLE AS $quiet$
DECLARE v_local timestamp;v_time time;v_target timestamp;
BEGIN
 IF p_start IS NULL OR p_end IS NULL OR p_start=p_end THEN RETURN p_fire; END IF;
 v_local:=p_fire AT TIME ZONE p_zone;
 v_time:=v_local::time;
 IF p_start<p_end THEN
  IF v_time>=p_start AND v_time<p_end THEN
   v_target:=v_local::date + p_end;
  ELSE RETURN p_fire; END IF;
 ELSE
  IF v_time>=p_start THEN
   v_target:=(v_local::date+1)+p_end;
  ELSIF v_time<p_end THEN
   v_target:=v_local::date+p_end;
  ELSE RETURN p_fire; END IF;
 END IF;
 RETURN GREATEST(p_fire,v_target AT TIME ZONE p_zone);
END $quiet$;

-- Refresh the original task enqueue function without changing its outbox
-- uniqueness, acknowledgement or owner/endpoint rules.
CREATE OR REPLACE FUNCTION dayframe.enqueue_due_push(p_limit integer DEFAULT 250)
RETURNS integer LANGUAGE plpgsql AS $enqueue$
DECLARE inserted_count integer;
BEGIN
 IF p_limit<1 OR p_limit>1000 THEN RAISE EXCEPTION 'Invalid batch size' USING ERRCODE='23514'; END IF;
 WITH occurrences AS (
  SELECT t.owner_user_id,t.id AS task_id,k.kind,
   CASE WHEN k.kind='reminder' THEN t.reminder ELSE t.deadline END AS day,
   COALESCE(CASE WHEN k.kind='reminder' THEN t.reminder_time ELSE t.deadline_time END,'09:00'::time) AS clock,
   p.time_zone,p.quiet_start,p.quiet_end
  FROM dayframe.tasks t
  JOIN dayframe.workspaces w ON w.id=t.workspace_id AND w.owner_user_id=t.owner_user_id
  JOIN dayframe.notification_preferences p ON p.owner_user_id=t.owner_user_id
  CROSS JOIN (VALUES('reminder'),('deadline')) AS k(kind)
  WHERE t.status='open' AND t.deleted_at IS NULL AND t.archived_at IS NULL
   AND w.deleted_at IS NULL AND w.archived_at IS NULL
 ), due AS (
  SELECT o.owner_user_id,o.task_id,o.kind,o.day,o.clock,
   dayframe.defer_push_quiet_hours(COALESCE(a.snoozed_until,((o.day+o.clock) AT TIME ZONE o.time_zone)),o.time_zone,o.quiet_start,o.quiet_end) AS fire_at,
   s.endpoint
  FROM occurrences o
  JOIN dayframe.push_subscriptions s ON s.owner_user_id=o.owner_user_id
  LEFT JOIN dayframe.task_alert_actions a ON a.owner_user_id=o.owner_user_id
   AND a.task_id=o.task_id AND a.kind=o.kind AND a.source_day=o.day AND a.source_time=o.clock
  WHERE o.day IS NOT NULL AND a.acknowledged_at IS NULL
 ), eligible AS (
  SELECT * FROM due d WHERE fire_at<=now() AND fire_at>=now()-interval '7 days'
   AND NOT EXISTS (SELECT 1 FROM dayframe.notification_deliveries nd
    WHERE nd.owner_user_id=d.owner_user_id AND nd.task_id=d.task_id
     AND nd.kind=d.kind AND nd.source_day=d.day AND nd.source_time=d.clock
     AND nd.send_after=d.fire_at AND nd.endpoint=d.endpoint)
  ORDER BY fire_at LIMIT p_limit
 ), inserted AS (
  INSERT INTO dayframe.notification_deliveries
  (owner_user_id,task_id,kind,source_day,source_time,send_after,endpoint)
  SELECT owner_user_id,task_id,kind,day,clock,fire_at,endpoint FROM eligible
  ON CONFLICT DO NOTHING RETURNING id
 )
 SELECT count(*)::integer INTO inserted_count FROM inserted;
 RETURN inserted_count;
END $enqueue$;

-- New note reminders use the same quiet-window operation.
CREATE OR REPLACE FUNCTION dayframe.enqueue_due_note_push(p_limit integer DEFAULT 250)
RETURNS integer LANGUAGE plpgsql AS $enqueue_notes$
DECLARE inserted_count integer;
BEGIN
 IF p_limit<1 OR p_limit>1000 THEN RAISE EXCEPTION 'Invalid batch size' USING ERRCODE='23514'; END IF;
 WITH due AS (
  SELECT n.owner_user_id,n.id AS note_id,n.reminder AS day,
   COALESCE(n.reminder_time,'09:00'::time) AS clock,
   dayframe.defer_push_quiet_hours(COALESCE(a.snoozed_until,((n.reminder+COALESCE(n.reminder_time,'09:00'::time)) AT TIME ZONE p.time_zone)),p.time_zone,p.quiet_start,p.quiet_end) AS fire_at,
   s.endpoint
  FROM dayframe.quick_notes n
  JOIN dayframe.workspaces w ON w.id=n.workspace_id AND w.owner_user_id=n.owner_user_id
  JOIN dayframe.notification_preferences p ON p.owner_user_id=n.owner_user_id
  JOIN dayframe.push_subscriptions s ON s.owner_user_id=n.owner_user_id
  LEFT JOIN dayframe.note_alert_actions a ON a.owner_user_id=n.owner_user_id
   AND a.note_id=n.id AND a.source_day=n.reminder
   AND a.source_time=COALESCE(n.reminder_time,'09:00'::time)
  WHERE n.reminder IS NOT NULL AND n.deleted_at IS NULL
   AND w.deleted_at IS NULL AND w.archived_at IS NULL AND a.acknowledged_at IS NULL
 ), eligible AS (
  SELECT * FROM due d WHERE d.fire_at<=now() AND d.fire_at>=now()-interval '7 days'
  ORDER BY d.fire_at LIMIT p_limit
 ), inserted AS (
  INSERT INTO dayframe.note_notification_deliveries
   (owner_user_id,note_id,source_day,source_time,send_after,endpoint)
  SELECT owner_user_id,note_id,day,clock,fire_at,endpoint FROM eligible
  ON CONFLICT DO NOTHING RETURNING id
 )
 SELECT count(*)::integer INTO inserted_count FROM inserted;
 RETURN inserted_count;
END $enqueue_notes$;

INSERT INTO dayframe.schema_migrations(version)
 VALUES('0015_notification_quiet_hours') ON CONFLICT(version) DO NOTHING;
