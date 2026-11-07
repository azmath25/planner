// M7.2a: owner-scoped day/week/month report from exact time segments.
// Unattributable pre-segment time is labeled historical estimate, not exact.
// This query is staged only and must be verified on disposable PostgreSQL.
export const TIME_PERIOD_REPORT_SQL=`
WITH RECURSIVE
clock AS (
 SELECT COALESCE((SELECT time_zone FROM dayframe.notification_preferences
  WHERE owner_user_id=$1),'UTC') AS zone,
  $2::text AS period, $3::date AS anchor,clock_timestamp() AS instant
),
local_bounds AS (
 SELECT zone,period,instant,
  CASE
   WHEN period='day' THEN anchor
   WHEN period='week' THEN anchor-(EXTRACT(ISODOW FROM anchor)::integer-1)
   ELSE date_trunc('month',anchor)::date
  END AS start_day,
  CASE
   WHEN period='day' THEN anchor+1
   WHEN period='week' THEN anchor-(EXTRACT(ISODOW FROM anchor)::integer-1)+7
   ELSE (date_trunc('month',anchor)+interval '1 month')::date
  END AS end_day
 FROM clock
),
bounds AS (
 SELECT zone,period,instant,start_day,end_day,
  (start_day::timestamp AT TIME ZONE zone) AS starts_at,
  (end_day::timestamp AT TIME ZONE zone) AS ends_at
 FROM local_bounds
),
finished_spans AS (
 SELECT s.task_id,s.workspace_id_snapshot AS workspace_id,g.started_at,g.ended_at
 FROM dayframe.time_session_segments g
 JOIN dayframe.time_sessions s ON s.id=g.session_id AND s.owner_user_id=$1
),
running_spans AS (
 SELECT s.task_id,s.workspace_id_snapshot AS workspace_id,
  s.segment_started_at AS started_at,b.instant AS ended_at
 FROM dayframe.time_sessions s CROSS JOIN bounds b
 WHERE s.owner_user_id=$1 AND s.state='running' AND s.segment_started_at IS NOT NULL
),
spans AS (
 SELECT * FROM finished_spans UNION ALL SELECT * FROM running_spans
),
portions AS (
 SELECT s.task_id,s.workspace_id,
  GREATEST(0,
   FLOOR(EXTRACT(EPOCH FROM (LEAST(s.ended_at,b.ends_at)-s.started_at))*1000)::bigint
   -FLOOR(EXTRACT(EPOCH FROM (GREATEST(s.started_at,b.starts_at)-s.started_at))*1000)::bigint
  ) AS ms
 FROM spans s CROSS JOIN bounds b
 WHERE s.started_at<b.ends_at AND s.ended_at>b.starts_at
),
recorded_workspace AS (
 SELECT workspace_id,SUM(ms)::bigint AS ms FROM portions GROUP BY workspace_id
),
recorded_task AS (
 SELECT task_id,SUM(ms)::bigint AS ms FROM portions
 WHERE task_id IS NOT NULL GROUP BY task_id
),
residual AS (
 SELECT s.workspace_id_snapshot AS workspace_id,
  GREATEST(0,s.accumulated_ms-COALESCE(g.total_ms,0))::bigint AS ms
 FROM dayframe.time_sessions s
 LEFT JOIN (
  SELECT session_id,SUM(duration_ms)::bigint AS total_ms
  FROM dayframe.time_session_segments GROUP BY session_id
 ) g ON g.session_id=s.id
 CROSS JOIN bounds b
 WHERE s.owner_user_id=$1 AND s.started_at>=b.starts_at AND s.started_at<b.ends_at
),
legacy_workspace AS (
 SELECT workspace_id,SUM(ms)::bigint AS ms
 FROM residual GROUP BY workspace_id
),
planned_task AS (
 SELECT i.task_id,SUM(i.end_minute-i.start_minute)::bigint AS minutes
 FROM dayframe.scheduled_intervals i
 CROSS JOIN bounds b
 WHERE i.owner_user_id=$1 AND i.plan_day>=b.start_day AND i.plan_day<b.end_day
 GROUP BY i.task_id
),
planned_workspace AS (
 SELECT t.workspace_id,SUM(p.minutes)::bigint AS minutes
 FROM planned_task p JOIN dayframe.tasks t ON t.id=p.task_id AND t.owner_user_id=$1
 GROUP BY t.workspace_id
),
workspace_keys AS (
 SELECT id AS workspace_id FROM dayframe.workspaces WHERE owner_user_id=$1
 UNION SELECT workspace_id FROM recorded_workspace
 UNION SELECT workspace_id FROM legacy_workspace
 UNION SELECT workspace_id FROM planned_workspace
),
workspace_rows AS (
 SELECT k.workspace_id,w.name,w.archived_at IS NOT NULL AS archived,
  COALESCE(r.ms,0)::bigint AS recorded_ms,
  COALESCE(l.ms,0)::bigint AS legacy_ms,
  COALESCE(p.minutes,0)::bigint AS planned_minutes
 FROM workspace_keys k
 LEFT JOIN dayframe.workspaces w ON w.id=k.workspace_id AND w.owner_user_id=$1
 LEFT JOIN recorded_workspace r ON r.workspace_id=k.workspace_id
 LEFT JOIN legacy_workspace l ON l.workspace_id=k.workspace_id
 LEFT JOIN planned_workspace p ON p.workspace_id=k.workspace_id
),
ancestry AS (
 SELECT t.id AS leaf,t.id AS ancestor,ARRAY[t.id] AS path
 FROM dayframe.tasks t WHERE t.owner_user_id=$1
 UNION ALL
 SELECT a.leaf,parent.id,a.path||parent.id
 FROM ancestry a
 JOIN dayframe.tasks child ON child.id=a.ancestor AND child.owner_user_id=$1
 JOIN dayframe.tasks parent ON parent.id=child.parent_id AND parent.owner_user_id=$1
 WHERE NOT parent.id=ANY(a.path)
),
longterm_recorded AS (
 SELECT a.ancestor AS task_id,SUM(r.ms)::bigint AS ms
 FROM ancestry a JOIN recorded_task r ON r.task_id=a.leaf
 GROUP BY a.ancestor
),
longterm_planned AS (
 SELECT a.ancestor AS task_id,SUM(p.minutes)::bigint AS minutes
 FROM ancestry a JOIN planned_task p ON p.task_id=a.leaf
 GROUP BY a.ancestor
),
longterm_rows AS (
 SELECT t.id,t.title,t.workspace_id,t.status,
  COALESCE(r.ms,0)::bigint AS recorded_ms,
  COALESCE(p.minutes,0)::bigint AS planned_minutes
 FROM dayframe.tasks t
 LEFT JOIN longterm_recorded r ON r.task_id=t.id
 LEFT JOIN longterm_planned p ON p.task_id=t.id
 WHERE t.owner_user_id=$1 AND t.long_term IS TRUE AND t.deleted_at IS NULL
)
SELECT b.zone AS "timeZone",b.period AS period,
 to_char(b.start_day,'YYYY-MM-DD') AS "startDay",
 to_char(b.end_day,'YYYY-MM-DD') AS "endDayExclusive",
 COALESCE((SELECT SUM(recorded_ms) FROM workspace_rows),0)::text AS "accountRecordedMs",
 COALESCE((SELECT SUM(legacy_ms) FROM workspace_rows),0)::text AS "accountLegacyEstimatedMs",
 COALESCE((SELECT SUM(planned_minutes) FROM workspace_rows),0)::text AS "accountPlannedMinutes",
 EXISTS(SELECT 1 FROM running_spans r WHERE r.started_at<b.ends_at
   AND r.ended_at>b.starts_at) AS "runningIncluded",
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'workspaceId',w.workspace_id::text,'name',w.name,'archived',w.archived,
   'recordedMs',w.recorded_ms::text,
   'legacyEstimatedMs',w.legacy_ms::text,
   'plannedMinutes',w.planned_minutes::text
  ) ORDER BY w.name NULLS LAST,w.workspace_id::text) FROM workspace_rows w),'[]'::jsonb) AS workspaces,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'taskId',t.id::text,'title',t.title,'workspaceId',t.workspace_id::text,
   'status',t.status,'recordedMs',t.recorded_ms::text,
   'plannedMinutes',t.planned_minutes::text
  ) ORDER BY t.title,t.id::text) FROM longterm_rows t),'[]'::jsonb) AS "longTermTasks"
FROM bounds b
`;
