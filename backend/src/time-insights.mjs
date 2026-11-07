// M7.3 deadline history and estimate fidelity from owner task audit events.
// Completion events preserve deadline/estimate at the time of completion.
// Estimate comparison excludes records with legacy time lacking exact segments.
export const TIME_INSIGHTS_SQL=`
WITH
prefs AS (
 SELECT COALESCE((SELECT time_zone FROM dayframe.notification_preferences
   WHERE owner_user_id=$1),'UTC') AS zone,
  $2::text AS period, $3::date AS anchor,clock_timestamp() AS instant
),
local_bounds AS (
 SELECT zone,period,instant,
  CASE WHEN period='day' THEN anchor
       WHEN period='week' THEN anchor-(EXTRACT(ISODOW FROM anchor)::integer-1)
       ELSE date_trunc('month',anchor)::date END AS start_day,
  CASE WHEN period='day' THEN anchor+1
       WHEN period='week' THEN anchor-(EXTRACT(ISODOW FROM anchor)::integer-1)+7
       ELSE (date_trunc('month',anchor)+interval '1 month')::date END AS end_day
 FROM prefs
),
bounds AS (
 SELECT zone,period,instant,start_day,end_day,
 (start_day::timestamp AT TIME ZONE zone) AS start_at,
 (end_day::timestamp AT TIME ZONE zone) AS end_at
 FROM local_bounds
),
completed_events AS (
 SELECT e.event_id,e.task_id,e.created_at,
  e.after_state->>'title' AS title,
  e.after_state->>'deadline' AS deadline,
  e.after_state->>'deadlineTime' AS deadline_time,
  e.after_state->>'estimate' AS estimate
 FROM dayframe.task_events e CROSS JOIN bounds b
 WHERE e.owner_user_id=$1 AND e.event_type='completed'
  AND e.created_at>=b.start_at AND e.created_at<b.end_at
),
classified AS (
 SELECT e.*,
  CASE WHEN e.deadline IS NULL THEN NULL::timestamptz
   WHEN e.deadline_time IS NULL
    THEN ((e.deadline::date+1)::timestamp AT TIME ZONE b.zone)
   ELSE ((e.deadline::date+e.deadline_time::time) AT TIME ZONE b.zone)
  END AS due_at
 FROM completed_events e CROSS JOIN bounds b
),
deadline_summary AS (
 SELECT count(*)::integer AS completed_events,
  count(*) FILTER (WHERE due_at IS NOT NULL)::integer AS with_deadline,
  count(*) FILTER (WHERE due_at IS NULL)::integer AS without_deadline,
  count(*) FILTER (WHERE due_at IS NOT NULL AND
   (created_at<due_at OR (deadline_time IS NOT NULL AND created_at=due_at)))::integer AS on_time,
  count(*) FILTER (WHERE due_at IS NOT NULL AND
   (created_at>due_at OR (deadline_time IS NULL AND created_at=due_at)))::integer AS late
 FROM classified
),
recent_events AS (
 SELECT event_id,task_id,title,created_at,deadline,deadline_time,due_at
 FROM classified ORDER BY created_at DESC,event_id DESC LIMIT 30
),
latest_task_completion AS (
 SELECT DISTINCT ON (task_id) task_id,created_at,estimate
 FROM classified ORDER BY task_id,created_at DESC,event_id DESC
),
measured AS (
 SELECT c.task_id,c.estimate,
  COALESCE((SELECT SUM(
    GREATEST(0,FLOOR(EXTRACT(EPOCH FROM
    (LEAST(g.ended_at,c.created_at)-g.started_at))*1000)::bigint))
   FROM dayframe.time_session_segments g
   JOIN dayframe.time_sessions s ON s.id=g.session_id AND s.owner_user_id=$1
   WHERE s.task_id=c.task_id AND g.started_at<c.created_at
  ),0)::bigint AS exact_ms,
  COALESCE((SELECT SUM(GREATEST(0,s.accumulated_ms-COALESCE(x.ms,0)))
   FROM dayframe.time_sessions s
   LEFT JOIN (SELECT session_id,SUM(duration_ms)::bigint AS ms
    FROM dayframe.time_session_segments GROUP BY session_id) x ON x.session_id=s.id
   WHERE s.owner_user_id=$1 AND s.task_id=c.task_id
    AND s.started_at<c.created_at
  ),0)::bigint AS unknown_ms
 FROM latest_task_completion c
),
estimate_summary AS (
 SELECT count(*) FILTER (WHERE unknown_ms=0 AND exact_ms>0 AND estimate IS NOT NULL
   AND estimate::integer>0)::integer AS measured_tasks,
  count(*) FILTER (WHERE unknown_ms>0)::integer AS excluded_legacy_tasks,
  count(*) FILTER (WHERE unknown_ms=0 AND exact_ms=0 AND estimate IS NOT NULL
   AND estimate::integer>0)::integer AS untracked_tasks,
  COALESCE(SUM(estimate::integer) FILTER
   (WHERE unknown_ms=0 AND exact_ms>0 AND estimate IS NOT NULL AND estimate::integer>0),0)::bigint AS estimated_minutes,
  COALESCE(SUM(exact_ms) FILTER
   (WHERE unknown_ms=0 AND exact_ms>0 AND estimate IS NOT NULL AND estimate::integer>0),0)::bigint AS recorded_ms,
  COALESCE(SUM(abs(exact_ms-estimate::integer*60000)) FILTER
   (WHERE unknown_ms=0 AND exact_ms>0 AND estimate IS NOT NULL AND estimate::integer>0),0)::bigint AS absolute_error_ms
 FROM measured
),
weeks AS (
 SELECT ($3::date-(EXTRACT(ISODOW FROM $3::date)::integer-1)
          -(5-g.n)*7)::date AS week_day,
  ($3::date-(EXTRACT(ISODOW FROM $3::date)::integer-1)
          -(4-g.n)*7)::date AS following_day,
  b.zone,b.instant FROM bounds b CROSS JOIN generate_series(0,5) AS g(n)
),
weekly_spans AS (
 SELECT g.started_at,g.ended_at
 FROM dayframe.time_session_segments g
 JOIN dayframe.time_sessions s ON s.id=g.session_id AND s.owner_user_id=$1
 UNION ALL
 SELECT s.segment_started_at,b.instant
 FROM dayframe.time_sessions s CROSS JOIN bounds b
 WHERE s.owner_user_id=$1 AND s.state='running'
  AND s.segment_started_at IS NOT NULL
),
weekly_focus AS (
 SELECT w.week_day,w.following_day,
 COALESCE((SELECT sum(GREATEST(0,
  FLOOR(EXTRACT(EPOCH FROM
   (LEAST(p.ended_at,(w.following_day::timestamp AT TIME ZONE w.zone))-p.started_at))*1000)::bigint
  -FLOOR(EXTRACT(EPOCH FROM
   (GREATEST(p.started_at,(w.week_day::timestamp AT TIME ZONE w.zone))-p.started_at))*1000)::bigint
 )) FROM weekly_spans p
 WHERE p.started_at<(w.following_day::timestamp AT TIME ZONE w.zone)
  AND p.ended_at>(w.week_day::timestamp AT TIME ZONE w.zone)),0)::bigint AS recorded_ms,
 (SELECT count(*)::integer FROM dayframe.task_events e
  WHERE e.owner_user_id=$1 AND e.event_type='completed'
   AND e.created_at>=(w.week_day::timestamp AT TIME ZONE w.zone)
   AND e.created_at<(w.following_day::timestamp AT TIME ZONE w.zone)) AS completed_events
 FROM weeks w
)
SELECT b.period AS period,b.zone AS "timeZone",
 to_char(b.start_day,'YYYY-MM-DD') AS "startDay",
 to_char(b.end_day,'YYYY-MM-DD') AS "endDayExclusive",
 jsonb_build_object(
  'completedEvents',d.completed_events,'withDeadline',d.with_deadline,
  'withoutDeadline',d.without_deadline,'onTime',d.on_time,'late',d.late
 ) AS deadline,
 jsonb_build_object(
  'measuredTasks',e.measured_tasks,'excludedLegacyTasks',e.excluded_legacy_tasks,
  'untrackedTasks',e.untracked_tasks,
  'estimatedMinutes',e.estimated_minutes::text,'recordedMs',e.recorded_ms::text,
  'absoluteErrorMs',e.absolute_error_ms::text
 ) AS estimate,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'eventId',event_id::text,'taskId',task_id::text,
   'title',title,'completedAt',created_at,'deadline',deadline,
   'deadlineTime',deadline_time,'onTime',
   CASE WHEN due_at IS NULL THEN NULL
    WHEN deadline_time IS NULL THEN created_at<due_at
    ELSE created_at<=due_at END
  ) ORDER BY created_at DESC,event_id DESC) FROM recent_events),'[]'::jsonb) AS history,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'weekStart',to_char(w.week_day,'YYYY-MM-DD'),
  'weekEndExclusive',to_char(w.following_day,'YYYY-MM-DD'),
  'recordedMs',w.recorded_ms::text,'completedEvents',w.completed_events
 ) ORDER BY w.week_day) FROM weekly_focus w),'[]'::jsonb) AS "weeklyTrend"
FROM bounds b CROSS JOIN deadline_summary d CROSS JOIN estimate_summary e
`;
