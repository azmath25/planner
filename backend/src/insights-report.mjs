// Dayframe M7.3: evidence-backed insights. Completion counts represent tasks
// CURRENTLY done, in this completion period (not all historical cycles).
// Estimate comparison uses direct tracked time across the task lifetime, not
// unrecorded human effort; only tasks with completion audit snapshot and
// positive direct tracking qualify. Parent task rollups are never summed.
// Deadline outcome uses deadline at the latest completion event, not edits later.
// Week trend uses exact segmented/running focus only; legacy residual is excluded.
export const INSIGHTS_REPORT_SQL=`
WITH RECURSIVE
settings AS (
 SELECT COALESCE((SELECT time_zone FROM dayframe.notification_preferences WHERE owner_user_id=$1),'UTC') AS zone,
 $2::text AS period,$3::date AS anchor,clock_timestamp() AS instant
),
local_days AS (
 SELECT zone,period,anchor,instant,
 CASE WHEN period='day' THEN anchor WHEN period='week'
 THEN anchor-(EXTRACT(ISODOW FROM anchor)::integer-1)
 ELSE date_trunc('month',anchor)::date END AS first_day,
 CASE WHEN period='day' THEN anchor+1 WHEN period='week'
 THEN anchor-(EXTRACT(ISODOW FROM anchor)::integer-1)+7
 ELSE (date_trunc('month',anchor)+interval '1 month')::date END AS last_day
 FROM settings
),
bounds AS (
 SELECT zone,period,anchor,instant,first_day,last_day,
 (first_day::timestamp AT TIME ZONE zone) AS starts_at,
 (last_day::timestamp AT TIME ZONE zone) AS ends_at,
 (anchor-(EXTRACT(ISODOW FROM anchor)::integer-1)) AS final_week
 FROM local_days
),
direct_time AS (
 SELECT s.task_id,SUM(s.accumulated_ms)::bigint AS tracked_ms
 FROM dayframe.time_sessions s
 WHERE s.owner_user_id=$1 AND s.task_id IS NOT NULL
 GROUP BY s.task_id
),
completed AS (
 SELECT t.id,t.title,t.workspace_id,t.completed_at,
 COALESCE(dt.tracked_ms,0)::bigint AS tracked_ms,
 CASE WHEN e.after_state ? 'estimate'
 THEN NULLIF(e.after_state->>'estimate','')::integer ELSE NULL END AS estimate_minutes,
 CASE WHEN e.after_state ? 'deadline'
 THEN NULLIF(e.after_state->>'deadline','')::date ELSE NULL END AS deadline_day,
 CASE WHEN e.after_state ? 'deadlineTime'
 THEN NULLIF(e.after_state->>'deadlineTime','')::time ELSE NULL END AS deadline_clock,
 e.event_id IS NOT NULL AS snapshot_exists,
 b.zone
 FROM dayframe.tasks t CROSS JOIN bounds b
 LEFT JOIN direct_time dt ON dt.task_id=t.id
 LEFT JOIN LATERAL (
  SELECT event_id,after_state FROM dayframe.task_events ev
  WHERE ev.owner_user_id=$1 AND ev.task_id=t.id AND ev.event_type='completed'
  ORDER BY ev.event_id DESC LIMIT 1
 ) e ON TRUE
 WHERE t.owner_user_id=$1 AND t.status='done' AND t.deleted_at IS NULL
 AND t.completed_at>=b.starts_at AND t.completed_at<b.ends_at
),
evaluated AS (
 SELECT c.*,
 CASE WHEN snapshot_exists AND deadline_day IS NOT NULL THEN
  CASE WHEN deadline_clock IS NULL
   THEN completed_at<(deadline_day+1)::timestamp AT TIME ZONE zone
   ELSE completed_at<=(deadline_day+deadline_clock) AT TIME ZONE zone
  END
 ELSE NULL END AS met_deadline,
 (snapshot_exists AND estimate_minutes>0 AND tracked_ms>0) AS can_compare
 FROM completed c
),
summary AS (
 SELECT count(*)::integer AS finished,
 count(*) FILTER(WHERE can_compare)::integer AS estimated_compared,
 count(*) FILTER(WHERE snapshot_exists AND estimate_minutes>0 AND tracked_ms=0)::integer AS estimate_untracked,
 COALESCE(sum(estimate_minutes::bigint*60000) FILTER(WHERE can_compare),0)::bigint AS estimated_ms,
 COALESCE(sum(tracked_ms) FILTER(WHERE can_compare),0)::bigint AS compared_tracked_ms,
 COALESCE(sum(abs(tracked_ms-estimate_minutes::bigint*60000)) FILTER(WHERE can_compare),0)::bigint AS absolute_error_ms,
 count(*) FILTER(WHERE met_deadline IS NOT NULL)::integer AS deadlines_known,
 count(*) FILTER(WHERE met_deadline IS TRUE)::integer AS deadlines_met,
 count(*) FILTER(WHERE met_deadline IS FALSE)::integer AS deadlines_late,
 count(*) FILTER(WHERE NOT snapshot_exists)::integer AS completion_snapshot_missing
 FROM evaluated
),
weeks AS (
 SELECT (b.final_week-7*g.n)::date AS start_day,
 (b.final_week-7*g.n+7)::date AS end_day,
 b.zone,b.instant FROM bounds b CROSS JOIN generate_series(0,5) g(n)
),
week_spans AS (
 SELECT s.workspace_id_snapshot AS workspace_id,g.started_at,g.ended_at
 FROM dayframe.time_session_segments g
 JOIN dayframe.time_sessions s ON s.id=g.session_id AND s.owner_user_id=$1
 UNION ALL
 SELECT s.workspace_id_snapshot,s.segment_started_at,b.instant
 FROM dayframe.time_sessions s CROSS JOIN bounds b
 WHERE s.owner_user_id=$1 AND s.state='running' AND s.segment_started_at IS NOT NULL
),
weekly AS (
 SELECT w.start_day,w.end_day,
 COALESCE((SELECT sum(GREATEST(0,
  FLOOR(EXTRACT(EPOCH FROM (LEAST(p.ended_at,(w.end_day::timestamp AT TIME ZONE w.zone))-p.started_at))*1000)::bigint
  -FLOOR(EXTRACT(EPOCH FROM (GREATEST(p.started_at,(w.start_day::timestamp AT TIME ZONE w.zone))-p.started_at))*1000)::bigint
 )) FROM week_spans p
 WHERE p.started_at<(w.end_day::timestamp AT TIME ZONE w.zone)
 AND p.ended_at>(w.start_day::timestamp AT TIME ZONE w.zone)),0)::bigint AS recorded_ms,
 (SELECT count(*)::integer FROM dayframe.tasks t
  WHERE t.owner_user_id=$1 AND t.status='done' AND t.deleted_at IS NULL
  AND t.completed_at>=(w.start_day::timestamp AT TIME ZONE w.zone)
  AND t.completed_at<(w.end_day::timestamp AT TIME ZONE w.zone)) AS finished_count
 FROM weeks w
)
SELECT b.period AS period,b.zone AS "timeZone",
 to_char(b.first_day,'YYYY-MM-DD') AS "startDay",
 to_char(b.last_day,'YYYY-MM-DD') AS "endDayExclusive",
 (SELECT finished FROM summary) AS "finishedTasks",
 (SELECT estimated_compared FROM summary) AS "estimateComparedTasks",
 (SELECT estimate_untracked FROM summary) AS "estimateUntrackedTasks",
 (SELECT estimated_ms::text FROM summary) AS "comparedEstimatedMs",
 (SELECT compared_tracked_ms::text FROM summary) AS "comparedTrackedMs",
 (SELECT absolute_error_ms::text FROM summary) AS "absoluteErrorMs",
 (SELECT deadlines_known FROM summary) AS "deadlinesKnown",
 (SELECT deadlines_met FROM summary) AS "deadlinesMet",
 (SELECT deadlines_late FROM summary) AS "deadlinesLate",
 (SELECT completion_snapshot_missing FROM summary) AS "completionSnapshotsMissing",
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'taskId',e.id::text,'title',e.title,'workspaceId',e.workspace_id::text,
  'completedAt',e.completed_at,'trackedMs',e.tracked_ms::text,
  'estimateMinutes',e.estimate_minutes,
  'deadlineDay',to_char(e.deadline_day,'YYYY-MM-DD'),
  'deadlineTime',CASE WHEN e.deadline_clock IS NULL THEN NULL ELSE to_char(e.deadline_clock,'HH24:MI') END,
  'metDeadline',e.met_deadline,'snapshotExists',e.snapshot_exists,
  'comparable',e.can_compare
 ) ORDER BY e.completed_at DESC,e.id::text)
 FROM (SELECT * FROM evaluated ORDER BY completed_at DESC,id LIMIT 200) e),'[]'::jsonb) AS tasks,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'weekStart',to_char(w.start_day,'YYYY-MM-DD'),
  'weekEndExclusive',to_char(w.end_day,'YYYY-MM-DD'),
  'recordedMs',w.recorded_ms::text,'finishedTasks',w.finished_count
 ) ORDER BY w.start_day)
 FROM weekly w),'[]'::jsonb) AS "weeklyTrend"
FROM bounds b
`;
