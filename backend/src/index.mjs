// M2.3 Dayframe API: all resource authorization is derived from verified Neon JWT sub.
// Ownership is enforced again by composite database foreign keys. Never trust client owner IDs.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import pg from 'pg';
import { secureDatabaseConnectionUrl } from './db-url.mjs';
import { validateDocumentBlocks, canonicalDocumentJSON } from './document-blocks.mjs';
import { TIME_PERIOD_REPORT_SQL } from './time-period-report.mjs';
import { TIME_INSIGHTS_SQL } from './time-insights.mjs';
export { TIME_INSIGHTS_SQL } from './time-insights.mjs';
export { TIME_PERIOD_REPORT_SQL } from './time-period-report.mjs';

const ORIGIN='https://azmath25.github.io';
const HEADERS={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',vary:'Origin'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(body,status,headers)=>Response.json(body,{status,headers:{...headers,'content-type':'application/json; charset=utf-8'}});
const fail=(code,msg)=>Object.assign(new Error(msg),{status:code});
export const BOOTSTRAP_SQL="INSERT INTO dayframe.workspaces(owner_user_id,name,kind) VALUES($1,'General','general') ON CONFLICT (owner_user_id) WHERE kind = 'general' DO NOTHING";
const WORKSPACE_FIELDS='id::text AS id,name,kind,subtitle,color,cover,pinned,revision,created_at AS "createdAt",archived_at AS "archivedAt"';
export const WORKSPACE_PIN_SQL=
 "UPDATE dayframe.workspaces SET pinned=$4,revision=revision+1,updated_at=now() "+
 "WHERE owner_user_id=$1 AND id=$2 AND revision=$3 AND deleted_at IS NULL "+
 "AND archived_at IS NULL RETURNING "+WORKSPACE_FIELDS;
export const LIST_SQL="SELECT "+WORKSPACE_FIELDS+" FROM dayframe.workspaces WHERE owner_user_id=$1 AND deleted_at IS NULL AND archived_at IS NULL ORDER BY CASE WHEN kind='general' THEN 0 ELSE 1 END,created_at,id";
export const ARCHIVED_SQL="SELECT "+WORKSPACE_FIELDS+" FROM dayframe.workspaces WHERE owner_user_id=$1 AND kind='custom' AND deleted_at IS NULL AND archived_at IS NOT NULL ORDER BY archived_at DESC,id DESC";

/* M6.2a private document library: never return documents from another owner. */
const DOCUMENT_META_FIELDS=[
 'd.id::text AS id','d.workspace_id::text AS workspace',
 'd.task_id::text AS "taskId"','d.parent_id::text AS "parentId"',
 'd.title','d.revision','d.deleted_at AS "deletedAt"',
 'd.created_at AS "createdAt"','d.updated_at AS "updatedAt"'
].join(',');
const DOCUMENT_FULL_FIELDS=DOCUMENT_META_FIELDS+',d.blocks';
export const DOCUMENT_LIST_SQL="SELECT "+DOCUMENT_META_FIELDS+
 " FROM dayframe.documents d WHERE d.owner_user_id=$1 AND d.deleted_at IS NULL "+
 "AND ($2::uuid IS NULL OR d.workspace_id=$2::uuid) "+
 "AND ($3::uuid IS NULL OR d.task_id=$3::uuid) "+
 "AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=d.workspace_id "+
 "AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) "+
 "ORDER BY d.updated_at DESC,d.id DESC LIMIT $4 OFFSET $5";
// Search is per authenticated owner. The query uses literal substring matching,
// not caller-supplied SQL wildcards or unbounded regex.
export const DOCUMENT_SEARCH_SQL="SELECT "+DOCUMENT_META_FIELDS+
 " FROM dayframe.documents d WHERE d.owner_user_id=$1 AND d.deleted_at IS NULL "+
 "AND ($2::uuid IS NULL OR d.workspace_id=$2::uuid) "+
 "AND ($3::uuid IS NULL OR d.task_id=$3::uuid) "+
 "AND (strpos(lower(d.title),lower($4))>0 OR strpos(lower(d.blocks::text),lower($4))>0) "+
 "AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=d.workspace_id "+
 "AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) "+
 "ORDER BY d.updated_at DESC,d.id DESC LIMIT $5 OFFSET $6";
export const DOCUMENT_TRASH_SQL="SELECT "+DOCUMENT_META_FIELDS+
 " FROM dayframe.documents d WHERE d.owner_user_id=$1 AND d.deleted_at IS NOT NULL "+
 "ORDER BY d.deleted_at DESC,d.id DESC LIMIT $2 OFFSET $3";
export const DOCUMENT_DETAIL_SQL="SELECT "+DOCUMENT_FULL_FIELDS+
 " FROM dayframe.documents d WHERE d.owner_user_id=$1 AND d.id=$2 "+
 "AND d.deleted_at IS NULL AND EXISTS(SELECT 1 FROM dayframe.workspaces w "+
 "WHERE w.id=d.workspace_id AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL)";
export const DOCUMENT_INSERT_SQL="INSERT INTO dayframe.documents d "+
 "(id,owner_user_id,workspace_id,task_id,parent_id,title,blocks) "+
 "SELECT $2,$1,w.id,$4::uuid,$5::uuid,$6,$7::jsonb FROM dayframe.workspaces w "+
 "WHERE w.id=$3 AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL "+
 "AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM dayframe.tasks t WHERE "+
 "t.id=$4::uuid AND t.workspace_id=w.id AND t.owner_user_id=$1 AND "+
 "t.deleted_at IS NULL AND t.archived_at IS NULL)) "+
 "ON CONFLICT(id) DO NOTHING RETURNING "+DOCUMENT_FULL_FIELDS;
export const DOCUMENT_UPDATE_SQL="UPDATE dayframe.documents d SET workspace_id=$3,task_id=$4::uuid,"+
 "parent_id=$5::uuid,title=$6,blocks=$7::jsonb,revision=d.revision+1,updated_at=now() "+
 "WHERE d.owner_user_id=$1 AND d.id=$2 AND d.revision=$8 AND d.deleted_at IS NULL "+
 "AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=$3 AND w.owner_user_id=$1 "+
 "AND w.deleted_at IS NULL AND w.archived_at IS NULL) "+
 "RETURNING "+DOCUMENT_FULL_FIELDS;
export const DOCUMENT_DELETE_SQL="UPDATE dayframe.documents d SET deleted_at=now(),"+
 "revision=d.revision+1,updated_at=now() WHERE d.owner_user_id=$1 AND d.id=$2 "+
 "AND d.revision=$3 AND d.deleted_at IS NULL "+
 "AND NOT EXISTS(SELECT 1 FROM dayframe.documents child WHERE child.owner_user_id=$1 "+
 "AND child.parent_id=d.id AND child.deleted_at IS NULL) "+
 "RETURNING d.id::text AS id";
export const DOCUMENT_RESTORE_SQL="UPDATE dayframe.documents d SET deleted_at=NULL,"+
 "revision=d.revision+1,updated_at=now() WHERE d.owner_user_id=$1 AND d.id=$2 "+
 "AND d.revision=$3 AND d.deleted_at IS NOT NULL "+
 "AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=d.workspace_id "+
 "AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) "+
 "RETURNING "+DOCUMENT_FULL_FIELDS;

/* M6.1 Quick Notes: only JWT-owner owned rows are ever returned. */
const NOTE_FIELDS=[
 'id::text AS id','workspace_id::text AS workspace','title','content',
 'color','pinned','reminder::text AS reminder',
 'to_char(reminder_time,\'HH24:MI\') AS "reminderTime"',
 'converted_task_id::text AS "convertedTaskId"',
 'converted_at AS "convertedAt"','deleted_at AS "deletedAt"','revision',
 'created_at AS "createdAt"','updated_at AS "updatedAt"'
].join(',');
export const NOTES_LIST_SQL="SELECT "+NOTE_FIELDS+" FROM dayframe.quick_notes n "+
 "WHERE n.owner_user_id=$1 AND n.deleted_at IS NULL "+
 "AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=n.workspace_id "+
 "AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) "+
 "ORDER BY n.pinned DESC,n.updated_at DESC,n.id DESC LIMIT $2 OFFSET $3";
export const NOTES_TRASH_SQL="SELECT "+NOTE_FIELDS+" FROM dayframe.quick_notes n "+
 "WHERE n.owner_user_id=$1 AND n.deleted_at IS NOT NULL "+
 "AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=n.workspace_id "+
 "AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) "+
 "ORDER BY n.deleted_at DESC,n.id DESC LIMIT $2 OFFSET $3";
export const NOTE_BY_ID_SQL="SELECT "+NOTE_FIELDS+
 " FROM dayframe.quick_notes WHERE owner_user_id=$1 AND id=$2 AND deleted_at IS NULL";
export const NOTE_INSERT_SQL="INSERT INTO dayframe.quick_notes "+
 "(id,owner_user_id,workspace_id,title,content,color,pinned,reminder,reminder_time) "+
 "SELECT $2,$1,w.id,$4,$5,$6,$7,$8,$9 FROM dayframe.workspaces w "+
 "WHERE w.id=$3 AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL "+
 "ON CONFLICT(id) DO NOTHING RETURNING "+NOTE_FIELDS;
export const NOTE_UPDATE_SQL="UPDATE dayframe.quick_notes n SET "+
 "workspace_id=$3,title=$4,content=$5,color=$6,pinned=$7,reminder=$8,reminder_time=$9,"+
 "revision=n.revision+1,updated_at=now() WHERE n.owner_user_id=$1 AND n.id=$2 "+
 "AND n.revision=$10 AND n.deleted_at IS NULL "+
 "AND EXISTS(SELECT 1 FROM dayframe.workspaces w "+
 "WHERE w.id=$3 AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) "+
 "RETURNING "+NOTE_FIELDS;
export const NOTE_DELETE_SQL="UPDATE dayframe.quick_notes SET "+
 "deleted_at=now(),updated_at=now(),revision=revision+1 "+
 "WHERE owner_user_id=$1 AND id=$2 AND revision=$3 AND deleted_at IS NULL "+
 "RETURNING id::text AS id";
export const NOTE_RESTORE_SQL="UPDATE dayframe.quick_notes n SET "+
 "deleted_at=NULL,updated_at=now(),revision=n.revision+1 "+
 "WHERE n.owner_user_id=$1 AND n.id=$2 AND n.revision=$3 AND n.deleted_at IS NOT NULL "+
 "AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=n.workspace_id "+
 "AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) "+
 "RETURNING "+NOTE_FIELDS;
export const NOTE_CONVERT_SQL="SELECT dayframe.convert_quick_note($1,$2,$3,$4,$5) AS task_id";

const TASK_FIELDS=[
  'id::text AS id','workspace_id::text AS workspace','parent_id::text AS parent',
  'title','notes','status','priority','estimate_minutes AS estimate',
  'long_term AS long','deadline::text AS deadline',
  "to_char(deadline_time,'HH24:MI') AS \"deadlineTime\"",
  'reminder::text AS reminder',
  "to_char(reminder_time,'HH24:MI') AS \"reminderTime\"",
  'revision','pinned','tags','archived_at AS "archivedAt"','completed_at AS "completedAt"','cancelled_at AS "cancelledAt"',
  'created_at AS "createdAt"','updated_at AS "updatedAt"'
].join(',');
const TASK_LIST="SELECT "+TASK_FIELDS+" FROM dayframe.tasks WHERE owner_user_id=$1 AND deleted_at IS NULL AND archived_at IS NULL AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=workspace_id AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3";
const TASK_ARCHIVED="SELECT "+TASK_FIELDS+" FROM dayframe.tasks WHERE owner_user_id=$1 AND deleted_at IS NULL AND archived_at IS NOT NULL "+
"AND (parent_id IS NULL OR NOT EXISTS(SELECT 1 FROM dayframe.tasks parent WHERE parent.id=dayframe.tasks.parent_id AND parent.archived_at IS NOT NULL)) "+
"AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=workspace_id AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) ORDER BY archived_at DESC,id DESC LIMIT $2 OFFSET $3";
const TASK_TRASH="SELECT "+TASK_FIELDS+" FROM dayframe.tasks WHERE owner_user_id=$1 AND deleted_at IS NOT NULL AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=workspace_id AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) ORDER BY deleted_at DESC,id DESC LIMIT $2 OFFSET $3";
const TASK_BY_ID="SELECT "+TASK_FIELDS+" FROM dayframe.tasks WHERE owner_user_id=$1 AND id=$2 AND deleted_at IS NULL AND archived_at IS NULL AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=workspace_id AND w.owner_user_id=$1 AND w.archived_at IS NULL AND w.deleted_at IS NULL)";
const TASK_INSERT="INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title,notes,status,priority,estimate_minutes,long_term,deadline,deadline_time,reminder,reminder_time,parent_id,pinned,tags) "+
"SELECT $2,$1,w.id,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16 FROM dayframe.workspaces w WHERE w.id=$3 AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL "+
"AND ($14::uuid IS NULL OR EXISTS(SELECT 1 FROM dayframe.tasks parent WHERE parent.id=$14 AND parent.workspace_id=w.id AND parent.owner_user_id=$1 AND parent.deleted_at IS NULL AND parent.archived_at IS NULL)) "+
"ON CONFLICT(id) DO NOTHING RETURNING "+TASK_FIELDS;
const TASK_UPDATE="UPDATE dayframe.tasks t SET title=$4,notes=$5,status=$6,priority=$7,estimate_minutes=$8,long_term=$9,deadline=$10,deadline_time=$11,reminder=$12,reminder_time=$13,parent_id=$14,pinned=$15,tags=$16,revision=t.revision+1,updated_at=now() "+
"WHERE t.owner_user_id=$1 AND t.id=$2 AND t.workspace_id=$3 AND t.revision=$17 AND t.deleted_at IS NULL AND t.archived_at IS NULL "+
"AND EXISTS(SELECT 1 FROM dayframe.workspaces w WHERE w.id=t.workspace_id AND w.owner_user_id=$1 AND w.deleted_at IS NULL AND w.archived_at IS NULL) "+
"AND ($14::uuid IS NULL OR EXISTS(SELECT 1 FROM dayframe.tasks parent WHERE parent.id=$14 AND parent.workspace_id=$3 AND parent.owner_user_id=$1 AND parent.deleted_at IS NULL AND parent.archived_at IS NULL)) RETURNING "+TASK_FIELDS;
// Lock the observed root in a materialized CTE. PostgreSQL rechecks the
// revision after a concurrent updater releases its row lock, preventing a
// stale archive/Trash/restore request from operating on a changed subtree.
const TASK_SUBTREE="WITH RECURSIVE locked_root AS MATERIALIZED (SELECT root.id FROM dayframe.tasks root "+
"JOIN dayframe.workspaces w ON w.id=root.workspace_id AND w.owner_user_id=$1 WHERE root.owner_user_id=$1 AND root.id=$2 AND root.revision=$3 "+
"AND w.deleted_at IS NULL AND w.archived_at IS NULL AND ";
const TASK_DESCENDANTS=" FOR UPDATE OF root),subtree AS (SELECT r.id,ARRAY[r.id] AS path FROM locked_root r "+
"UNION ALL SELECT child.id,s.path||child.id FROM dayframe.tasks child JOIN subtree s ON child.parent_id=s.id "+
"WHERE child.owner_user_id=$1 AND NOT child.id=ANY(s.path)) ";
function taskSubtreeUpdate(field,rootCondition,childCondition,queryResult){
 return TASK_SUBTREE+rootCondition+TASK_DESCENDANTS+
 ",changed AS (UPDATE dayframe.tasks t SET "+field+"= "+(field==='archived_at'?"CASE WHEN $4::boolean THEN now() ELSE NULL END":"CASE WHEN $4::boolean THEN now() ELSE NULL END")+
 ",revision=t.revision+1,updated_at=now() FROM subtree s WHERE t.id=s.id AND t.owner_user_id=$1 "+childCondition+" RETURNING t.*) "+
 (queryResult==='rows'?"SELECT "+TASK_FIELDS+" FROM changed":"SELECT id::text AS id FROM changed");
}
// Export the exact statements executed by the API so PostgreSQL regression
// tests can exercise the production query rather than reimplementing it.
export const TASK_TRASH_SQL=TASK_SUBTREE+"root.deleted_at IS NULL AND root.archived_at IS NULL"+TASK_DESCENDANTS+
 ",changed AS (UPDATE dayframe.tasks t SET deleted_at=now(),revision=t.revision+1,updated_at=now() FROM subtree s WHERE t.id=s.id AND t.owner_user_id=$1 AND t.deleted_at IS NULL RETURNING t.id) SELECT id::text AS id FROM changed";
export const TASK_RESTORE_SQL=taskSubtreeUpdate('deleted_at','root.deleted_at IS NOT NULL','AND t.deleted_at IS NOT NULL','rows');
const TASK_HISTORY="SELECT e.event_id::text AS id,e.event_type AS type,e.before_state AS before,e.after_state AS after,e.created_at AS \"createdAt\" FROM dayframe.task_events e "+
"WHERE e.owner_user_id=$1 AND e.task_id=$2 AND EXISTS(SELECT 1 FROM dayframe.tasks t WHERE t.id=e.task_id AND t.owner_user_id=$1) ORDER BY e.event_id DESC LIMIT $3";

// One statement yields a consistent revision and ordered active IDs.
export const DAY_POOL_GET_SQL =
"SELECT COALESCE(p.revision,0) AS revision, "+
"COALESCE((SELECT json_agg(i.task_id::text ORDER BY i.position) "+
"FROM dayframe.daily_pool_items i JOIN dayframe.tasks t ON t.id=i.task_id AND t.owner_user_id=$1 "+
"JOIN dayframe.workspaces w ON w.id=t.workspace_id AND w.owner_user_id=$1 "+
"WHERE i.owner_user_id=$1 AND i.plan_day=$2::date "+
"AND t.status='open' AND t.deleted_at IS NULL AND t.archived_at IS NULL "+
"AND w.deleted_at IS NULL AND w.archived_at IS NULL),'[]'::json) AS \"taskIds\" "+
"FROM (SELECT 1) seed LEFT JOIN dayframe.daily_pools p ON p.owner_user_id=$1 AND p.plan_day=$2::date";
export const DAY_POOL_PUT_SQL="SELECT dayframe.replace_daily_pool($1,$2::date,$3,$4::uuid[]) AS revision";

// M4.3 in-app alert inbox: date/time in a verified IANA zone, never a hard-deadline mutation.
// A missing clock time is interpreted as 09:00 in the chosen zone.
// M5.1: only Neon owns the stopwatch. The database transition function
// serializes all updates per account and takes authoritative timestamps.
export const TIME_ACTIVE_SQL="SELECT dayframe.time_session_snapshot(s) AS session "+
 "FROM dayframe.time_sessions s WHERE s.owner_user_id=$1 AND s.state IN ('running','paused') LIMIT 1";
export const TIME_TRANSITION_SQL="SELECT dayframe.transition_time_session($1,$2,$3,$4,$5,$6) AS session";

/**
 * M5.3 current ISO week (Monday -> Monday) in the account's saved IANA zone.
 * New active spans are sliced by real local week boundaries; DST gaps/folds
 * are handled by timestamptz conversion. Historical accumulated time that
 * predates segment capture cannot be reconstructed, so the residual is
 * explicitly returned as legacyEstimatedMs, assigned to session-start week.
 * Current fixed plans are schedules, not immutable past commitments.
 */
export const TIME_WEEK_SQL=`
WITH
clock AS (
 SELECT COALESCE(
  (SELECT time_zone FROM dayframe.notification_preferences WHERE owner_user_id=$1),'UTC'
 ) AS zone,clock_timestamp() AS instant
),
bounds AS (
 SELECT c.zone,c.instant,
  date_trunc('week',c.instant AT TIME ZONE c.zone)::date AS week_day,
  (date_trunc('week',c.instant AT TIME ZONE c.zone) AT TIME ZONE c.zone) AS starts_at,
  ((date_trunc('week',c.instant AT TIME ZONE c.zone)+interval '7 days') AT TIME ZONE c.zone) AS ends_at
 FROM clock c
),
finished_segments AS (
 SELECT s.workspace_id_snapshot AS workspace_id,g.started_at,g.ended_at
 FROM dayframe.time_session_segments g
 JOIN dayframe.time_sessions s ON s.id=g.session_id AND s.owner_user_id=$1
),
running_segment AS (
 SELECT s.workspace_id_snapshot AS workspace_id,s.segment_started_at AS started_at,
  b.instant AS ended_at
 FROM dayframe.time_sessions s CROSS JOIN bounds b
 WHERE s.owner_user_id=$1 AND s.state='running' AND s.segment_started_at IS NOT NULL
),
spans AS (
 SELECT * FROM finished_segments UNION ALL SELECT * FROM running_segment
),
actual_spans AS (
 SELECT p.workspace_id,
  GREATEST(0,
   FLOOR(EXTRACT(EPOCH FROM (LEAST(p.ended_at,b.ends_at)-p.started_at))*1000)::bigint
   - FLOOR(EXTRACT(EPOCH FROM (GREATEST(p.started_at,b.starts_at)-p.started_at))*1000)::bigint
  ) AS ms
 FROM spans p CROSS JOIN bounds b
 WHERE p.started_at<b.ends_at AND p.ended_at>b.starts_at
),
historical_residual AS (
 SELECT s.workspace_id_snapshot AS workspace_id,
  GREATEST(0,s.accumulated_ms-COALESCE(g.total_ms,0)) AS ms
 FROM dayframe.time_sessions s
 LEFT JOIN (SELECT session_id,SUM(duration_ms)::bigint AS total_ms
  FROM dayframe.time_session_segments GROUP BY session_id) g ON g.session_id=s.id
 CROSS JOIN bounds b
 WHERE s.owner_user_id=$1 AND s.started_at>=b.starts_at AND s.started_at<b.ends_at
),
weekly_actual AS (
 SELECT workspace_id,SUM(ms)::bigint AS ms FROM (
  SELECT workspace_id,ms FROM actual_spans
  UNION ALL SELECT workspace_id,ms FROM historical_residual
 ) each GROUP BY workspace_id
),
legacy AS (
 SELECT workspace_id,SUM(ms)::bigint AS ms FROM historical_residual GROUP BY workspace_id
),
fixed_plan AS (
 SELECT t.workspace_id,SUM(i.end_minute-i.start_minute)::bigint AS minutes
 FROM dayframe.scheduled_intervals i
 JOIN dayframe.tasks t ON t.id=i.task_id AND t.owner_user_id=$1
 CROSS JOIN bounds b
 WHERE i.owner_user_id=$1 AND i.plan_day>=b.week_day AND i.plan_day<b.week_day+7
 GROUP BY t.workspace_id
),
workspace_keys AS (
 SELECT id FROM dayframe.workspaces WHERE owner_user_id=$1 AND deleted_at IS NULL
 UNION SELECT workspace_id FROM weekly_actual
 UNION SELECT workspace_id FROM fixed_plan
),
workspace_rows AS (
 SELECT k.id AS workspace_id,w.name,w.archived_at IS NOT NULL AS archived,
  COALESCE(x.target_minutes,0) AS target_minutes,
  COALESCE(x.revision,0) AS target_revision,
  COALESCE(a.ms,0)::bigint AS actual_ms,
  COALESCE(l.ms,0)::bigint AS legacy_ms,
  COALESCE(p.minutes,0)::bigint AS planned_minutes
 FROM workspace_keys k
 LEFT JOIN dayframe.workspaces w ON w.id=k.id AND w.owner_user_id=$1
 LEFT JOIN dayframe.weekly_workspace_targets x
  ON x.workspace_id=k.id AND x.owner_user_id=$1
 LEFT JOIN weekly_actual a ON a.workspace_id=k.id
 LEFT JOIN legacy l ON l.workspace_id=k.id
 LEFT JOIN fixed_plan p ON p.workspace_id=k.id
)
SELECT b.zone AS "timeZone",to_char(b.week_day,'YYYY-MM-DD') AS "weekStart",
 to_char(b.week_day+7,'YYYY-MM-DD') AS "weekEnd",
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'workspaceId',r.workspace_id::text,'name',r.name,'archived',r.archived,
  'targetMinutes',r.target_minutes,'revision',r.target_revision,
  'actualMs',r.actual_ms::text,'legacyEstimatedMs',r.legacy_ms::text,
  'plannedMinutes',r.planned_minutes::text) ORDER BY r.name NULLS LAST,r.workspace_id::text)
  FROM workspace_rows r),'[]'::jsonb) AS workspaces,
 COALESCE((SELECT SUM(actual_ms)::bigint FROM workspace_rows),0)::text AS "accountActualMs",
 COALESCE((SELECT SUM(legacy_ms)::bigint FROM workspace_rows),0)::text AS "accountLegacyEstimatedMs",
 COALESCE((SELECT SUM(planned_minutes)::bigint FROM workspace_rows),0)::text AS "accountPlannedMinutes"
FROM bounds b
`;

export const TIME_WEEK_TARGET_SQL=
 "INSERT INTO dayframe.weekly_workspace_targets AS current "+
 "(owner_user_id,workspace_id,target_minutes) "+
 "SELECT w.owner_user_id,w.id,$3::integer FROM dayframe.workspaces w "+
 "WHERE w.owner_user_id=$1 AND w.id=$2 AND w.deleted_at IS NULL "+
 "AND w.archived_at IS NULL AND "+
 "($4::integer=0 OR EXISTS(SELECT 1 FROM dayframe.weekly_workspace_targets x "+
 "WHERE x.owner_user_id=$1 AND x.workspace_id=$2 AND x.revision=$4)) "+
 "ON CONFLICT(owner_user_id,workspace_id) DO UPDATE SET "+
 "target_minutes=EXCLUDED.target_minutes,revision=current.revision+1,updated_at=now() "+
 "WHERE current.revision=$4 "+
 "RETURNING workspace_id::text AS \"workspaceId\",target_minutes AS \"targetMinutes\",revision";

export const TIME_DIRECT_TOTALS_SQL="SELECT task_id::text AS \"taskId\", "+
 "SUM(accumulated_ms)::text AS \"totalMs\" FROM dayframe.time_sessions "+
 "WHERE owner_user_id=$1 AND task_id IS NOT NULL GROUP BY task_id";

/**
 * M5.2 rollups are derived from each recorded session exactly once.
 *
 * Parent totals use the CURRENT task ancestry (unlimited depth). Moving a
 * subtask reattributes its historical direct time to its new parent.
 * Workspace totals use the IMMUTABLE workspace-at-session-start snapshot so
 * moving a task does not rewrite historical workspace totals. Deleted-task
 * sessions remain in the account + workspace but have no surviving task link.
 *
 * The unique leaf->ancestor path prevents global/workspace double counting.
 * One SQL statement returns both the active timer and all-time aggregates so
 * a refresh cannot mix database snapshots across different round trips.
 */
export const TIME_ROLLUPS_SQL=`
WITH RECURSIVE
records AS MATERIALIZED (
 SELECT task_id,workspace_id_snapshot,accumulated_ms
 FROM dayframe.time_sessions WHERE owner_user_id=$1
),
direct AS (
 SELECT task_id,SUM(accumulated_ms)::bigint AS ms FROM records
 WHERE task_id IS NOT NULL GROUP BY task_id
),
ancestry AS (
 SELECT t.id AS leaf,t.id AS ancestor,ARRAY[t.id] AS visited
 FROM direct d JOIN dayframe.tasks t ON t.id=d.task_id AND t.owner_user_id=$1
 UNION ALL
 SELECT a.leaf,p.id,a.visited||p.id
 FROM ancestry a
 JOIN dayframe.tasks c ON c.id=a.ancestor AND c.owner_user_id=$1
 JOIN dayframe.tasks p ON p.id=c.parent_id AND p.owner_user_id=$1
 WHERE NOT p.id=ANY(a.visited)
),
rolled AS (
 SELECT a.ancestor,SUM(d.ms)::bigint AS ms
 FROM ancestry a JOIN direct d ON d.task_id=a.leaf GROUP BY a.ancestor
),
workspace_totals AS (
 SELECT workspace_id_snapshot AS workspace_id,
  SUM(accumulated_ms)::bigint AS ms
 FROM records GROUP BY workspace_id_snapshot
),
active AS (
 SELECT task_id FROM dayframe.time_sessions
 WHERE owner_user_id=$1 AND state IN ('running','paused') LIMIT 1
)
SELECT
 (SELECT dayframe.time_session_snapshot(s)
  FROM dayframe.time_sessions s
  WHERE s.owner_user_id=$1 AND s.state IN ('running','paused')
  LIMIT 1) AS session,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'taskId',r.ancestor::text,'directMs',COALESCE(d.ms,0)::text,
    'totalMs',r.ms::text) ORDER BY r.ancestor::text)
    FROM rolled r LEFT JOIN direct d ON d.task_id=r.ancestor),'[]'::jsonb) AS tasks,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'workspaceId',w.workspace_id::text,'totalMs',w.ms::text)
    ORDER BY w.workspace_id::text) FROM workspace_totals w),'[]'::jsonb) AS workspaces,
 COALESCE((SELECT SUM(accumulated_ms)::bigint FROM records),0)::text AS "accountTotalMs",
 COALESCE((SELECT SUM(accumulated_ms)::bigint FROM records WHERE task_id IS NULL),0)::text AS "deletedTaskMs",
 COALESCE((SELECT jsonb_agg(a.ancestor::text ORDER BY cardinality(a.visited))
    FROM ancestry a JOIN active c ON c.task_id=a.leaf),'[]'::jsonb) AS "activeAncestorIds"
`;


export const ALERT_LIST_SQL =
 "WITH occurrences AS ("+
 "SELECT t.id::text AS \"taskId\",t.title,kind.kind, "+
 "CASE WHEN kind.kind='reminder' THEN t.reminder ELSE t.deadline END AS day, "+
 "COALESCE(CASE WHEN kind.kind='reminder' THEN t.reminder_time ELSE t.deadline_time END,'09:00'::time) AS clock "+
 "FROM dayframe.tasks t JOIN dayframe.workspaces w ON w.id=t.workspace_id AND w.owner_user_id=$1 "+
 "CROSS JOIN (VALUES('reminder'),('deadline')) kind(kind) "+
 "WHERE t.owner_user_id=$1 AND t.status='open' AND t.deleted_at IS NULL AND t.archived_at IS NULL "+
 "AND w.deleted_at IS NULL AND w.archived_at IS NULL "+
 "AND (CASE WHEN kind.kind='reminder' THEN t.reminder ELSE t.deadline END) IS NOT NULL) "+
 "SELECT o.\"taskId\",o.title,o.kind,o.day::text AS day,to_char(o.clock,'HH24:MI') AS time, "+
 "((o.day+o.clock) AT TIME ZONE COALESCE((SELECT time_zone FROM dayframe.notification_preferences WHERE owner_user_id=$1), $2)) AS \"dueAt\", "+
 "a.revision, a.acknowledged_at AS \"acknowledgedAt\",a.snoozed_until AS \"snoozedUntil\" "+
 "FROM occurrences o LEFT JOIN dayframe.task_alert_actions a ON a.owner_user_id=$1 "+
 "AND a.task_id=o.\"taskId\"::uuid AND a.kind=o.kind AND a.source_day=o.day AND a.source_time=o.clock "+
 "WHERE ((o.day+o.clock) AT TIME ZONE COALESCE((SELECT time_zone FROM dayframe.notification_preferences WHERE owner_user_id=$1), $2)) <= now()+interval '48 hours' "+
 "AND a.acknowledged_at IS NULL AND (a.snoozed_until IS NULL OR a.snoozed_until<=now()) "+
 "ORDER BY \"dueAt\",o.\"taskId\",o.kind LIMIT 100";
// M6.1a: notes are a distinct alert source. Keep task-alert APIs unchanged.
export const NOTE_ALERT_LIST_SQL=
 "SELECT n.id::text AS \"noteId\",n.title,'note'::text AS kind,"+
 "n.reminder::text AS day,to_char(COALESCE(n.reminder_time,'09:00'::time),'HH24:MI') AS time,"+
 "((n.reminder+COALESCE(n.reminder_time,'09:00'::time)) AT TIME ZONE "+
 "COALESCE((SELECT time_zone FROM dayframe.notification_preferences WHERE owner_user_id=$1),$2)) AS \"dueAt\","+
 "a.revision,a.acknowledged_at AS \"acknowledgedAt\",a.snoozed_until AS \"snoozedUntil\" "+
 "FROM dayframe.quick_notes n "+
 "JOIN dayframe.workspaces w ON w.id=n.workspace_id AND w.owner_user_id=n.owner_user_id "+
 "LEFT JOIN dayframe.note_alert_actions a ON a.owner_user_id=n.owner_user_id "+
 "AND a.note_id=n.id AND a.source_day=n.reminder AND "+
 "a.source_time=COALESCE(n.reminder_time,'09:00'::time) "+
 "WHERE n.owner_user_id=$1 AND n.reminder IS NOT NULL AND n.deleted_at IS NULL "+
 "AND w.deleted_at IS NULL AND w.archived_at IS NULL "+
 "AND ((n.reminder+COALESCE(n.reminder_time,'09:00'::time)) AT TIME ZONE "+
 "COALESCE((SELECT time_zone FROM dayframe.notification_preferences WHERE owner_user_id=$1),$2))<=now()+interval '48 hours' "+
 "AND a.acknowledged_at IS NULL AND (a.snoozed_until IS NULL OR a.snoozed_until<=now()) "+
 "ORDER BY \"dueAt\",n.id LIMIT 100";
export const NOTE_ALERT_ACTION_SQL=
 "SELECT dayframe.update_note_alert($1,$2,$3::date,$4::time,$5,$6,$7::timestamptz) AS revision";
export const NOTIFICATION_PREF_GET_SQL="SELECT time_zone AS \"timeZone\",to_char(quiet_start,'HH24:MI') AS \"quietStart\",to_char(quiet_end,'HH24:MI') AS \"quietEnd\" FROM dayframe.notification_preferences WHERE owner_user_id=$1";
export const NOTIFICATION_QUIET_SAVE_SQL=
 "INSERT INTO dayframe.notification_preferences(owner_user_id,time_zone,quiet_start,quiet_end) "+
 "VALUES($1,$2,$3::time,$4::time) "+
 "ON CONFLICT(owner_user_id) DO UPDATE SET quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,updated_at=now() "+
 "RETURNING to_char(quiet_start,'HH24:MI') AS \"quietStart\",to_char(quiet_end,'HH24:MI') AS \"quietEnd\"";
export const NOTIFICATION_PREF_SAVE_SQL="INSERT INTO dayframe.notification_preferences(owner_user_id,time_zone) VALUES($1,$2) ON CONFLICT(owner_user_id) DO UPDATE SET time_zone=EXCLUDED.time_zone,updated_at=now() RETURNING time_zone AS \"timeZone\"";
export const PUSH_SUB_SAVE_SQL="INSERT INTO dayframe.push_subscriptions(endpoint,owner_user_id) VALUES($2,$1) "+
"ON CONFLICT(endpoint) DO UPDATE SET updated_at=now() WHERE dayframe.push_subscriptions.owner_user_id=EXCLUDED.owner_user_id RETURNING endpoint";
export const PUSH_SUB_STATUS_SQL="SELECT 1 AS registered FROM dayframe.push_subscriptions WHERE owner_user_id=$1 AND endpoint=$2";
export const PUSH_SUB_DELETE_SQL="DELETE FROM dayframe.push_subscriptions WHERE endpoint=$2 AND owner_user_id=$1 RETURNING endpoint";
export const PUSH_PUBLIC_KEY='BGuoNReCOFbRqVYRkKY9u-sVDCE-f6JvrbxRZnsksM3cDze3lsS8Y6tkzDs6-mLUFBQXZK2uhBUISW21wEfWZl8';
function pushEndpoint(value){
 if(typeof value!=='string'||value.length<30||value.length>1200)throw fail(400,'Invalid push endpoint');
 let url;
 try{url=new URL(value);}catch{throw fail(400,'Invalid push endpoint');}
 const host=url.hostname.toLowerCase();
 const allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||
 host==='web.push.apple.com'||host.endsWith('.push.apple.com')||
 host.endsWith('.notify.windows.com');
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||
 !allowed)throw fail(400,'Unsupported push service');
 return value;
}
export const ALERT_ACTION_SQL="SELECT dayframe.update_task_alert($1,$2,$3,$4::date,$5::time,$6,$7,$8::timestamptz) AS revision";
function alertZone(value){
 if(typeof value!=='string'||value.length>64||!/^[A-Za-z0-9_+\/-]+$/.test(value))throw fail(400,'Invalid alert time zone');
 try{new Intl.DateTimeFormat('en-US',{timeZone:value});}catch{throw fail(400,'Invalid alert time zone');}
 return value;
}

export const TIMED_RANGE_SQL =
 "SELECT s.id::text AS id,s.task_id::text AS \"taskId\",s.plan_day::text AS day,"+
 "lpad((s.start_minute/60)::text,2,'0')||':'||lpad((s.start_minute%60)::text,2,'0') AS start,"+
 "lpad((s.end_minute/60)::text,2,'0')||':'||lpad((s.end_minute%60)::text,2,'0') AS \"end\","+
 "s.time_zone AS \"timeZone\",s.revision FROM dayframe.scheduled_intervals s "+
 "WHERE s.owner_user_id=$1 AND s.plan_day BETWEEN $2::date AND $3::date "+
 "ORDER BY s.plan_day,s.start_minute,s.id LIMIT 2500";
export const TIMED_SAVE_SQL="SELECT dayframe.save_scheduled_interval($1,$2,$3,$4::date,$5,$6,$7,$8) AS revision";
export const TIMED_DELETE_SQL="DELETE FROM dayframe.scheduled_intervals WHERE owner_user_id=$1 AND id=$2 AND revision=$3 RETURNING id::text AS id";
function clockMinutes(value,label,{end=false}={}){
 if(typeof value!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)){
  if(end&&value==='24:00')return 1440;
  throw fail(400,'Invalid '+label);
 }
 const minute=Number(value.slice(0,2))*60+Number(value.slice(3));
 if(!end&&minute>=1440)throw fail(400,'Invalid '+label);
 return minute;
}
function scheduleBody(body){
 const task=uuid(body.taskId,'task');
 const day=date(body.day,'schedule date');
 if(!day||day<'2000-01-01'||day>'2100-12-31')throw fail(400,'Invalid schedule date');
 const start=clockMinutes(body.start,'start time'),end=clockMinutes(body.end,'end time',{end:true});
 if(end<=start)throw fail(400,'End time must be after start time');
 const zone=str(body.timeZone,64,'time zone',{required:true});
 if(zone.length<2)throw fail(400,'Invalid time zone');
 try{new Intl.DateTimeFormat('en-US',{timeZone:zone});}
 catch{throw fail(400,'Invalid time zone');}
 if(!Number.isSafeInteger(body.revision)||body.revision<0)throw fail(400,'Invalid schedule revision');
 return [task,day,start,end,zone,body.revision];
}

let jwks,pool;
async function verifyNeonToken(token) {
  if(!process.env.NEON_AUTH_BASE_URL||!process.env.NEON_AUTH_JWKS_URL) throw Error('Missing auth configuration');
  jwks??=createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
  const {payload}=await jwtVerify(token,jwks,{issuer:new URL(process.env.NEON_AUTH_BASE_URL).origin,algorithms:['EdDSA']});
  if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>256) throw Error('Invalid subject');
  return payload.sub;
}
async function runSql(sql,args){
  if(!process.env.DATABASE_URL) throw Error('Missing database configuration');
  if(!pool){pool=new pg.Pool({connectionString:secureDatabaseConnectionUrl(process.env.DATABASE_URL),max:4});pool.on('error',()=>console.error('Dayframe database pool disconnected'));}
  return pool.query(sql,args);
}
async function readBody(req,maxChars=25000){
  if(!String(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json')) throw fail(415,'Expected JSON');
  if(Number(req.headers.get('content-length')||0)>maxChars) throw fail(413,'Request too large');
  const text=await req.text();
  if(text.length>maxChars) throw fail(413,'Request too large');
  let data;try{data=JSON.parse(text)}catch{throw fail(400,'Invalid JSON');}
  if(!data||Array.isArray(data)||typeof data!=='object') throw fail(400,'Invalid JSON object');
  return data;
}
function str(value,max,label,{required=false}={}){
  if(typeof value!=='string') throw fail(400,'Invalid '+label);
  const s=value.trim();
  if(s.length>max||(required&&!s)) throw fail(400,'Invalid '+label);
  return s;
}
function date(value,label){
  if(value===null||value===undefined||value==='')return null;
  if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) throw fail(400,'Invalid '+label);
  const d=new Date(value+'T00:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value) throw fail(400,'Invalid '+label);
  return value;
}
function clock(value,day,label){
  if(value===null||value===undefined||value==='')return null;
  if(!day||typeof value!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) throw fail(400,'Invalid '+label);
  return value;
}
function uuid(s,label){if(typeof s!=='string'||!UUID.test(s)) throw fail(400,'Invalid '+label);return s;}
function taskBody(body){
  const title=str(body.title,160,'task title',{required:true});
  const workspace=uuid(body.workspace,'workspace');
  const notes=str(body.notes??'',10000,'notes');
  const status=body.status??'open',priority=body.priority??'medium';
  if(!['open','done','cancelled'].includes(status)||!['low','medium','high'].includes(priority))throw fail(400,'Invalid task status or priority');
  const estimate=Number(body.estimate??30);
  if(!Number.isSafeInteger(estimate)||estimate<1||estimate>100000)throw fail(400,'Invalid estimate');
  if(typeof body.long!=='boolean'&&body.long!==undefined)throw fail(400,'Invalid long-term flag');
  const hard=date(body.deadline,'deadline'),rem=date(body.reminder,'reminder');
  const parent=body.parent==null?null:uuid(body.parent,'parent task');
  const pinned=body.pinned??false;
  if(typeof pinned!=='boolean')throw fail(400,'Invalid pin');
  const tags=body.tags??[];
  if(!Array.isArray(tags)||tags.length>8||tags.some(tag=>typeof tag!=='string'||tag.length<1||tag.length>30||!/^[\p{L}\p{N} _-]+$/u.test(tag)))throw fail(400,'Invalid tags');
  if(new Set(tags.map(tag=>tag.toLocaleLowerCase())).size!==tags.length)throw fail(400,'Duplicate tags');
  return [workspace,title,notes,status,priority,estimate,Boolean(body.long),hard,clock(body.deadlineTime,hard,'deadline time'),rem,clock(body.reminderTime,rem,'reminder time'),parent,pinned,tags];
}
function workspaceBody(body){
  const name=str(body.name,120,'workspace name',{required:true});
  const subtitle=str(body.subtitle??'',180,'workspace description');
  const color=body.color??'#85a99d',cover=body.cover??'general';
  if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))throw fail(400,'Invalid workspace color');
  if(typeof cover!=='string'||!['general','research','dev','custom'].includes(cover))throw fail(400,'Invalid workspace cover');
  return [name,subtitle,color,cover];
}
function revision(body){const rev=Number(body.revision);if(!Number.isSafeInteger(rev)||rev<1)throw fail(400,'Invalid revision');return rev;}
function noteBody(body){
 const workspace=uuid(body.workspace,'note workspace');
 const title=str(body.title,120,'note title',{required:true});
 const content=str(body.content??'',8000,'note content');
 const color=body.color??'cream';
 if(!['cream','lilac','green','blue'].includes(color))throw fail(400,'Invalid note color');
 const pinned=body.pinned??false;
 if(typeof pinned!=='boolean')throw fail(400,'Invalid note pin');
 const reminder=date(body.reminder,'note reminder');
 const reminderTime=clock(body.reminderTime,reminder,'note reminder time');
 return [workspace,title,content,color,pinned,reminder,reminderTime];
}
function documentBody(body){
 const workspace=uuid(body.workspace,'document workspace');
 const taskId=body.taskId==null?null:uuid(body.taskId,'document task');
 const parentId=body.parentId==null?null:uuid(body.parentId,'document parent');
 const title=str(body.title,160,'document title',{required:true});
 const blocks=validateDocumentBlocks(body.blocks);
 return [workspace,taskId,parentId,title,JSON.stringify(blocks)];
}
function matchesDocument(row,args){
 const [workspace,taskId,parentId,title,blocks]=args;
 return row.workspace===workspace&&(row.taskId||null)===taskId&&
  (row.parentId||null)===parentId&&row.title===title&&
  canonicalDocumentJSON(row.blocks)===canonicalDocumentJSON(JSON.parse(blocks));
}
function matchesNote(row,args){
 const [workspace,title,content,color,pinned,reminder,reminderTime]=args;
 return row.workspace===workspace&&row.title===title&&row.content===content&&
  row.color===color&&row.pinned===pinned&&
  (row.reminder||null)===reminder&&(row.reminderTime||null)===reminderTime;
}
function matchesTask(existing,args){
  const [workspace,title,notes,status,priority,estimate,long,deadline,deadlineTime,reminder,reminderTime,parent,pinned,tags]=args;
  const nullable=value=>value===''||value==null?null:value;
  return existing.workspace===workspace&&existing.title===title&&existing.notes===notes&&
    existing.status===status&&existing.priority===priority&&Number(existing.estimate)===estimate&&
    existing.long===long&&nullable(existing.deadline)===deadline&&
    nullable(existing.deadlineTime)===deadlineTime&&nullable(existing.reminder)===reminder&&
    nullable(existing.reminderTime)===reminderTime&&nullable(existing.parent)===parent&&
    Boolean(existing.pinned)===pinned&&JSON.stringify(existing.tags||[])===JSON.stringify(tags);
}
function authHeaders(request){
  const trusted=request.headers.get('origin')===ORIGIN;
  return {...HEADERS,...(trusted?{'access-control-allow-origin':ORIGIN}:{})};
}
export function createHandler({verifyToken=verifyNeonToken,query=runSql}={}){
return {async fetch(req){
  const path=new URL(req.url).pathname.replace(/\/+$/,'')||'/';
  const hdr=authHeaders(req);
  if(req.method==='OPTIONS'){
    if(!path.startsWith('/v1/')&&!['/','/health'].includes(path))return json({error:'Not found'},404,hdr);
    if(req.headers.get('origin')!==ORIGIN)return json({error:'Origin not allowed'},403,hdr);
    return new Response(null,{status:204,headers:{...hdr,'access-control-allow-methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type','access-control-max-age':'600'}});
  }
  if(path==='/'||path==='/health')return req.method==='GET'?json({service:'dayframe',status:'ok',stage:'persistent-workspaces-tasks'},200,hdr):json({error:'Method not allowed'},405,{...hdr,allow:'GET,OPTIONS'});
  if(!path.startsWith('/v1/'))return json({error:'Not found'},404,hdr);
  const match=/^Bearer ([A-Za-z0-9_.\-]+)$/i.exec(req.headers.get('authorization')||'');
  if(!match||match[1].length>8192)return json({error:'Unauthorized'},401,hdr);
  let uid;try{uid=await verifyToken(match[1]);if(typeof uid!=='string'||!uid||uid.length>256)throw Error('Subject');}catch{return json({error:'Unauthorized'},401,hdr);}
  try{
    if(path==='/v1/me'&&req.method!=='GET')return json({error:'Method not allowed'},405,{...hdr,allow:'GET,OPTIONS'});
    if((path==='/v1/me'||path==='/v1/workspaces')&&req.method==='GET'){
      await query(BOOTSTRAP_SQL,[uid]);
      const {rows}=await query(LIST_SQL,[uid]);
      if(!rows?.some(x=>x.kind==='general'))throw fail(503,'Workspace unavailable');
      if(path==='/v1/me')return json({user:{id:uid},generalWorkspace:rows.find(x=>x.kind==='general')},200,hdr);
      return json({workspaces:rows},200,hdr);
    }
    if(path==='/v1/workspaces/archived'&&req.method==='GET'){
      const {rows}=await query(ARCHIVED_SQL,[uid]);
      return json({workspaces:rows},200,hdr);
    }
    if(path==='/v1/workspaces'&&req.method==='POST'){
      const [name,subtitle,color,cover]=workspaceBody(await readBody(req));
      const {rows}=await query("INSERT INTO dayframe.workspaces(owner_user_id,kind,name,subtitle,color,cover) VALUES($1,'custom',$2,$3,$4,$5) RETURNING "+WORKSPACE_FIELDS,[uid,name,subtitle,color,cover]);
      return json({workspace:rows[0]},201,hdr);
    }
    const workspacePin=/^\/v1\/workspaces\/([a-f0-9-]{36})\/pin$/i.exec(path);
    if(workspacePin){
      if(req.method!=='PUT')return json({error:'Method not allowed'},405,{...hdr,allow:'PUT,OPTIONS'});
      const body=await readBody(req,1500);
      const id=uuid(workspacePin[1],'workspace ID'),rev=revision(body);
      if(typeof body.pinned!=='boolean')throw fail(400,'Invalid workspace pin');
      const {rows}=await query(WORKSPACE_PIN_SQL,[uid,id,rev,body.pinned]);
      if(!rows.length)throw fail(409,'Workspace changed, archived or unavailable');
      return json({workspace:rows[0]},200,hdr);
    }
    const wa=/^\/v1\/workspaces\/([a-f0-9-]{36})\/(archive|restore)$/i.exec(path);
    if(wa&&req.method==='POST'){
      const id=uuid(wa[1],'workspace'),rev=revision(await readBody(req));
      const archive=wa[2]==='archive';
      const sql=archive
        ? "UPDATE dayframe.workspaces SET archived_at=now(),revision=revision+1,updated_at=now() WHERE id=$2 AND owner_user_id=$1 AND kind='custom' AND deleted_at IS NULL AND archived_at IS NULL AND revision=$3 RETURNING "+WORKSPACE_FIELDS
        : "UPDATE dayframe.workspaces SET archived_at=NULL,revision=revision+1,updated_at=now() WHERE id=$2 AND owner_user_id=$1 AND kind='custom' AND deleted_at IS NULL AND archived_at IS NOT NULL AND revision=$3 RETURNING "+WORKSPACE_FIELDS;
      const {rows}=await query(sql,[uid,id,rev]);
      if(!rows.length)throw fail(409,'Workspace changed, unavailable or protected');
      return json({workspace:rows[0]},200,hdr);
    }
    const wm=/^\/v1\/workspaces\/([a-f0-9-]{36})$/i.exec(path);
    if(wm&&req.method==='PATCH'){
      const id=uuid(wm[1],'workspace'),body=await readBody(req);
      const [name,subtitle,color,cover]=workspaceBody(body),rev=revision(body);
      const {rows}=await query("UPDATE dayframe.workspaces SET name=$3,subtitle=$4,color=$5,cover=$6,revision=revision+1,updated_at=now() WHERE id=$2 AND owner_user_id=$1 AND kind='custom' AND deleted_at IS NULL AND archived_at IS NULL AND revision=$7 RETURNING "+WORKSPACE_FIELDS,[uid,id,name,subtitle,color,cover,rev]);
      if(!rows.length)throw fail(409,'Workspace changed or unavailable');
      return json({workspace:rows[0]},200,hdr);
    }
    if(path==='/v1/timed-intervals'){
      if(req.method==='GET'){
        const url=new URL(req.url),from=date(url.searchParams.get('from'),'range start'),
         to=date(url.searchParams.get('to'),'range end');
        if(!from||!to||from<'2000-01-01'||to>'2100-12-31'||from>to||
         (Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000>44)
          throw fail(400,'Select a range of at most 45 days');
        const {rows}=await query(TIMED_RANGE_SQL,[uid,from,to]);
        return json({from,to,intervals:rows},200,hdr);
      }
      return json({error:'Method not allowed'},405,{...hdr,allow:'GET,OPTIONS'});
    }
    if(path==='/v1/notification-preferences/quiet-hours'){
      if(req.method!=='PUT')return json({error:'Method not allowed'},405,{...hdr,allow:'PUT,OPTIONS'});
      const body=await readBody(req,1500);
      const zone=alertZone(body.timeZone);
      const start=clock(body.quietStart,'2000-01-01','quiet start');
      const end=clock(body.quietEnd,'2000-01-01','quiet end');
      if((start===null)!==(end===null)||(start!==null&&start===end))
        throw fail(400,'Quiet hours require different start and end times, or both empty');
      const {rows}=await query(NOTIFICATION_QUIET_SAVE_SQL,[uid,zone,start,end]);
      return json({quietStart:rows[0].quietStart,quietEnd:rows[0].quietEnd},200,hdr);
    }
    if(path==='/v1/notification-preferences'){
      if(req.method==='GET'){
        const {rows}=await query(NOTIFICATION_PREF_GET_SQL,[uid]);
        return json({timeZone:rows[0]?.timeZone??null,quietStart:rows[0]?.quietStart??null,quietEnd:rows[0]?.quietEnd??null,publicKey:PUSH_PUBLIC_KEY},200,hdr);
      }
      if(req.method==='PUT'){
        const body=await readBody(req);
        const zone=alertZone(body.timeZone);
        const {rows}=await query(NOTIFICATION_PREF_SAVE_SQL,[uid,zone]);
        return json({timeZone:rows[0].timeZone,publicKey:PUSH_PUBLIC_KEY},200,hdr);
      }
      return json({error:'Method not allowed'},405,{...hdr,allow:'GET,PUT,OPTIONS'});
    }
    if(path==='/v1/push-subscription/status'){
      if(req.method!=='POST')return json({error:'Method not allowed'},405,{...hdr,allow:'POST,OPTIONS'});
      const body=await readBody(req,5000);
      const endpoint=pushEndpoint(body.endpoint);
      const {rows}=await query(PUSH_SUB_STATUS_SQL,[uid,endpoint]);
      return json({registered:rows.length>0},200,hdr);
    }
    if(path==='/v1/push-subscription'){
      if(req.method==='PUT'){
        const body=await readBody(req,5000);
        const endpoint=pushEndpoint(body.endpoint);
        const {rows}=await query(PUSH_SUB_SAVE_SQL,[uid,endpoint]);
        if(!rows.length)throw fail(409,'This browser push endpoint is already associated with another account. Refresh and retry.');
        return json({saved:true},200,hdr);
      }
      if(req.method==='DELETE'){
        const body=await readBody(req,5000);
        const endpoint=pushEndpoint(body.endpoint);
        await query(PUSH_SUB_DELETE_SQL,[uid,endpoint]);
        return json({removed:true},200,hdr);
      }
      return json({error:'Method not allowed'},405,{...hdr,allow:'PUT,DELETE,OPTIONS'});
    }
    if(path==='/v1/time-insights'){
      if(req.method!=='GET')return json({error:'Method not allowed'},405,{...hdr,allow:'GET,OPTIONS'});
      const params=new URL(req.url).searchParams;
      const period=params.get('period')??'week';
      const day=date(params.get('day'),'insights day');
      if(!['day','week','month'].includes(period)||!day||
         day<'2000-01-01'||day>'2100-12-31')
        throw fail(400,'Invalid time insights period or date');
      const {rows}=await query(TIME_INSIGHTS_SQL,[uid,period,day]);
      if(!rows[0])throw fail(503,'Time insights unavailable');
      return json({insights:rows[0]},200,hdr);
    }
    if(path==='/v1/time-report'){
      if(req.method!=='GET')return json({error:'Method not allowed'},405,{...hdr,allow:'GET,OPTIONS'});
      const params=new URL(req.url).searchParams;
      const period=params.get('period')??'week';
      const day=date(params.get('day'),'report day');
      if(!['day','week','month'].includes(period)||!day||
         day<'2000-01-01'||day>'2100-12-31')
        throw fail(400,'Invalid time report period or date');
      const {rows}=await query(TIME_PERIOD_REPORT_SQL,[uid,period,day]);
      if(!rows[0])throw fail(503,'Time report unavailable');
      return json({report:rows[0]},200,hdr);
    }
    if(path==='/v1/time-week'&&req.method==='GET'){
      const {rows}=await query(TIME_WEEK_SQL,[uid]);
      if(!rows[0])throw fail(503,'Weekly time unavailable');
      return json({week:rows[0]},200,hdr);
    }
    const goalRoute=/^\/v1\/time-week\/targets\/([a-f0-9-]{36})$/i.exec(path);
    if(goalRoute&&req.method==='PUT'){
      const id=uuid(goalRoute[1],'workspace');
      const body=await readBody(req,1500);
      const target=body.targetMinutes,rev=body.revision;
      if(!Number.isInteger(target)||target<0||target>10080||
        !Number.isInteger(rev)||rev<0||rev>2147483647)
        throw fail(400,'Invalid weekly target or revision');
      const {rows}=await query(TIME_WEEK_TARGET_SQL,[uid,id,target,rev]);
      if(!rows.length)throw fail(409,'Workspace or target changed. Refresh weekly goals.');
      return json({target:rows[0]},200,hdr);
    }
    if(path==='/v1/time-session'){
      if(req.method==='GET'){
        const {rows}=await query(TIME_ROLLUPS_SQL,[uid]);
        const row=rows[0];
        if(!row)throw fail(503,'Time rollups unavailable');
        const rollups={
          tasks:row.tasks,workspaces:row.workspaces,
          accountTotalMs:row.accountTotalMs,deletedTaskMs:row.deletedTaskMs,
          activeAncestorIds:row.activeAncestorIds
        };
        return json({session:row.session??null,
          taskTotals:row.tasks.map(task=>({taskId:task.taskId,totalMs:task.directMs})),
          rollups},200,hdr);
      }
      if(req.method==='POST'){
        const body=await readBody(req,3000);
        const action=body.action;
        if(!['start','pause','resume','stop','switch'].includes(action))throw fail(400,'Invalid time action');
        const sessionId=uuid(body.sessionId,'session');
        const taskId=action==='start'||action==='switch'?uuid(body.taskId,'task'):null;
        const previousId=action==='switch'?uuid(body.previousId,'previous session'):null;
        const rev=action==='start'?0:body.revision;
        if(!Number.isSafeInteger(rev)||rev<(action==='start'?0:1)||rev>2147483647)
          throw fail(400,'Invalid session revision');
        if(action==='switch'&&sessionId===previousId)throw fail(400,'Switch requires a new session');
        try{
          const {rows}=await query(TIME_TRANSITION_SQL,[uid,action,sessionId,taskId,rev,previousId]);
          if(!rows[0]?.session)throw fail(503,'Time session unavailable');
          return json({session:rows[0].session},action==='start'||action==='switch'?201:200,hdr);
        }catch(error){
          if(error?.code==='40001')throw fail(409,'Timer changed on another device or the task is unavailable. Refresh timer and retry.');
          throw error;
        }
      }
      return json({error:'Method not allowed'},405,{...hdr,allow:'GET,POST,OPTIONS'});
    }
    // One account-wide inbox response, so notes do not add a browser round trip.
    if(path==='/v1/alerts/combined'){
      if(req.method!=='GET')return json({error:'Method not allowed'},405,{...hdr,allow:'GET,OPTIONS'});
      const zone=alertZone(new URL(req.url).searchParams.get('timeZone')||'');
      const [{rows:tasks},{rows:notes}]=await Promise.all([
        query(ALERT_LIST_SQL,[uid,zone]),query(NOTE_ALERT_LIST_SQL,[uid,zone])
      ]);
      const alerts=[...tasks,...notes].sort((a,b)=>
        new Date(a.dueAt).getTime()-new Date(b.dueAt).getTime()||
        String(a.taskId||a.noteId).localeCompare(String(b.taskId||b.noteId))
      ).slice(0,100);
      return json({alerts,timeZone:zone},200,hdr);
    }
    if(path==='/v1/alerts'){
      if(req.method==='GET'){
        const zone=alertZone(new URL(req.url).searchParams.get('timeZone')||'');
        const {rows}=await query(ALERT_LIST_SQL,[uid,zone]);
        return json({alerts:rows,timeZone:zone},200,hdr);
      }
      return json({error:'Method not allowed'},405,{...hdr,allow:'GET,OPTIONS'});
    }
    const alertId=/^\/v1\/alerts\/([a-f0-9-]{36})\/(reminder|deadline)$/i.exec(path);
    if(alertId){
      if(req.method!=='POST')return json({error:'Method not allowed'},405,{...hdr,allow:'POST,OPTIONS'});
      const body=await readBody(req);
      const id=uuid(alertId[1],'alert task'),kind=alertId[2].toLowerCase();
      const day=date(body.day,'alert date'),time=clock(body.time,day,'alert time');
      if(!day||!time)throw fail(400,'Invalid alert occurrence');
      if(!Number.isSafeInteger(body.revision)||body.revision<0)throw fail(400,'Invalid alert revision');
      if(!['acknowledge','snooze','reset'].includes(body.action))throw fail(400,'Invalid alert action');
      let until=null;
      if(body.action==='snooze'){
        if(typeof body.until!=='string'||!/^\d{4}-\d\d-\d\dT/.test(body.until)||!/[Zz]|[+-]\d\d:\d\d$/.test(body.until))throw fail(400,'Invalid snooze time');
        until=new Date(body.until);
        if(!Number.isFinite(until.valueOf())||until.valueOf()<=Date.now()||until.valueOf()>Date.now()+30*86400000)throw fail(400,'Snooze must be within 30 days');
        until=until.toISOString();
      }else if(body.until!==undefined&&body.until!==null)throw fail(400,'Unexpected snooze time');
      const {rows}=await query(ALERT_ACTION_SQL,[uid,id,kind,day,time,body.revision,body.action,until]);
      return json({revision:Number(rows[0].revision)},200,hdr);
    }
    const noteAlertId=/^\/v1\/note-alerts\/([a-f0-9-]{36})$/i.exec(path);
    if(noteAlertId){
      if(req.method!=='POST')return json({error:'Method not allowed'},405,{...hdr,allow:'POST,OPTIONS'});
      const body=await readBody(req);
      const id=uuid(noteAlertId[1],'alert note');
      const day=date(body.day,'alert date'),time=clock(body.time,day,'alert time');
      if(!day||!time)throw fail(400,'Invalid note alert occurrence');
      if(!Number.isSafeInteger(body.revision)||body.revision<0)throw fail(400,'Invalid alert revision');
      if(!['acknowledge','snooze','reset'].includes(body.action))throw fail(400,'Invalid alert action');
      let until=null;
      if(body.action==='snooze'){
        if(typeof body.until!=='string'||!/^\d{4}-\d\d-\d\dT/.test(body.until)||!/[Zz]|[+-]\d\d:\d\d$/.test(body.until))throw fail(400,'Invalid snooze time');
        until=new Date(body.until);
        if(!Number.isFinite(until.valueOf())||until.valueOf()<=Date.now()||until.valueOf()>Date.now()+30*86400000)throw fail(400,'Snooze must be within 30 days');
        until=until.toISOString();
      }else if(body.until!==undefined&&body.until!==null)throw fail(400,'Unexpected snooze time');
      try{
       const {rows}=await query(NOTE_ALERT_ACTION_SQL,[uid,id,day,time,body.revision,body.action,until]);
       return json({revision:Number(rows[0].revision)},200,hdr);
      }catch(error){
       if(error?.code==='40001')throw fail(409,'Note reminder changed or unavailable. Refresh alerts.');
       throw error;
      }
    }
    const timedId=/^\/v1\/timed-intervals\/([a-f0-9-]{36})$/i.exec(path);
    if(timedId){
      const id=uuid(timedId[1],'interval ID');
      if(req.method==='PUT'){
        const [task,day,start,end,zone,rev]=scheduleBody(await readBody(req));
        const {rows}=await query(TIMED_SAVE_SQL,[uid,id,task,day,start,end,zone,rev]);
        const pad=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
        return json({interval:{id,taskId:task,day,start:pad(start),end:pad(end),timeZone:zone,revision:Number(rows[0].revision)}},rev===0?201:200,hdr);
      }
      if(req.method==='DELETE'){
        const body=await readBody(req);
        if(!Number.isSafeInteger(body.revision)||body.revision<1)throw fail(400,'Invalid interval revision');
        const {rows}=await query(TIMED_DELETE_SQL,[uid,id,body.revision]);
        if(!rows.length)throw fail(409,'Timed block changed or no longer exists');
        return json({removed:true},200,hdr);
      }
      return json({error:'Method not allowed'},405,{...hdr,allow:'PUT,DELETE,OPTIONS'});
    }
    const poolMatch=/^\/v1\/daily-pool\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/.exec(path);
    if(poolMatch){
      const day=date(poolMatch[1],'plan date');
      if(day<'2000-01-01'||day>'2100-12-31')throw fail(400,'Invalid planning date');
      if(req.method==='GET'){
        const {rows}=await query(DAY_POOL_GET_SQL,[uid,day]);
        return json({day,revision:Number(rows?.[0]?.revision??0),taskIds:rows?.[0]?.taskIds??[]},200,hdr);
      }
      if(req.method==='PUT'){
        const body=await readBody(req);
        const expected=body.revision;
        if(!Number.isSafeInteger(expected)||expected<0)throw fail(400,'Invalid pool revision');
        const ids=body.taskIds;
        if(!Array.isArray(ids)||ids.length>100)throw fail(400,'Daily pool must contain at most 100 tasks');
        ids.forEach(id=>uuid(id,'task id'));
        if(new Set(ids.map(id=>id.toLowerCase())).size!==ids.length)throw fail(400,'Duplicate daily pool task');
        const {rows}=await query(DAY_POOL_PUT_SQL,[uid,day,expected,ids]);
        return json({day,revision:Number(rows[0].revision),taskIds:ids},200,hdr);
      }
      return json({error:'Method not allowed'},405,{...hdr,allow:'GET,PUT,OPTIONS'});
    }
    // No unreviewed binary upload or public attachment transport is available.
    // Reject before reading request bodies; account auth already ran above.
    const documentAttachment=/^\/v1\/documents\/([a-f0-9-]{36})\/attachments$/i.exec(path);
    if(documentAttachment)
      return json({error:'Document file uploads are unavailable until private storage and scanning are approved'},415,hdr);
    // M6.3: search is authenticated, bounded and returns metadata only.
    // Document content may match, but must not leak into the result snippet.
    if(path==='/v1/documents/search'){
      if(req.method!=='GET')return json({error:'Method not allowed'},405,{...hdr,allow:'GET,OPTIONS'});
      const params=new URL(req.url).searchParams;
      const q=params.get('q')?.trim()??'';
      const limit=Number(params.get('limit')??50),offset=Number(params.get('offset')??0);
      if(q.length<2||q.length>120||q.includes('\0')||
         !Number.isSafeInteger(limit)||limit<1||limit>100||
         !Number.isSafeInteger(offset)||offset<0||offset>1000000)
        throw fail(400,'Invalid document search');
      const workspace=params.get('workspace')?uuid(params.get('workspace'),'document workspace'):null;
      const taskId=params.get('taskId')?uuid(params.get('taskId'),'document task'):null;
      const {rows}=await query(DOCUMENT_SEARCH_SQL,[uid,workspace,taskId,q,limit+1,offset]);
      return json({documents:rows.slice(0,limit),nextOffset:rows.length>limit?offset+limit:null},200,hdr);
    }
    // A single-document JSON export never creates a public download URL.
    const docExport=/^\/v1\/documents\/([a-f0-9-]{36})\/export$/i.exec(path);
    if(docExport){
      if(req.method!=='GET')return json({error:'Method not allowed'},405,{...hdr,allow:'GET,OPTIONS'});
      const id=uuid(docExport[1],'document ID');
      const {rows}=await query(DOCUMENT_DETAIL_SQL,[uid,id]);
      if(!rows.length)throw fail(404,'Document unavailable');
      return new Response(JSON.stringify({schema:'dayframe.document.export.v1',
        exportedAt:new Date().toISOString(),document:rows[0]}),{
       status:200,headers:{...hdr,'content-type':'application/json; charset=utf-8',
        'content-disposition':'attachment; filename="dayframe-document.json"'}
      });
    }
    // Private documents: no public URLs or document-content search endpoints.
    if(path==='/v1/documents/trash'&&req.method==='GET'){
      const params=new URL(req.url).searchParams;
      const limit=Number(params.get('limit')??50),offset=Number(params.get('offset')??0);
      if(!Number.isSafeInteger(limit)||limit<1||limit>100||
       !Number.isSafeInteger(offset)||offset<0||offset>1000000)
       throw fail(400,'Invalid document pagination');
      const {rows}=await query(DOCUMENT_TRASH_SQL,[uid,limit+1,offset]);
      return json({documents:rows.slice(0,limit),nextOffset:rows.length>limit?offset+limit:null},200,hdr);
    }
    const docRestore=/^\/v1\/documents\/([a-f0-9-]{36})\/restore$/i.exec(path);
    if(docRestore&&req.method==='POST'){
      const id=uuid(docRestore[1],'document ID'),rev=revision(await readBody(req,1500));
      const {rows}=await query(DOCUMENT_RESTORE_SQL,[uid,id,rev]);
      if(!rows.length)throw fail(409,'Document changed or its workspace is unavailable');
      return json({document:rows[0]},200,hdr);
    }
    if(path==='/v1/documents'){
      if(req.method==='GET'){
       const params=new URL(req.url).searchParams;
       const limit=Number(params.get('limit')??50),offset=Number(params.get('offset')??0);
       if(!Number.isSafeInteger(limit)||limit<1||limit>100||
        !Number.isSafeInteger(offset)||offset<0||offset>1000000)
        throw fail(400,'Invalid document pagination');
       const workspace=params.get('workspace')?uuid(params.get('workspace'),'document workspace'):null;
       const taskId=params.get('taskId')?uuid(params.get('taskId'),'document task'):null;
       const {rows}=await query(DOCUMENT_LIST_SQL,[uid,workspace,taskId,limit+1,offset]);
       return json({documents:rows.slice(0,limit),nextOffset:rows.length>limit?offset+limit:null},200,hdr);
      }
      if(req.method==='POST'){
       const body=await readBody(req,220000);
       const id=uuid(body.id,'document ID'),args=documentBody(body);
       if(id===args[2])throw fail(400,'Document cannot be its own parent');
       let rows;
       try{({rows}=await query(DOCUMENT_INSERT_SQL,[uid,id,...args]));}
       catch(error){if(['23514','23503','23505'].includes(error?.code))
        throw fail(409,'Document workspace, task or parent unavailable');throw error;}
       if(rows.length)return json({document:rows[0]},201,hdr);
       const existing=await query(DOCUMENT_DETAIL_SQL,[uid,id]);
       if(existing.rows.length&&matchesDocument(existing.rows[0],args))
        return json({document:existing.rows[0]},200,hdr);
       throw fail(409,'Document ID already used or workspace unavailable');
      }
      return json({error:'Method not allowed'},405,{...hdr,allow:'GET,POST,OPTIONS'});
    }
    const documentId=/^\/v1\/documents\/([a-f0-9-]{36})$/i.exec(path);
    if(documentId){
      const id=uuid(documentId[1],'document ID');
      if(req.method==='GET'){
       const {rows}=await query(DOCUMENT_DETAIL_SQL,[uid,id]);
       if(!rows.length)throw fail(404,'Document unavailable');
       return json({document:rows[0]},200,hdr);
      }
      if(req.method==='PATCH'){
       const body=await readBody(req,220000),args=documentBody(body),rev=revision(body);
       if(id===args[2])throw fail(400,'Document cannot be its own parent');
       let rows;
       try{({rows}=await query(DOCUMENT_UPDATE_SQL,[uid,id,...args,rev]));}
       catch(error){if(['23514','23503'].includes(error?.code))
        throw fail(409,'Document hierarchy or attachment conflict');throw error;}
       if(!rows.length)throw fail(409,'Document changed or workspace unavailable. Refresh.');
       return json({document:rows[0]},200,hdr);
      }
      if(req.method==='DELETE'){
       const rev=revision(await readBody(req,1500));
       const {rows}=await query(DOCUMENT_DELETE_SQL,[uid,id,rev]);
       if(!rows.length)throw fail(409,'Document changed or has undeleted child documents');
       return json({removed:true},200,hdr);
      }
      return json({error:'Method not allowed'},405,{...hdr,allow:'GET,PATCH,DELETE,OPTIONS'});
    }
    if(path==='/v1/notes/trash'&&req.method==='GET'){
      const params=new URL(req.url).searchParams;
      const limit=Number(params.get('limit')??100),offset=Number(params.get('offset')??0);
      if(!Number.isSafeInteger(limit)||limit<1||limit>200||
       !Number.isSafeInteger(offset)||offset<0||offset>1000000)
        throw fail(400,'Invalid note pagination');
      const {rows}=await query(NOTES_TRASH_SQL,[uid,limit+1,offset]);
      return json({notes:rows.slice(0,limit),nextOffset:rows.length>limit?offset+limit:null},200,hdr);
    }
    const noteRestore=/^\/v1\/notes\/([a-f0-9-]{36})\/restore$/i.exec(path);
    if(noteRestore&&req.method==='POST'){
      const id=uuid(noteRestore[1],'note ID'),rev=revision(await readBody(req,1500));
      const {rows}=await query(NOTE_RESTORE_SQL,[uid,id,rev]);
      if(!rows.length)throw fail(409,'Deleted note changed or its workspace is unavailable');
      return json({note:rows[0]},200,hdr);
    }
    if(path==='/v1/notes'&&req.method==='GET'){
      const params=new URL(req.url).searchParams;
      const limit=Number(params.get('limit')??100),offset=Number(params.get('offset')??0);
      if(!Number.isSafeInteger(limit)||limit<1||limit>200||
       !Number.isSafeInteger(offset)||offset<0||offset>1000000)
        throw fail(400,'Invalid note pagination');
      const {rows}=await query(NOTES_LIST_SQL,[uid,limit+1,offset]);
      return json({notes:rows.slice(0,limit),nextOffset:rows.length>limit?offset+limit:null},200,hdr);
    }
    if(path==='/v1/notes'&&req.method==='POST'){
      const body=await readBody(req);
      const id=uuid(body.id,'note ID'),args=noteBody(body);
      const {rows}=await query(NOTE_INSERT_SQL,[uid,id,...args]);
      if(rows.length)return json({note:rows[0]},201,hdr);
      const existing=await query(NOTE_BY_ID_SQL,[uid,id]);
      if(existing.rows.length&&matchesNote(existing.rows[0],args))
        return json({note:existing.rows[0]},200,hdr);
      throw fail(409,'Note ID already used or workspace unavailable');
    }
    const noteConvert=/^\/v1\/notes\/([a-f0-9-]{36})\/convert$/i.exec(path);
    if(noteConvert&&req.method==='POST'){
      const id=uuid(noteConvert[1],'note ID'),body=await readBody(req,1500);
      const taskId=uuid(body.taskId,'converted task ID'),rev=revision(body);
      const estimate=body.estimate??30;
      if(!Number.isSafeInteger(estimate)||estimate<1||estimate>100000)
        throw fail(400,'Invalid converted task estimate');
      try{await query(NOTE_CONVERT_SQL,[uid,id,rev,taskId,estimate]);}
      catch(error){if(error?.code==='40001'||error?.code==='23505')
        throw fail(409,'Note changed, was converted or task ID reused. Refresh notes.');throw error;}
      const {rows}=await query(TASK_BY_ID,[uid,taskId]);
      if(!rows.length)throw fail(409,'Converted task unavailable');
      const note=await query(NOTE_BY_ID_SQL,[uid,id]);
      return json({task:rows[0],note:note.rows[0]},200,hdr);
    }
    const notePath=/^\/v1\/notes\/([a-f0-9-]{36})$/i.exec(path);
    if(notePath&&req.method==='PATCH'){
      const id=uuid(notePath[1],'note ID'),body=await readBody(req),
        args=noteBody(body),rev=revision(body);
      const {rows}=await query(NOTE_UPDATE_SQL,[uid,id,...args,rev]);
      if(!rows.length)throw fail(409,'Note changed or workspace unavailable. Refresh notes.');
      return json({note:rows[0]},200,hdr);
    }
    if(notePath&&req.method==='DELETE'){
      const id=uuid(notePath[1],'note ID'),rev=revision(await readBody(req,1500));
      const {rows}=await query(NOTE_DELETE_SQL,[uid,id,rev]);
      if(!rows.length)throw fail(409,'Note changed on another device. Refresh notes.');
      return json({deleted:true},200,hdr);
    }
    if(path==='/v1/tasks'&&req.method==='GET'){
      const params=new URL(req.url).searchParams;
      const offset=Number(params.get('offset')??0),limit=Number(params.get('limit')??100);
      if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>200)throw fail(400,'Invalid pagination');
      const {rows}=await query(TASK_LIST,[uid,limit+1,offset]);
      return json({tasks:rows.slice(0,limit),nextOffset:rows.length>limit?offset+limit:null},200,hdr);
    }
    if(path==='/v1/tasks/archived'&&req.method==='GET'){
      const params=new URL(req.url).searchParams;
      const offset=Number(params.get('offset')??0),limit=Number(params.get('limit')??100);
      if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>200)throw fail(400,'Invalid pagination');
      const {rows}=await query(TASK_ARCHIVED,[uid,limit+1,offset]);
      return json({tasks:rows.slice(0,limit),nextOffset:rows.length>limit?offset+limit:null},200,hdr);
    }
    if(path==='/v1/tasks/trash'&&req.method==='GET'){
      const params=new URL(req.url).searchParams;
      const offset=Number(params.get('offset')??0),limit=Number(params.get('limit')??100);
      if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>200)throw fail(400,'Invalid pagination');
      const {rows}=await query(TASK_TRASH,[uid,limit+1,offset]);
      return json({tasks:rows.slice(0,limit),nextOffset:rows.length>limit?offset+limit:null},200,hdr);
    }
    if(path==='/v1/tasks'&&req.method==='POST'){
      const body=await readBody(req);
      const id=uuid(body.id,'task id'),args=taskBody(body);
      const {rows}=await query(TASK_INSERT,[uid,id,...args]);
      if(rows.length)return json({task:rows[0]},201,hdr);
      const existing=await query(TASK_BY_ID,[uid,id]);
      if(existing.rows.length&&matchesTask(existing.rows[0],args))return json({task:existing.rows[0]},200,hdr);
      throw fail(409,'Task id already exists or workspace unavailable');
    }
    const mediaPath=/^\/v1\/tasks\/([a-f0-9-]{36})\/media(?:\/(cover|avatar))?$/i.exec(path);
    if(mediaPath){
      const id=uuid(mediaPath[1],'task id'),slot=mediaPath[2]||null;
      const owned=" FROM dayframe.task_media m JOIN dayframe.tasks t ON t.id=m.task_id AND t.owner_user_id=m.owner_user_id "+
        "JOIN dayframe.workspaces w ON w.id=t.workspace_id AND w.owner_user_id=$1 "+
        "WHERE m.owner_user_id=$1 AND m.task_id=$2 AND t.deleted_at IS NULL AND t.archived_at IS NULL AND w.deleted_at IS NULL AND w.archived_at IS NULL";
      if(!slot&&req.method==='GET'){
        const {rows}=await query("SELECT m.slot,m.mime,encode(m.image_bytes,'base64') AS base64,m.focal_y AS \"focalY\""+owned,[uid,id]);
        return json({images:rows.map(row=>({slot:row.slot,data:'data:'+row.mime+';base64,'+row.base64,focalY:row.focalY}))},200,hdr);
      }
      if(slot&&req.method==='PUT'){
        const body=await readBody(req,265000);
        if(typeof body.data!=='string')throw fail(400,'Invalid image data');
        const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.data);
        if(!match)throw fail(400,'Invalid supported image');
        const bytes=Buffer.from(match[2],'base64');
        if(bytes.length<16||bytes.length>180000||bytes.toString('base64')!==match[2])throw fail(413,'Image must be under 180 KB');
        const mime=match[1],focal=Number(body.focalY??50);
        if(!Number.isInteger(focal)||focal<0||focal>100)throw fail(400,'Invalid image position');
        const isPng=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
        const isJpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
        const isWebp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
        if(!({ 'image/png':isPng,'image/jpeg':isJpeg,'image/webp':isWebp})[mime])throw fail(400,'Image content does not match file type');
        const sql="INSERT INTO dayframe.task_media(task_id,owner_user_id,slot,mime,image_bytes,focal_y) "+
          "SELECT t.id,$1,$3,$4,decode($5,'base64'),$6 FROM dayframe.tasks t JOIN dayframe.workspaces w ON w.id=t.workspace_id AND w.owner_user_id=$1 "+
          "WHERE t.id=$2 AND t.owner_user_id=$1 AND t.deleted_at IS NULL AND t.archived_at IS NULL AND w.deleted_at IS NULL AND w.archived_at IS NULL "+
          "ON CONFLICT(task_id,slot) DO UPDATE SET mime=EXCLUDED.mime,image_bytes=EXCLUDED.image_bytes,focal_y=EXCLUDED.focal_y,updated_at=now() "+
          "WHERE dayframe.task_media.owner_user_id=EXCLUDED.owner_user_id RETURNING slot";
        const {rows}=await query(sql,[uid,id,slot,mime,match[2],focal]);
        if(!rows.length)throw fail(404,'Task not found or unavailable');
        return json({saved:true,slot},200,hdr);
      }
      if(slot&&req.method==='PATCH'){
        const body=await readBody(req),focal=Number(body.focalY);
        if(!Number.isInteger(focal)||focal<0||focal>100)throw fail(400,'Invalid image position');
        const {rows}=await query("UPDATE dayframe.task_media m SET focal_y=$4,updated_at=now() FROM dayframe.tasks t WHERE m.task_id=$2 AND m.owner_user_id=$1 AND m.slot=$3 AND t.id=m.task_id AND t.owner_user_id=$1 AND t.deleted_at IS NULL AND t.archived_at IS NULL RETURNING m.slot",[uid,id,slot,focal]);
        if(!rows.length)throw fail(404,'Image not found');
        return json({saved:true},200,hdr);
      }
      if(slot&&req.method==='DELETE'){
        const {rows}=await query("DELETE FROM dayframe.task_media m USING dayframe.tasks t WHERE m.task_id=$2 AND m.owner_user_id=$1 AND m.slot=$3 AND t.id=m.task_id AND t.owner_user_id=$1 RETURNING m.slot",[uid,id,slot]);
        if(!rows.length)throw fail(404,'Image not found');
        return json({removed:true},200,hdr);
      }
      return json({error:'Method not allowed'},405,hdr);
    }
    const taskAction=/^\/v1\/tasks\/([a-f0-9-]{36})\/(archive|unarchive|move|events|permanent)$/i.exec(path);
    if(taskAction){
      const id=uuid(taskAction[1],'task id'),action=taskAction[2];
      if(action==='events'&&req.method==='GET'){
        const limit=Number(new URL(req.url).searchParams.get('limit')??50);
        if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw fail(400,'Invalid event limit');
        const {rows}=await query(TASK_HISTORY,[uid,id,limit]);
        return json({events:rows},200,hdr);
      }
      if((action==='archive'||action==='unarchive')&&req.method==='POST'){
        const rev=revision(await readBody(req)),archive=action==='archive';
        const sql=taskSubtreeUpdate('archived_at',archive?'root.deleted_at IS NULL AND root.archived_at IS NULL':'root.deleted_at IS NULL AND root.archived_at IS NOT NULL',
          'AND t.deleted_at IS NULL','rows');
        const {rows}=await query(sql,[uid,id,rev,archive]);
        const root=rows.find(row=>row.id===id);
        if(!root)throw fail(409,'Task changed or unavailable');
        return json({task:root,affected:rows.length},200,hdr);
      }
      if(action==='move'&&req.method==='POST'){
        const body=await readBody(req),rev=revision(body);
        const target=uuid(body.workspace,'destination workspace'),parent=body.parent==null?null:uuid(body.parent,'new parent');
        await query("SELECT dayframe.move_task_subtree($1,$2,$3,$4,$5)",[uid,id,target,parent,rev]);
        const {rows}=await query("SELECT "+TASK_FIELDS+" FROM dayframe.tasks WHERE owner_user_id=$1 AND id=$2",[uid,id]);
        if(!rows.length)throw fail(409,'Task changed or unavailable');
        return json({task:rows[0]},200,hdr);
      }
      if(action==='permanent'&&req.method==='DELETE'){
        const body=await readBody(req),rev=revision(body);
        if(body.confirm!=='DELETE')throw fail(400,'Type DELETE to confirm permanent removal');
        const {rows}=await query("DELETE FROM dayframe.tasks t WHERE t.owner_user_id=$1 AND t.id=$2 AND t.revision=$3 AND t.deleted_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dayframe.tasks child WHERE child.parent_id=t.id AND child.owner_user_id=$1) RETURNING t.id",[uid,id,rev]);
        if(!rows.length)throw fail(409,'Task not in Trash, changed or has subtasks');
        return json({permanentlyDeleted:true},200,hdr);
      }
      return json({error:'Method not allowed'},405,hdr);
    }
    const tm=/^\/v1\/tasks\/([a-f0-9-]{36})$/i.exec(path);
    if(tm&&req.method==='PATCH'){
      const id=uuid(tm[1],'task id'),body=await readBody(req),args=taskBody(body),rev=revision(body);
      if(body.status==='done'&&!body.allowOpenChildren){
        const {rows:children}=await query("WITH RECURSIVE descendants AS (SELECT id,parent_id,ARRAY[id] AS path FROM dayframe.tasks WHERE parent_id=$2 AND owner_user_id=$1 AND deleted_at IS NULL AND archived_at IS NULL UNION ALL SELECT t.id,t.parent_id,d.path||t.id FROM dayframe.tasks t JOIN descendants d ON t.parent_id=d.id WHERE t.owner_user_id=$1 AND t.deleted_at IS NULL AND t.archived_at IS NULL AND NOT t.id=ANY(d.path)) SELECT 1 FROM descendants d JOIN dayframe.tasks t ON t.id=d.id WHERE t.status='open' LIMIT 1",[uid,id]);
        if(children.length)throw fail(409,'Finish or explicitly keep open subtasks before completing this task');
      }
      if(body.allowOpenChildren!==undefined&&typeof body.allowOpenChildren!=='boolean')throw fail(400,'Invalid subtask completion option');
      const {rows}=await query(TASK_UPDATE,[uid,id,...args,rev]);
      if(!rows.length)throw fail(409,'Task changed or workspace unavailable');
      return json({task:rows[0]},200,hdr);
    }
    if(tm&&req.method==='DELETE'){
      const id=uuid(tm[1],'task id'),rev=revision(await readBody(req));
      // The caller's previously observed revision belongs in the root CTE.
      // A read-then-delete using the newest server revision silently trashes
      // another device's recent edit.
      const {rows}=await query(TASK_TRASH_SQL,[uid,id,rev]);
      if(!rows.some(row=>row.id===id))throw fail(409,'Task changed on another device. Refresh before moving it to Trash.');
      return json({deleted:true},200,hdr);
    }
    const restore=/^\/v1\/tasks\/([a-f0-9-]{36})\/restore$/i.exec(path);
    if(restore&&req.method==='POST'){
      const id=uuid(restore[1],'task id'),rev=revision(await readBody(req));
      const {rows}=await query(TASK_RESTORE_SQL,[uid,id,rev,false]);
      const root=rows.find(row=>row.id===id);
      if(!root)throw fail(409,'Task changed on another device. Refresh Trash before restoring.');
      return json({task:root,affected:rows.length},200,hdr);
    }
    if(['GET','POST','PATCH','DELETE'].includes(req.method))return json({error:'Not found'},404,hdr);
    return json({error:'Method not allowed'},405,hdr);
  }catch(error){
    if(error?.status)return json({error:error.message},error.status,hdr);
    if(error?.code==='23P01')return json({error:'This time overlaps another scheduled block. Choose a free interval.'},409,hdr);
    if(error?.code==='40001')return json({error:'This schedule was changed elsewhere. Refresh and try again.'},409,hdr);
    if(['23503','23505'].includes(error?.code))return json({error:'Task unavailable or schedule conflict'},409,hdr);
    if(error?.code==='23514'&&String(error.message||'').includes('same time zone'))return json({error:'All timed blocks on one date must use the same time zone.'},400,hdr);
    if(['23514','22001','22007','22008'].includes(error?.code))return json({error:'Invalid task or workspace fields'},400,hdr);
    // Never leak SQL, credentials, user identity or data through errors/logs.
    console.error('Dayframe data request failed',error instanceof Error?error.name:'UnknownError');
    return json({error:'Data service unavailable'},503,hdr);
  }
}};
}
export default createHandler();
