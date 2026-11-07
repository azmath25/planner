-- M4.3 foundation: per-occurrence alert decisions. No delivery claim is made.
-- Soft reminders and hard deadlines remain independent task fields.
CREATE TABLE IF NOT EXISTS dayframe.task_alert_actions (
 owner_user_id text NOT NULL,
 task_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('reminder','deadline')),
 source_day date NOT NULL,
 source_time time NOT NULL,
 acknowledged_at timestamptz,
 snoozed_until timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_user_id,task_id,kind,source_day,source_time),
 FOREIGN KEY(task_id,owner_user_id) REFERENCES dayframe.tasks(id,owner_user_id) ON DELETE CASCADE,
 CHECK (acknowledged_at IS NULL OR snoozed_until IS NULL)
);
CREATE INDEX IF NOT EXISTS alert_actions_snoozed ON dayframe.task_alert_actions(owner_user_id,snoozed_until)
 WHERE snoozed_until IS NOT NULL;

-- Revision-checked update, guarded against foreign/trashed/completed tasks.
-- All occurrence state is keyed to the current task date+time: editing its due
-- date creates a fresh occurrence instead of inheriting an old dismissal.
CREATE OR REPLACE FUNCTION dayframe.update_task_alert(
 p_owner text,p_task uuid,p_kind text,p_day date,p_time time,
 p_revision integer,p_action text,p_until timestamptz
) RETURNS integer LANGUAGE plpgsql AS $alert_action$
DECLARE old_revision integer; result_revision integer;
BEGIN
 IF p_kind NOT IN ('reminder','deadline') OR p_action NOT IN ('acknowledge','snooze','reset')
 OR p_revision IS NULL OR p_revision<0
 OR (p_action='snooze' AND (p_until IS NULL OR p_until <= now() OR p_until > now()+interval '30 days'))
 OR (p_action<>'snooze' AND p_until IS NOT NULL) THEN
  RAISE EXCEPTION 'Invalid alert action' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dayframe:alert:'||p_owner||':'||p_task||':'||p_kind,6019));
 IF NOT EXISTS (
  SELECT 1 FROM dayframe.tasks t JOIN dayframe.workspaces w
   ON w.id=t.workspace_id AND w.owner_user_id=p_owner
  WHERE t.id=p_task AND t.owner_user_id=p_owner AND t.status='open'
   AND t.deleted_at IS NULL AND t.archived_at IS NULL
   AND w.deleted_at IS NULL AND w.archived_at IS NULL
   AND (CASE WHEN p_kind='reminder' THEN t.reminder ELSE t.deadline END)=p_day
   AND COALESCE((CASE WHEN p_kind='reminder' THEN t.reminder_time ELSE t.deadline_time END),'09:00'::time)=p_time
 ) THEN RAISE EXCEPTION 'Alert occurrence changed or unavailable' USING ERRCODE='40001'; END IF;
 SELECT revision INTO old_revision FROM dayframe.task_alert_actions
  WHERE owner_user_id=p_owner AND task_id=p_task AND kind=p_kind
   AND source_day=p_day AND source_time=p_time FOR UPDATE;
 IF NOT FOUND THEN
  IF p_revision<>0 THEN RAISE EXCEPTION 'Alert changed' USING ERRCODE='40001'; END IF;
  INSERT INTO dayframe.task_alert_actions(owner_user_id,task_id,kind,source_day,source_time,acknowledged_at,snoozed_until)
  VALUES(p_owner,p_task,p_kind,p_day,p_time,
   CASE WHEN p_action='acknowledge' THEN now() ELSE NULL END,
   CASE WHEN p_action='snooze' THEN p_until ELSE NULL END);
  RETURN 1;
 END IF;
 IF old_revision<>p_revision THEN RAISE EXCEPTION 'Alert changed' USING ERRCODE='40001'; END IF;
 UPDATE dayframe.task_alert_actions SET
  acknowledged_at=CASE WHEN p_action='acknowledge' THEN now() ELSE NULL END,
  snoozed_until=CASE WHEN p_action='snooze' THEN p_until ELSE NULL END,
  revision=revision+1,updated_at=now()
 WHERE owner_user_id=p_owner AND task_id=p_task AND kind=p_kind
  AND source_day=p_day AND source_time=p_time
 RETURNING revision INTO result_revision;
 RETURN result_revision;
END $alert_action$;

INSERT INTO dayframe.schema_migrations(version)
 VALUES('0009_reminder_actions') ON CONFLICT(version) DO NOTHING;
