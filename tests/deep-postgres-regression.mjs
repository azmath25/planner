// Runs against an ephemeral PostgreSQL service in GitHub Actions, never Neon.
// Applies the actual Dayframe migrations and imports the actual API SQL.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {TASK_TRASH_SQL,TASK_RESTORE_SQL,TIMED_SAVE_SQL,ALERT_ACTION_SQL,PUSH_SUB_SAVE_SQL,TIME_ROLLUPS_SQL,TIME_WEEK_SQL,TIME_WEEK_TARGET_SQL,NOTE_INSERT_SQL,NOTE_UPDATE_SQL,NOTE_DELETE_SQL,NOTE_RESTORE_SQL,NOTES_TRASH_SQL,NOTE_CONVERT_SQL,NOTE_BY_ID_SQL,NOTE_ALERT_LIST_SQL,NOTE_ALERT_ACTION_SQL,DOCUMENT_INSERT_SQL,DOCUMENT_UPDATE_SQL,DOCUMENT_DELETE_SQL,DOCUMENT_DETAIL_SQL,TIME_INSIGHTS_SQL} from '../backend/src/index.mjs';
import {NOTE_CLAIM_SQL,NOTE_ELIGIBLE_SQL} from '../backend/src/reminder-dispatch.mjs';
import {TIME_PERIOD_REPORT_SQL} from '../backend/src/time-period-report.mjs';
const connectionString=process.env.PG_AUDIT_URL;
if(!connectionString)throw Error('PG_AUDIT_URL is required. Never point this suite at Neon or production.');
if(!/^(postgres(?:ql)?):\/\/audit:/.test(connectionString)||!connectionString.includes('127.0.0.1:5432/dayframe_audit'))
 throw Error('Refusing non-ephemeral database.');
const pool=new pg.Pool({connectionString,max:10});
const A='audit-user-a',B='audit-user-b',C='audit-user-c';
const WS_A='a1111111-1111-4111-8111-111111111111';
const WS_B='b1111111-1111-4111-8111-111111111111';
const WS_C='c1111111-1111-4111-8111-111111111111';
const T_A='a2222222-2222-4222-8222-222222222222';
const T_B='b2222222-2222-4222-8222-222222222222';
const T_C='c2222222-2222-4222-8222-222222222222';
const CHILD='a3333333-3333-4333-8333-333333333333';
before(async()=>{
 for(let i=1;i<=20;i++){
  const name=String(i).padStart(4,'0');
  const {readdirSync}=await import('node:fs');
  const file=readdirSync('backend/db/migrations').find(f=>f.startsWith(name+'_')&&f.endsWith('.sql'));
  assert.ok(file,'Missing migration '+name);
  await pool.query(readFileSync('backend/db/migrations/'+file,'utf8'));
 }
 for(const [owner,workspace,task] of [[A,WS_A,T_A],[B,WS_B,T_B],[C,WS_C,T_C]]){
  await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'General','general')",[workspace,owner]);
  await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title) VALUES($1,$2,$3,'Audit task')",[task,owner,workspace]);
 }
 await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,parent_id,title) VALUES($1,$2,$3,$4,'Child task')",[CHILD,A,WS_A,T_A]);
});
after(async()=>{await pool.end();});
test('all twenty staged migrations execute without dependency errors',async()=>{
 const {rows}=await pool.query('SELECT version FROM dayframe.schema_migrations ORDER BY version');
 assert.equal(rows.length,20);
 assert.equal(rows[11].version,'0012_weekly_targets');
 assert.equal(rows[12].version,'0013_quick_notes');
 assert.equal(rows[13].version,'0014_quick_note_reminders');
 assert.equal(rows[14].version,'0015_notification_quiet_hours');
 assert.equal(rows[15].version,'0016_private_documents');
 assert.equal(rows[16].version,'0017_workspace_pins');
 assert.equal(rows[17].version,'0018_completion_insights_index');
 assert.equal(rows[18].version,'0019_task_document_move_guard');
 assert.equal(rows[19].version,'0020_requeue_notification_preferences');
});
test('stale revisions cannot trash or restore a parent or children',async()=>{
 const upd=await pool.query('UPDATE dayframe.tasks SET notes=$2,revision=revision+1 WHERE id=$1 RETURNING revision',[T_A,'Edited on another device']);
 assert.equal(upd.rows[0].revision,2);
 const stale=await pool.query(TASK_TRASH_SQL,[A,T_A,1]);
 assert.equal(stale.rows.length,0);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM dayframe.tasks WHERE owner_user_id=$1 AND deleted_at IS NOT NULL',[A])).rows[0].n,0);
 const valid=await pool.query(TASK_TRASH_SQL,[A,T_A,2]);
 assert.equal(valid.rows.length,2);
 const staleRestore=await pool.query(TASK_RESTORE_SQL,[A,T_A,2,false]);
 assert.equal(staleRestore.rows.length,0);
 const restored=await pool.query(TASK_RESTORE_SQL,[A,T_A,3,false]);
 assert.equal(restored.rows.length,2);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM dayframe.tasks WHERE owner_user_id=$1 AND deleted_at IS NOT NULL',[A])).rows[0].n,0);
});
test('cross-account task IDs fail in atomic day pool, interval and alert functions',async()=>{
 await assert.rejects(
  pool.query('SELECT dayframe.replace_daily_pool($1,$2::date,$3,$4::uuid[])',[A,'2026-11-07',0,[T_B]]),
  error=>error.code==='40001');
 await assert.rejects(pool.query(TIMED_SAVE_SQL,[A,'a4444444-4444-4444-8444-444444444444',T_B,'2026-11-07',540,600,'UTC',0]),
  error=>error.code==='23503');
 await assert.rejects(pool.query(ALERT_ACTION_SQL,[A,T_B,'reminder','2026-11-07','09:00',0,'acknowledge',null]),
  error=>error.code==='40001');
});
test('two concurrent workers cannot schedule overlapping intervals for the same owner',async()=>{
 const saves=[
  pool.query(TIMED_SAVE_SQL,[A,'a5555555-5555-4555-8555-555555555555',T_A,'2026-11-08',540,600,'UTC',0]),
  pool.query(TIMED_SAVE_SQL,[A,'a6666666-6666-4666-8666-666666666666',T_A,'2026-11-08',570,630,'UTC',0])
 ];
 const results=await Promise.allSettled(saves);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const failed=results.find(r=>r.status==='rejected');
 assert.equal(failed?.reason?.code,'23P01');
 const {rows}=await pool.query("SELECT count(*)::int AS n FROM dayframe.scheduled_intervals WHERE owner_user_id=$1 AND plan_day='2026-11-08'",[A]);
 assert.equal(rows[0].n,1);
 // A different owner's identical time block is independent.
 const ok=await pool.query(TIMED_SAVE_SQL,[B,'b6666666-6666-4666-8666-666666666666',T_B,'2026-11-08',540,600,'UTC',0]);
 assert.equal(Number(ok.rows[0].revision),1);
});
test('concurrent ack/snooze of the same alert creates one revision only',async()=>{
 await pool.query("UPDATE dayframe.tasks SET reminder='2026-11-07',reminder_time='09:00' WHERE id=$1",[T_A]);
 const future=new Date(Date.now()+3600000).toISOString();
 const rows=await Promise.allSettled([
  pool.query(ALERT_ACTION_SQL,[A,T_A,'reminder','2026-11-07','09:00',0,'acknowledge',null]),
  pool.query(ALERT_ACTION_SQL,[A,T_A,'reminder','2026-11-07','09:00',0,'snooze',future])
 ]);
 assert.equal(rows.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(rows.filter(r=>r.status==='rejected').length,1);
 assert.equal(rows.find(r=>r.status==='rejected')?.reason?.code,'40001');
 const actions=await pool.query('SELECT revision FROM dayframe.task_alert_actions WHERE owner_user_id=$1 AND task_id=$2',[A,T_A]);
 assert.equal(actions.rows.length,1);
 assert.equal(actions.rows[0].revision,1);
});
test('due delivery outbox enqueues once, even if the worker repeats',async()=>{
 await pool.query("UPDATE dayframe.tasks SET reminder=(now() AT TIME ZONE 'UTC')::date-1,reminder_time='12:00' WHERE id=$1",[T_C]);
 await pool.query("INSERT INTO dayframe.notification_preferences(owner_user_id,time_zone) VALUES($1,'UTC')",[C]);
 await pool.query("INSERT INTO dayframe.push_subscriptions(owner_user_id,endpoint) VALUES($1,$2)",[C,'https://fcm.googleapis.com/fcm/send/dayframe-ephemeral-integration-test']);
 const first=await pool.query('SELECT dayframe.enqueue_due_push(100) AS queued');
 const retry=await pool.query('SELECT dayframe.enqueue_due_push(100) AS queued');
 assert.equal(first.rows[0].queued,1);
 assert.equal(retry.rows[0].queued,0);
 const {rows}=await pool.query('SELECT owner_user_id,task_id,kind,status FROM dayframe.notification_deliveries');
 assert.equal(rows.length,1);
 assert.equal(rows[0].owner_user_id,C);
 assert.equal(rows[0].task_id,T_C);
 assert.equal(rows[0].kind,'reminder');
 assert.equal(rows[0].status,'pending');
});

test('push endpoint cannot be silently transferred between separate owners',async()=>{
 const endpoint='https://fcm.googleapis.com/fcm/send/dayframe-ephemeral-integration-test';
 const result=await pool.query(PUSH_SUB_SAVE_SQL,[B,endpoint]);
 assert.equal(result.rows.length,0);
 const check=await pool.query('SELECT owner_user_id FROM dayframe.push_subscriptions WHERE endpoint=$1',[endpoint]);
 assert.equal(check.rows.length,1);
 assert.equal(check.rows[0].owner_user_id,C);
 const sameOwner=await pool.query(PUSH_SUB_SAVE_SQL,[C,endpoint]);
 assert.equal(sameOwner.rows.length,1);
});


const OWNER_D='audit-user-m51';
const WSD='d1111111-1111-4111-8111-111111111111';
const TASK_D='d2222222-2222-4222-8222-222222222222';
const TASK_D2='d3333333-3333-4333-8333-333333333333';
const changeTime=(owner,action,id,task=null,revision=null,previous=null)=>
 pool.query('SELECT dayframe.transition_time_session($1,$2,$3,$4,$5,$6) AS session',
 [owner,action,id,task,revision,previous]).then(r=>r.rows[0].session);

test('M5.1 server clock: start, pause, resume and stop preserve segments and one active session',async()=>{
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'General','general')",[WSD,OWNER_D]);
 for(const [id,title] of [[TASK_D,'First timer task'],[TASK_D2,'Second timer task']])
  await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title) VALUES($1,$2,$3,$4)",[id,OWNER_D,WSD,title]);
 const sessionId='d4444444-4444-4444-8444-444444444444';
 const started=await changeTime(OWNER_D,'start',sessionId,TASK_D,0);
 assert.equal(started.id,sessionId);assert.equal(started.taskId,TASK_D);
 assert.equal(started.state,'running');assert.equal(started.revision,1);
 assert.ok(started.serverNow&&started.segmentStartedAt);
 assert.equal(started.accumulatedMs,0);
 await new Promise(resolve=>setTimeout(resolve,35));
 const paused=await changeTime(OWNER_D,'pause',sessionId,null,1);
 assert.equal(paused.state,'paused');assert.equal(paused.revision,2);
 assert.ok(paused.accumulatedMs>=0);assert.equal(paused.segmentStartedAt,null);
 const stillPaused=await changeTime(OWNER_D,'start',sessionId,TASK_D,0);
 assert.equal(stillPaused.state,'paused'); // Same UUID replay cannot start another session.
 await assert.rejects(changeTime(OWNER_D,'start','d5555555-5555-4555-8555-555555555555',TASK_D,0),
  error=>error.code==='40001');
 const resumed=await changeTime(OWNER_D,'resume',sessionId,null,2);
 assert.equal(resumed.state,'running');assert.equal(resumed.revision,3);
 assert.equal(resumed.accumulatedMs,paused.accumulatedMs);
 const stopped=await changeTime(OWNER_D,'stop',sessionId,null,3);
 assert.equal(stopped.state,'stopped');assert.equal(stopped.revision,4);
 assert.equal(stopped.endReason,'stopped');assert.ok(stopped.endedAt);
 assert.ok(stopped.accumulatedMs>=paused.accumulatedMs);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM dayframe.time_sessions WHERE owner_user_id=$1 AND state<>\'stopped\'',[OWNER_D])).rows[0].n,0);
 assert.equal((await pool.query('SELECT status FROM dayframe.tasks WHERE id=$1',[TASK_D])).rows[0].status,'open');
});
test('M5.1 cross-worker atomic start rejects a second active session and protects owner',async()=>{
 const one='d6666666-6666-4666-8666-666666666666';
 const two='d7777777-7777-4777-8777-777777777777';
 const results=await Promise.allSettled([
  changeTime(OWNER_D,'start',one,TASK_D,0),
  changeTime(OWNER_D,'start',two,TASK_D2,0)
 ]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.code,'40001');
 const winner=results.find(r=>r.status==='fulfilled').value;
 await assert.rejects(changeTime('some-other-owner','stop',winner.id,null,winner.revision),
  err=>err.code==='40001');
 const closed=await changeTime(OWNER_D,'stop',winner.id,null,winner.revision);
 assert.equal(closed.state,'stopped');
});
test('M5.1 atomic switch closes the former session and reopens on another task',async()=>{
 const priorId='d8888888-8888-4888-8888-888888888888',nextId='d9999999-9999-4999-8999-999999999999';
 const prior=await changeTime(OWNER_D,'start',priorId,TASK_D,0);
 assert.equal(prior.state,'running');
 const next=await changeTime(OWNER_D,'switch',nextId,TASK_D2,prior.revision,priorId);
 assert.equal(next.taskId,TASK_D2);assert.equal(next.state,'running');
 assert.equal((await pool.query('SELECT state,end_reason FROM dayframe.time_sessions WHERE id=$1',[priorId])).rows[0].end_reason,'switched');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM dayframe.time_sessions WHERE owner_user_id=$1 AND state IN (\'running\',\'paused\')',[OWNER_D])).rows[0].n,1);
 await assert.rejects(changeTime(OWNER_D,'pause',priorId,null,1),err=>err.code==='40001');
 const replay=await changeTime(OWNER_D,'switch',nextId,TASK_D2,prior.revision,priorId);
 assert.equal(replay.id,nextId);
 // Completing the task automatically closes its running stopwatch.
 await pool.query("UPDATE dayframe.tasks SET status='done' WHERE id=$1",[TASK_D2]);
 const ended=(await pool.query('SELECT state,end_reason,accumulated_ms FROM dayframe.time_sessions WHERE id=$1',[nextId])).rows[0];
 assert.equal(ended.state,'stopped');assert.equal(ended.end_reason,'task_closed');
 // Confirmed permanent delete keeps the historical time record by clearing
 // only its task reference; snapshot still describes the session.
 await pool.query('DELETE FROM dayframe.tasks WHERE id=$1',[TASK_D2]);
 const historical=(await pool.query('SELECT task_id,task_title_snapshot FROM dayframe.time_sessions WHERE id=$1',[nextId])).rows[0];
 assert.equal(historical.task_id,null);
 assert.equal(historical.task_title_snapshot,'Second timer task');
});
test('M5.1 concurrent pause/stop cannot double-count the active segment',async()=>{
 const id='daa11111-1111-4111-8111-111111111111';
 const started=await changeTime(OWNER_D,'start',id,TASK_D,0);
 const updates=await Promise.allSettled([
  changeTime(OWNER_D,'pause',id,null,started.revision),
  changeTime(OWNER_D,'stop',id,null,started.revision)
 ]);
 assert.equal(updates.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(updates.filter(r=>r.status==='rejected').length,1);
 assert.equal(updates.find(r=>r.status==='rejected').reason.code,'40001');
 const current=(await pool.query('SELECT state,revision,accumulated_ms FROM dayframe.time_sessions WHERE id=$1',[id])).rows[0];
 assert.equal(current.revision,2);assert.ok(Number(current.accumulated_ms)>=0);
 if(current.state==='paused')await changeTime(OWNER_D,'stop',id,null,2);
});

test('M5.1 concurrent task completion/start cannot leave a running timer on closed task',async()=>{
 const task='daabbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const session='daaccccc-cccc-4ccc-8ccc-cccccccccccc';
 await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title) VALUES($1,$2,$3,'Race task')",[task,OWNER_D,WSD]);
 const attempts=await Promise.allSettled([
  changeTime(OWNER_D,'start',session,task,0),
  pool.query("UPDATE dayframe.tasks SET status='done' WHERE id=$1",[task])
 ]);
 assert.equal(attempts[1].status,'fulfilled');
 if(attempts[0].status==='rejected')assert.equal(attempts[0].reason.code,'40001');
 const {rows}=await pool.query("SELECT count(*)::int AS n FROM dayframe.time_sessions WHERE owner_user_id=$1 AND task_id=$2 AND state IN ('running','paused')",[OWNER_D,task]);
 assert.equal(rows[0].n,0,'Completed task must not have an open time session');
});
test('M5.1 workspace archive closes running sessions and retains their historical record',async()=>{
 const workspace='daad1111-1111-4111-8111-111111111111',task='daad2222-2222-4222-8222-222222222222',
  session='daad3333-3333-4333-8333-333333333333';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Archived test','custom')",[workspace,OWNER_D]);
 await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title) VALUES($1,$2,$3,'Archive time test')",[task,OWNER_D,workspace]);
 assert.equal((await changeTime(OWNER_D,'start',session,task,0)).state,'running');
 await pool.query('UPDATE dayframe.workspaces SET archived_at=now() WHERE id=$1',[workspace]);
 const {rows}=await pool.query('SELECT state,end_reason,task_id FROM dayframe.time_sessions WHERE id=$1',[session]);
 assert.equal(rows[0].state,'stopped');
 assert.equal(rows[0].end_reason,'workspace_archived');
 assert.equal(rows[0].task_id,task);
});


test('M5.2 nested rollups include every descendant once and preserve all-time workspace ownership',async()=>{
 const owner='audit-m52';
 const workspace1='e5111111-1111-4111-8111-111111111111';
 const workspace2='e5222222-2222-4222-8222-222222222222';
 const root='e5333333-3333-4333-8333-333333333333';
 const child='e5444444-4444-4444-8444-444444444444';
 const grandchild='e5555555-5555-4555-8555-555555555555';
 const sibling='e5666666-6666-4666-8666-666666666666';
 const other='e5777777-7777-4777-8777-777777777777';
 const workspaceRows=[[workspace1,'General','general'],[workspace2,'Second','custom']];
 for(const [id,name,kind] of workspaceRows)
  await pool.query('INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,$3,$4)',[id,owner,name,kind]);
 for(const [id,workspace,parent,title] of [
  [root,workspace1,null,'Parent'],
  [child,workspace1,root,'Subtask'],
  [grandchild,workspace1,child,'Grandchild'],
  [sibling,workspace1,root,'Sibling'],
  [other,workspace2,null,'Other workspace task']
 ]){
  await pool.query('INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,parent_id,title) VALUES($1,$2,$3,$4,$5)',
   [id,owner,workspace,parent,title]);
 }
 const add=async(id,taskId,workspace,ms)=>pool.query(`
  INSERT INTO dayframe.time_sessions(
   id,owner_user_id,task_id,task_title_snapshot,workspace_id_snapshot,
   started_at,segment_started_at,accumulated_ms,state,revision,ended_at,end_reason)
  VALUES($1,$2,$3,'Time snapshot',$4,now()-interval '1 hour',
   NULL,$5,'stopped',2,now(),'stopped')`,
   [id,owner,taskId,workspace,ms]);
 for(const [id,task,workspace,ms] of [
  ['e5a11111-1111-4111-8111-111111111111',root,workspace1,1000],
  ['e5a22222-2222-4222-8222-222222222222',child,workspace1,2000],
  ['e5a33333-3333-4333-8333-333333333333',grandchild,workspace1,3000],
  ['e5a44444-4444-4444-8444-444444444444',sibling,workspace1,4000],
  ['e5a55555-5555-4555-8555-555555555555',other,workspace2,5000],
  ['e5a66666-6666-4666-8666-666666666666',null,workspace1,6000]
 ])await add(id,task,workspace,ms);

 const query=async (id=owner)=>(await pool.query(TIME_ROLLUPS_SQL,[id])).rows[0];
 let snapshot=await query();
 assert.equal(snapshot.accountTotalMs,'21000');
 assert.equal(snapshot.deletedTaskMs,'6000');
 const byTask=Object.fromEntries(snapshot.tasks.map(t=>[t.taskId,t]));
 assert.deepEqual(byTask[root],{taskId:root,directMs:'1000',totalMs:'10000'});
 assert.deepEqual(byTask[child],{taskId:child,directMs:'2000',totalMs:'5000'});
 assert.deepEqual(byTask[grandchild],{taskId:grandchild,directMs:'3000',totalMs:'3000'});
 assert.deepEqual(byTask[sibling],{taskId:sibling,directMs:'4000',totalMs:'4000'});
 assert.deepEqual(byTask[other],{taskId:other,directMs:'5000',totalMs:'5000'});
 const byWorkspace=Object.fromEntries(snapshot.workspaces.map(w=>[w.workspaceId,w.totalMs]));
 assert.deepEqual(byWorkspace,{[workspace1]:'16000',[workspace2]:'5000'});
 assert.equal(snapshot.tasks.reduce((n,t)=>n+Number(t.directMs),0),15000,
  'Direct recorded time counts each attached session exactly once');
 assert.equal(snapshot.tasks.reduce((n,t)=>n+Number(t.totalMs),0)>Number(snapshot.accountTotalMs),true,
  'Nested totals are for individual task displays and must not be summed globally');
 const outsider=await query('audit-m52-outsider');
 assert.deepEqual(outsider.tasks,[]);
 assert.deepEqual(outsider.workspaces,[]);
 assert.equal(outsider.accountTotalMs,'0');

 // A running leaf must appear in the ancestor list, but its unclosed segment
 // is not double-counted by the SQL snapshot; the browser adds only that
 // active segment using a monotonic clock.
 const activeId='e5a77777-7777-4777-8777-777777777777';
 await pool.query(`INSERT INTO dayframe.time_sessions
 (id,owner_user_id,task_id,task_title_snapshot,workspace_id_snapshot,
 started_at,segment_started_at,accumulated_ms,state,revision)
 VALUES($1,$2,$3,'Active descendant',$4,now(),now(),0,'running',1)`,
 [activeId,owner,grandchild,workspace1]);
 snapshot=await query();
 assert.equal(snapshot.session.id,activeId);
 assert.deepEqual(new Set(snapshot.activeAncestorIds),new Set([grandchild,child,root]));
 assert.equal(snapshot.accountTotalMs,'21000');
 await pool.query('SELECT dayframe.transition_time_session($1,$2,$3,$4,$5,$6)',[owner,'stop',activeId,null,1,null]);
 const closed=(await pool.query('SELECT accumulated_ms::text AS ms FROM dayframe.time_sessions WHERE id=$1',[activeId])).rows[0];
 const extra=Number(closed.ms);

 // Parent rollups follow CURRENT tree membership. Moving a completed
 // subtask beneath a different parent must not mutate any session record.
 await pool.query('UPDATE dayframe.tasks SET parent_id=NULL WHERE id=$1',[child]);
 snapshot=await query();
 const afterMove=Object.fromEntries(snapshot.tasks.map(t=>[t.taskId,t]));
 assert.equal(afterMove[root].totalMs,'5000');
 assert.equal(Number(afterMove[grandchild].totalMs),3000+extra);
 assert.equal(Number(afterMove[child].totalMs),5000+extra);
 assert.equal(snapshot.workspaces.find(w=>w.workspaceId===workspace2).totalMs,'5000');
 assert.ok(Number(snapshot.workspaces.find(w=>w.workspaceId===workspace1).totalMs)>=16000,
  'Workspace attribution is based on original session workspace, not current ancestry');

 // Deleting a task disconnects its parent attribution but preserves original
 // workspace/global time in the immutable session snapshot.
 await pool.query('DELETE FROM dayframe.tasks WHERE id=$1',[other]);
 snapshot=await query();
 assert.equal(snapshot.deletedTaskMs,'11000');
 assert.equal(snapshot.tasks.some(t=>t.taskId===other),false);
 assert.equal(snapshot.workspaces.find(w=>w.workspaceId===workspace2).totalMs,'5000');
 assert.ok(Number(snapshot.accountTotalMs)>=21000);
});


test('M5.3 weekly goals: revision fencing, cross-account denial, unset by zero',async()=>{
 const owner='m53-goals',other='m53-other';
 const workspace='f6111111-1111-4111-8111-111111111111';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Weekly goals','custom')",[workspace,owner]);
 const save=(who,minutes,rev)=>pool.query(TIME_WEEK_TARGET_SQL,[who,workspace,minutes,rev]);
 assert.equal((await save(other,300,0)).rows.length,0,'Cannot set another owner target');
 assert.equal((await save(owner,300,1)).rows.length,0,'Cannot create target with stale positive revision');
 const created=await save(owner,300,0);
 assert.deepEqual(created.rows[0],{workspaceId:workspace,targetMinutes:300,revision:1});
 assert.equal((await save(owner,360,0)).rows.length,0,'Duplicate create must conflict');
 const updates=await Promise.all([save(owner,450,1),save(owner,600,1)]);
 assert.equal(updates.filter(r=>r.rows.length===1).length,1,'Only one concurrent writer can update');
 assert.equal(updates.filter(r=>r.rows.length===0).length,1);
 const updated=await save(owner,0,2);
 assert.equal(updated.rows[0].revision,3);
 assert.equal(updated.rows[0].targetMinutes,0);
 const row=(await pool.query('SELECT target_minutes,revision FROM dayframe.weekly_workspace_targets WHERE owner_user_id=$1 AND workspace_id=$2',[owner,workspace])).rows[0];
 assert.deepEqual(row,{target_minutes:0,revision:3});
});

test('M5.3 weekly metrics: split crossing-Monday spans, preserve legacy remainder and fixed plans',async()=>{
 const owner='m53-metrics';
 const work='f6222222-2222-4222-8222-222222222222';
 const task='f6333333-3333-4333-8333-333333333333';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Measured time','custom')",[work,owner]);
 await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title) VALUES($1,$2,$3,'Weekly task')",[task,owner,work]);
 await pool.query("INSERT INTO dayframe.notification_preferences(owner_user_id,time_zone) VALUES($1,'Asia/Baku')",[owner]);
 const first=(await pool.query("SELECT (date_trunc('week',now() AT TIME ZONE 'Asia/Baku') AT TIME ZONE 'Asia/Baku') AS monday")).rows[0].monday;
 const start=new Date(first.getTime()-1000),end=new Date(first.getTime()+1000);
 // A segment that straddles the week boundary contributes precisely one
 // second to the current week, not two seconds (and none to next week).
 await pool.query(`INSERT INTO dayframe.time_sessions
 (id,owner_user_id,task_id,task_title_snapshot,workspace_id_snapshot,
 started_at,segment_started_at,accumulated_ms,state,revision,ended_at,end_reason)
 VALUES($1,$2,$3,'Boundary span',$4,$5,NULL,2000,'stopped',2,$6,'stopped')`,
 ['f6444444-4444-4444-8444-444444444444',owner,task,work,start,end]);
 await pool.query("INSERT INTO dayframe.time_session_segments(session_id,started_at,ended_at,duration_ms) VALUES($1,$2,$3,2000)",
 ['f6444444-4444-4444-8444-444444444444',start,end]);
 // Pre-M5.3 sessions only have accumulated time; do not pretend their
 // intra-week history can be reconstructed from start/stop timestamps.
 await pool.query(`INSERT INTO dayframe.time_sessions
 (id,owner_user_id,task_id,task_title_snapshot,workspace_id_snapshot,
 started_at,segment_started_at,accumulated_ms,state,revision,ended_at,end_reason)
 VALUES($1,$2,$3,'Legacy accumulated',$4,$5,NULL,65000,'stopped',2,$6,'stopped')`,
 ['f6555555-5555-4555-8555-555555555555',owner,task,work,new Date(first.getTime()+120000),new Date(first.getTime()+180000)]);
 const monday=new Date(first);
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Baku',year:'numeric',month:'2-digit',day:'2-digit'}).format(monday);
 const iso=(await pool.query("SELECT to_char((now() AT TIME ZONE 'Asia/Baku')::date-(extract(isodow from now() AT TIME ZONE 'Asia/Baku')::integer-1),'YYYY-MM-DD') AS week_day")).rows[0].week_day;
 await pool.query('SELECT dayframe.save_scheduled_interval($1,$2,$3,$4::date,$5,$6,$7,$8)',[
  owner,'f6666666-6666-4666-8666-666666666666',task,iso,540,630,'Asia/Baku',0
 ]);
 const data=(await pool.query(TIME_WEEK_SQL,[owner])).rows[0];
 assert.equal(data.timeZone,'Asia/Baku');
 assert.equal(data.weekStart,iso);
 assert.equal(data.accountPlannedMinutes,'90');
 assert.equal(data.accountActualMs,'66000'); // 1000 crossed boundary + 65000 legacy.
 assert.equal(data.accountLegacyEstimatedMs,'65000');
 const item=data.workspaces.find(w=>w.workspaceId===work);
 assert.equal(item.actualMs,'66000');
 assert.equal(item.plannedMinutes,'90');
 assert.equal(item.legacyEstimatedMs,'65000');
 assert.equal(item.targetMinutes,0);
 assert.equal(data.workspaces.reduce((n,w)=>n+Number(w.actualMs),0),Number(data.accountActualMs));
 assert.equal((await pool.query(TIME_WEEK_SQL,['another-account'])).rows[0].accountActualMs,'0');
});

test('M5.3 segment capture: paused time excluded, newly completed spans saved transactionally',async()=>{
 const owner='m53-segment';
 const ws='f6777777-7777-4777-8777-777777777777';
 const task='f6888888-8888-4888-8888-888888888888';
 const id='f6999999-9999-4999-8999-999999999999';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Segment capture','custom')",[ws,owner]);
 await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title) VALUES($1,$2,$3,'Segment task')",[task,owner,ws]);
 const transition=(action,revision,taskId=null)=>pool.query(
 "SELECT dayframe.transition_time_session($1,$2,$3,$4,$5,NULL) AS s",
 [owner,action,id,taskId,revision]);
 await transition('start',0,task);
 await new Promise(resolve=>setTimeout(resolve,25));
 await transition('pause',1);
 const paused=(await pool.query('SELECT accumulated_ms FROM dayframe.time_sessions WHERE id=$1',[id])).rows[0].accumulated_ms;
 await new Promise(resolve=>setTimeout(resolve,35));
 await transition('resume',2);
 await new Promise(resolve=>setTimeout(resolve,20));
 await transition('stop',3);
 const session=(await pool.query('SELECT accumulated_ms FROM dayframe.time_sessions WHERE id=$1',[id])).rows[0];
 const spans=(await pool.query('SELECT duration_ms,started_at,ended_at FROM dayframe.time_session_segments WHERE session_id=$1 ORDER BY started_at',[id])).rows;
 assert.equal(spans.length,2);
 assert.equal(spans.reduce((n,x)=>n+Number(x.duration_ms),0),Number(session.accumulated_ms));
 assert.ok(Number(paused)>0);
 assert.ok(spans.every(x=>new Date(x.ended_at)>=new Date(x.started_at)));
 const week=(await pool.query(TIME_WEEK_SQL,[owner])).rows[0];
 assert.equal(week.accountLegacyEstimatedMs,'0','New segment records must not be classified as legacy');
 assert.equal(Number(week.accountActualMs),Number(session.accumulated_ms));
});


test('M6.1 note CRUD: owner isolation, stale edits and recoverable soft deletion',async()=>{
 const owner='m61-notes-a',other='m61-notes-b';
 const wa='f8111111-1111-4111-8111-111111111111';
 const wb='f8222222-2222-4222-8222-222222222222';
 const id='f8333333-3333-4333-8333-333333333333';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Personal notes','custom'),($3,$4,'Other notes','custom')",[wa,owner,wb,other]);
 const args=[owner,id,wa,'Important idea','A note that belongs to this owner','green',true,'2026-12-01','18:00'];
 assert.equal((await pool.query(NOTE_INSERT_SQL,args)).rows.length,1);
 assert.equal((await pool.query(NOTE_INSERT_SQL,[other,'f8444444-4444-4444-8444-444444444444',wa,
  'Cross-account','Cannot move into another workspace','cream',false,null,null])).rows.length,0);
 assert.equal((await pool.query(NOTE_BY_ID_SQL,[other,id])).rows.length,0);
 const old=(await pool.query(NOTE_BY_ID_SQL,[owner,id])).rows[0];
 assert.equal(old.title,'Important idea');assert.equal(old.pinned,true);
 const upd=[owner,id,wa,'Updated idea','A note that belongs to this owner','lilac',false,null,null,1];
 assert.equal((await pool.query(NOTE_UPDATE_SQL,upd)).rows[0].revision,2);
 assert.equal((await pool.query(NOTE_UPDATE_SQL,upd)).rows.length,0);
 assert.equal((await pool.query(NOTE_UPDATE_SQL,[other,id,wb,'Hijack','No','cream',false,null,null,2])).rows.length,0);
 assert.equal((await pool.query(NOTE_DELETE_SQL,[other,id,2])).rows.length,0);
 assert.equal((await pool.query(NOTE_DELETE_SQL,[owner,id,1])).rows.length,0);
 assert.equal((await pool.query(NOTE_DELETE_SQL,[owner,id,2])).rows.length,1);
 assert.equal((await pool.query(NOTE_BY_ID_SQL,[owner,id])).rows.length,0);
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM dayframe.quick_notes WHERE id=$1 AND deleted_at IS NOT NULL",[id])).rows[0].count,1);
 assert.equal((await pool.query(NOTES_TRASH_SQL,[other,100,0])).rows.length,0);
 assert.equal((await pool.query(NOTES_TRASH_SQL,[owner,100,0])).rows[0].id,id);
 assert.equal((await pool.query(NOTE_RESTORE_SQL,[other,id,3])).rows.length,0);
 assert.equal((await pool.query(NOTE_RESTORE_SQL,[owner,id,2])).rows.length,0);
 assert.equal((await pool.query(NOTE_RESTORE_SQL,[owner,id,3])).rows[0].revision,4);
 assert.equal((await pool.query(NOTE_BY_ID_SQL,[owner,id])).rows[0].id,id);
 assert.equal((await pool.query(NOTES_TRASH_SQL,[owner,100,0])).rows.length,0);
});
test('M6.1 note conversion is exactly-once across retries and refuses cross-account attempts',async()=>{
 const owner='m61-convert-a',other='m61-convert-b';
 const wa='f8555555-5555-4555-8555-555555555555';
 const id='f8666666-6666-4666-8666-666666666666';
 const task='f8777777-7777-4777-8777-777777777777';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Ideas','custom')",[wa,owner]);
 await pool.query(NOTE_INSERT_SQL,[owner,id,wa,'Check this','A conversion prompt','blue',true,null,null]);
 await assert.rejects(pool.query(NOTE_CONVERT_SQL,[other,id,1,task,30]),err=>err.code==='40001');
 const created=await pool.query(NOTE_CONVERT_SQL,[owner,id,1,task,45]);
 assert.equal(created.rows[0].task_id,task);
 const retry=await pool.query(NOTE_CONVERT_SQL,[owner,id,1,task,45]);
 assert.equal(retry.rows[0].task_id,task,'uncertain retry must be safe');
 await assert.rejects(pool.query(NOTE_CONVERT_SQL,[owner,id,1,'f8888888-8888-4888-8888-888888888888',45]),err=>err.code==='40001');
 const row=(await pool.query(NOTE_BY_ID_SQL,[owner,id])).rows[0];
 assert.equal(row.convertedTaskId,task);assert.equal(row.revision,2);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM dayframe.tasks WHERE owner_user_id=$1 AND id=$2',[owner,task])).rows[0].count,1);
 assert.equal((await pool.query('SELECT title,notes,estimate_minutes FROM dayframe.tasks WHERE id=$1',[task])).rows[0].estimate_minutes,45);
});

test('M6.1a note reminders: timezone, account isolation, durable outbox, atomic claim and delete safety',async()=>{
 const owner='m61-reminder-a',other='m61-reminder-b';
 const workspace='f9111111-1111-4111-8111-111111111111';
 const noteId='f9222222-2222-4222-8222-222222222222';
 const endpoint='https://fcm.googleapis.com/fcm/send/audit-note-push';
 const day=new Date(Date.now()-24*60*60*1000).toISOString().slice(0,10);
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Note alerts','custom')",[workspace,owner]);
 await pool.query(NOTE_INSERT_SQL,[owner,noteId,workspace,'Private reminder','Never put this in push','green',false,day,'09:00']);
 await pool.query("INSERT INTO dayframe.notification_preferences(owner_user_id,time_zone) VALUES($1,'UTC')",[owner]);
 await pool.query("INSERT INTO dayframe.push_subscriptions(owner_user_id,endpoint) VALUES($1,$2)",[owner,endpoint]);
 const {rows:list}=await pool.query(NOTE_ALERT_LIST_SQL,[owner,'UTC']);
 assert.equal(list.length,1);
 assert.equal(list[0].noteId,noteId);
 assert.equal(list[0].kind,'note');
 assert.equal((await pool.query(NOTE_ALERT_LIST_SQL,[other,'UTC'])).rows.length,0);
 await assert.rejects(pool.query(NOTE_ALERT_ACTION_SQL,[other,noteId,day,'09:00',0,'acknowledge',null]),
  err=>err.code==='40001');
 assert.equal((await pool.query('SELECT dayframe.enqueue_due_note_push(50) AS count')).rows[0].count,1);
 assert.equal((await pool.query('SELECT dayframe.enqueue_due_note_push(50) AS count')).rows[0].count,0,
  'Same source occurrence must not queue a duplicate push');
 const first=await pool.connect();
 try{
  await first.query('BEGIN');
  const claimed=await first.query(NOTE_CLAIM_SQL,[10]);
  assert.equal(claimed.rows.length,1);
  assert.equal(claimed.rows[0].owner_user_id,owner);
  assert.equal((await pool.query(NOTE_CLAIM_SQL,[10])).rows.length,0,
   'Second worker cannot claim a sending occurrence');
  await first.query('COMMIT');
  assert.equal((await pool.query(NOTE_ELIGIBLE_SQL,[claimed.rows[0].id])).rows.length,1);
  await pool.query('UPDATE dayframe.quick_notes SET deleted_at=now() WHERE id=$1',[noteId]);
  assert.equal((await pool.query(NOTE_ELIGIBLE_SQL,[claimed.rows[0].id])).rows.length,0,
   'Deleted note must not send a pending notification');
 }finally{
  try{await first.query('ROLLBACK');}catch{}
  first.release();
 }
});
test('M6.1a note alert acknowledgements and snoozes use optimistic revisions',async()=>{
 const owner='m61-note-action';
 const ws='f9333333-3333-4333-8333-333333333333';
 const id='f9444444-4444-4444-8444-444444444444';
 const day=new Date(Date.now()+24*60*60*1000).toISOString().slice(0,10);
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Note action','custom')",[ws,owner]);
 await pool.query(NOTE_INSERT_SQL,[owner,id,ws,'Alert','Content','blue',false,day,'10:00']);
 assert.equal((await pool.query(NOTE_ALERT_ACTION_SQL,[owner,id,day,'10:00',0,'acknowledge',null])).rows[0].revision,1);
 await assert.rejects(pool.query(NOTE_ALERT_ACTION_SQL,[owner,id,day,'10:00',0,'reset',null]),
  err=>err.code==='40001');
 assert.equal((await pool.query(NOTE_ALERT_LIST_SQL,[owner,'UTC'])).rows.length,0);
 const future=new Date(Date.now()+60*60*1000).toISOString();
 assert.equal((await pool.query(NOTE_ALERT_ACTION_SQL,[owner,id,day,'10:00',1,'snooze',future])).rows[0].revision,2);
 assert.equal((await pool.query(NOTE_ALERT_LIST_SQL,[owner,'UTC'])).rows.length,0);
 await pool.query("UPDATE dayframe.quick_notes SET reminder=$2 WHERE id=$1",[id,
   new Date(Date.now()+48*60*60*1000).toISOString().slice(0,10)]);
 await assert.rejects(pool.query(NOTE_ALERT_ACTION_SQL,[owner,id,day,'10:00',2,'acknowledge',null]),
  err=>err.code==='40001');
});

test('M6.1c quiet hours respect local times, overnight windows and DST transitions',async()=>{
 const sql="SELECT dayframe.defer_push_quiet_hours($1::timestamptz,$2,$3::time,$4::time) AS at";
 const utc=async(instant,start,end,zone='UTC')=>
  (await pool.query(sql,[instant,zone,start,end])).rows[0].at.toISOString();
 assert.equal(await utc('2026-11-07T23:00:00Z','22:00','07:00'),'2026-11-08T07:00:00.000Z');
 assert.equal(await utc('2026-11-07T06:00:00Z','22:00','07:00'),'2026-11-07T07:00:00.000Z');
 assert.equal(await utc('2026-11-07T12:00:00Z','22:00','07:00'),'2026-11-07T12:00:00.000Z');
 assert.equal(await utc('2026-11-07T12:30:00Z','12:00','14:00'),'2026-11-07T14:00:00.000Z');
 assert.equal(await utc('2026-11-07T12:30:00Z',null,null),'2026-11-07T12:30:00.000Z');
 // Berlin spring forward: 01:45 CET -> the first 03:00 CEST local end.
 assert.equal(await utc('2026-03-29T00:45:00Z','01:00','03:00','Europe/Berlin'),
  '2026-03-29T01:00:00.000Z');
 // Berlin autumn fold: avoid a premature push during the second 02:00 hour.
 assert.equal(await utc('2026-10-25T00:30:00Z','02:00','03:00','Europe/Berlin'),
  '2026-10-25T02:00:00.000Z');
});
test('M6.1c quiet preferences reject partial/equal windows and preserve timezone',async()=>{
 const owner='m61-quiet-pref';
 await pool.query("INSERT INTO dayframe.notification_preferences(owner_user_id,time_zone) VALUES($1,'Asia/Baku')",[owner]);
 await assert.rejects(pool.query("UPDATE dayframe.notification_preferences SET quiet_start='22:00' WHERE owner_user_id=$1",[owner]),
  err=>err.code==='23514');
 await assert.rejects(pool.query("UPDATE dayframe.notification_preferences SET quiet_start='22:00',quiet_end='22:00' WHERE owner_user_id=$1",[owner]),
  err=>err.code==='23514');
 await pool.query("UPDATE dayframe.notification_preferences SET quiet_start='22:00',quiet_end='07:00' WHERE owner_user_id=$1",[owner]);
 const row=(await pool.query("SELECT time_zone,quiet_start::text,quiet_end::text FROM dayframe.notification_preferences WHERE owner_user_id=$1",[owner])).rows[0];
 assert.equal(row.time_zone,'Asia/Baku');
 assert.match(row.quiet_start,/^22:00:/);
 assert.match(row.quiet_end,/^07:00:/);
});

test('M6.2a documents are owner-scoped; hierarchy cannot cross workspace or form a cycle',async()=>{
 const owner='m62-doc-owner',other='m62-doc-other';
 const wa='a9111111-1111-4111-8111-111111111111';
 const wb='b9111111-1111-4111-8111-111111111111';
 const root='a9222222-2222-4222-8222-222222222222';
 const child='a9333333-3333-4333-8333-333333333333';
 const blocks='[{"id":"para-1","type":"paragraph","props":{},"content":[{"type":"text","text":"Private draft","styles":{}}],"children":[]}]';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Documents A','custom'),($3,$4,'Documents B','custom')",[wa,owner,wb,other]);
 const rootArgs=[owner,root,wa,null,null,'Root',blocks];
 assert.equal((await pool.query(DOCUMENT_INSERT_SQL,rootArgs)).rows.length,1);
 assert.equal((await pool.query(DOCUMENT_DETAIL_SQL,[other,root])).rows.length,0);
 assert.equal((await pool.query(DOCUMENT_INSERT_SQL,[other,'b9333333-3333-4333-8333-333333333333',wa,null,null,'Foreign workspace',blocks])).rows.length,0);
 assert.equal((await pool.query(DOCUMENT_INSERT_SQL,[owner,child,wa,null,root,'Child',blocks])).rows.length,1);
 await assert.rejects(pool.query(DOCUMENT_UPDATE_SQL,[owner,root,wa,null,child,'Root',blocks,1]),err=>err.code==='23514');
 assert.equal((await pool.query(DOCUMENT_UPDATE_SQL,[owner,child,wb,null,root,'Child',blocks,1])).rows.length,0,'Wrong-account workspace cannot be selected');
 assert.equal((await pool.query(DOCUMENT_DELETE_SQL,[owner,root,1])).rows.length,0,'Non-leaf parent cannot be removed');
 assert.equal((await pool.query(DOCUMENT_DELETE_SQL,[owner,child,1])).rows.length,1);
 assert.equal((await pool.query(DOCUMENT_DELETE_SQL,[owner,root,1])).rows.length,1);
 assert.equal((await pool.query(DOCUMENT_DETAIL_SQL,[owner,root])).rows.length,0);
});
test('M6.2a attached documents reject cross-owner and wrong-workspace tasks',async()=>{
 const owner='m62-linked-a',other='m62-linked-b';
 const wa='a9444444-4444-4444-8444-444444444444';
 const wb='b9444444-4444-4444-8444-444444444444';
 const tb='b9555555-5555-4555-8555-555555555555';
 const doc='a9666666-6666-4666-8666-666666666666';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Owner A','custom'),($3,$4,'Owner B','custom')",[wa,owner,wb,other]);
 await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title) VALUES($1,$2,$3,'Foreign task')",[tb,other,wb]);
 const blocks='[]';
 assert.equal((await pool.query(DOCUMENT_INSERT_SQL,[owner,doc,wa,tb,null,'Should not attach',blocks])).rows.length,0);
 assert.equal((await pool.query(DOCUMENT_INSERT_SQL,[owner,doc,wa,null,null,'Safe doc',blocks])).rows.length,1);
 await assert.rejects(pool.query(DOCUMENT_UPDATE_SQL,[owner,doc,wa,tb,null,'Unsafe',blocks,1]),err=>err.code==='23514');
 assert.equal((await pool.query(DOCUMENT_DETAIL_SQL,[other,doc])).rows.length,0);
});

test('M7.1 workspace pins are owner-isolated, default off, and revision-fenced',async()=>{
 const a='m71-pin-owner-a',b='m71-pin-owner-b';
 const w='d9111111-1111-4111-8111-111111111111';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Pinned workspace','custom')",[w,a]);
 const initial=(await pool.query('SELECT pinned,revision FROM dayframe.workspaces WHERE id=$1',[w])).rows[0];
 assert.equal(initial.pinned,false);assert.equal(initial.revision,1);
 const sql="UPDATE dayframe.workspaces SET pinned=$4,revision=revision+1,updated_at=now() "+
  "WHERE owner_user_id=$1 AND id=$2 AND revision=$3 AND deleted_at IS NULL AND archived_at IS NULL RETURNING pinned,revision";
 assert.equal((await pool.query(sql,[b,w,1,true])).rows.length,0);
 assert.equal((await pool.query(sql,[a,w,1,true])).rows[0].revision,2);
 assert.equal((await pool.query(sql,[a,w,1,false])).rows.length,0);
 const done=(await pool.query('SELECT pinned,revision FROM dayframe.workspaces WHERE id=$1',[w])).rows[0];
 assert.equal(done.pinned,true);assert.equal(done.revision,2);
 await pool.query('UPDATE dayframe.workspaces SET archived_at=now() WHERE id=$1',[w]);
 assert.equal((await pool.query(sql,[a,w,2,false])).rows.length,0);
});

test('M7.2 period report splits midnight segments in account timezone and isolates owners',async()=>{
 const owner='m72-period-owner',other='m72-period-other';
 const ws='e7111111-1111-4111-8111-111111111111';
 const task='e7222222-2222-4222-8222-222222222222';
 const segmentSession='e7333333-3333-4333-8333-333333333333';
 const legacySession='e7444444-4444-4444-8444-444444444444';
 const plan='e7555555-5555-4555-8555-555555555555';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Period research','custom')",[ws,owner]);
 await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title,long_term) VALUES($1,$2,$3,'Long-term proof',true)",[task,owner,ws]);
 await pool.query("INSERT INTO dayframe.notification_preferences(owner_user_id,time_zone) VALUES($1,'Asia/Baku')",[owner]);
 await pool.query("INSERT INTO dayframe.time_sessions(id,owner_user_id,task_id,task_title_snapshot,workspace_id_snapshot,started_at,accumulated_ms,state,ended_at,end_reason) "+
  "VALUES($1,$2,$3,'Long-term proof',$4,'2026-11-06 19:30:00+00',3600000,'stopped','2026-11-06 20:30:00+00','stopped')",
  [segmentSession,owner,task,ws]);
 await pool.query("INSERT INTO dayframe.time_session_segments(session_id,started_at,ended_at,duration_ms) "+
  "VALUES($1,'2026-11-06 19:30:00+00','2026-11-06 20:30:00+00',3600000)",[segmentSession]);
 await pool.query("INSERT INTO dayframe.time_sessions(id,owner_user_id,task_id,task_title_snapshot,workspace_id_snapshot,started_at,accumulated_ms,state,ended_at,end_reason) "+
  "VALUES($1,$2,NULL,'Older record',$3,'2026-11-07 10:00:00+00',300000,'stopped','2026-11-07 10:05:00+00','stopped')",
  [legacySession,owner,ws]);
 await pool.query("INSERT INTO dayframe.scheduled_intervals(id,owner_user_id,task_id,plan_day,start_minute,end_minute,time_zone) "+
  "VALUES($1,$2,$3,'2026-11-07',600,660,'Asia/Baku')",[plan,owner,task]);
 const query=(period,day,id=owner)=>pool.query(TIME_PERIOD_REPORT_SQL,[id,period,day]);
 const day7=(await query('day','2026-11-07')).rows[0];
 assert.equal(day7.timeZone,'Asia/Baku');
 assert.equal(day7.startDay,'2026-11-07');
 assert.equal(day7.endDayExclusive,'2026-11-08');
 assert.equal(Number(day7.accountRecordedMs),1800000);
 assert.equal(Number(day7.accountLegacyEstimatedMs),300000);
 assert.equal(Number(day7.accountPlannedMinutes),60);
 const w=day7.workspaces.find(row=>row.workspaceId===ws);
 assert.equal(Number(w.recordedMs),1800000);
 assert.equal(Number(w.legacyEstimatedMs),300000);
 assert.equal(Number(w.plannedMinutes),60);
 assert.equal(Number(day7.longTermTasks.find(t=>t.taskId===task).recordedMs),1800000);
 const day6=(await query('day','2026-11-06')).rows[0];
 assert.equal(Number(day6.accountRecordedMs),1800000);
 assert.equal(Number(day6.accountLegacyEstimatedMs),0);
 assert.equal(Number(day6.accountPlannedMinutes),0);
 const week=(await query('week','2026-11-07')).rows[0];
 assert.equal(week.startDay,'2026-11-02');
 assert.equal(week.endDayExclusive,'2026-11-09');
 assert.equal(Number(week.accountRecordedMs),3600000);
 assert.equal(Number(week.accountLegacyEstimatedMs),300000);
 const month=(await query('month','2026-11-07')).rows[0];
 assert.equal(month.startDay,'2026-11-01');
 assert.equal(month.endDayExclusive,'2026-12-01');
 assert.equal(Number(month.accountRecordedMs),3600000);
 const foreign=(await query('day','2026-11-07',other)).rows[0];
 assert.equal(Number(foreign.accountRecordedMs),0);
 assert.equal(Number(foreign.accountLegacyEstimatedMs),0);
 assert.equal(foreign.longTermTasks.length,0);
});
test('M7.2 spring DST day boundary is an IANA-zone calendar day, not fixed 24 hours',async()=>{
 const owner='m72-berlin';
 const ws='e7666666-6666-4666-8666-666666666666';
 const session='e7777777-7777-4777-8777-777777777777';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Berlin','custom')",[ws,owner]);
 await pool.query("INSERT INTO dayframe.notification_preferences(owner_user_id,time_zone) VALUES($1,'Europe/Berlin')",[owner]);
 await pool.query("INSERT INTO dayframe.time_sessions(id,owner_user_id,task_id,task_title_snapshot,workspace_id_snapshot,started_at,accumulated_ms,state,ended_at,end_reason) "+
  "VALUES($1,$2,NULL,'DST segment',$3,'2026-03-29 00:30:00+00',3600000,'stopped','2026-03-29 01:30:00+00','stopped')",[session,owner,ws]);
 await pool.query("INSERT INTO dayframe.time_session_segments(session_id,started_at,ended_at,duration_ms) "+
  "VALUES($1,'2026-03-29 00:30:00+00','2026-03-29 01:30:00+00',3600000)",[session]);
 const report=(await pool.query(TIME_PERIOD_REPORT_SQL,[owner,'day','2026-03-29'])).rows[0];
 assert.equal(report.startDay,'2026-03-29');
 assert.equal(report.endDayExclusive,'2026-03-30');
 assert.equal(Number(report.accountRecordedMs),3600000);
 assert.equal(Number(report.accountLegacyEstimatedMs),0);
});

test('M7.3 source-backed completion history distinguishes due-event counts and estimated comparison',async()=>{
 const owner='m73-insights-owner',other='m73-insights-other';
 const ws='f1111111-1111-4111-8111-111111111111';
 const task='f2222222-2222-4222-8222-222222222222';
 const session='f3333333-3333-4333-8333-333333333333';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Insights QA','custom')",[ws,owner]);
 await pool.query("INSERT INTO dayframe.notification_preferences(owner_user_id,time_zone) VALUES($1,'Asia/Baku')",[owner]);
 await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title,estimate_minutes,deadline,deadline_time) VALUES($1,$2,$3,'Accuracy example',60,'2026-11-07','18:00')",[task,owner,ws]);
 await pool.query("UPDATE dayframe.tasks SET status='done' WHERE id=$1",[task]);
 await pool.query("UPDATE dayframe.task_events SET created_at='2026-11-07 13:00:00+00' WHERE task_id=$1 AND owner_user_id=$2 AND event_type='completed'",[task,owner]);
 await pool.query("INSERT INTO dayframe.time_sessions(id,owner_user_id,task_id,task_title_snapshot,workspace_id_snapshot,started_at,accumulated_ms,state,ended_at,end_reason) "+
  "VALUES($1,$2,$3,'Accuracy example',$4,'2026-11-07 12:00:00+00',1800000,'stopped','2026-11-07 12:30:00+00','stopped')",[session,owner,task,ws]);
 await pool.query("INSERT INTO dayframe.time_session_segments(session_id,started_at,ended_at,duration_ms) "+
  "VALUES($1,'2026-11-07 12:00:00+00','2026-11-07 12:30:00+00',1800000)",[session]);
 const row=(await pool.query(TIME_INSIGHTS_SQL,[owner,'day','2026-11-07'])).rows[0];
 assert.equal(row.timeZone,'Asia/Baku');
 assert.deepEqual(row.deadline,{completedEvents:1,withDeadline:1,withoutDeadline:0,onTime:1,late:0});
 assert.equal(row.estimate.measuredTasks,1);
 assert.equal(Number(row.estimate.estimatedMinutes),60);
 assert.equal(Number(row.estimate.recordedMs),1800000);
 assert.equal(row.history[0].taskId,task);
 assert.equal(row.history[0].onTime,true);
 const foreign=(await pool.query(TIME_INSIGHTS_SQL,[other,'day','2026-11-07'])).rows[0];
 assert.equal(foreign.deadline.completedEvents,0);
 assert.equal(foreign.history.length,0);
});
test('M7.3 date-only deadlines end at next local midnight; late completion measured using event snapshot',async()=>{
 const owner='m73-deadline-day';
 const ws='f4444444-4444-4444-8444-444444444444';
 const task='f5555555-5555-4555-8555-555555555555';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Deadline QA','custom')",[ws,owner]);
 await pool.query("INSERT INTO dayframe.notification_preferences(owner_user_id,time_zone) VALUES($1,'UTC')",[owner]);
 await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title,deadline) VALUES($1,$2,$3,'Date only','2026-11-07')",[task,owner,ws]);
 await pool.query("UPDATE dayframe.tasks SET status='done' WHERE id=$1",[task]);
 await pool.query("UPDATE dayframe.task_events SET created_at='2026-11-08 00:00:01+00' WHERE task_id=$1 AND event_type='completed'",[task]);
 const row=(await pool.query(TIME_INSIGHTS_SQL,[owner,'day','2026-11-08'])).rows[0];
 assert.equal(row.deadline.late,1);
 assert.equal(row.deadline.onTime,0);
 assert.equal(row.history[0].deadlineTime,null);
});

test('M7.3 audit-event deadlines and estimates stay owner-scoped and classify midnight',async()=>{
 // These accounts must be distinct from the preceding M7.3 fixture; otherwise
 // preference rows and completion events contaminate the period aggregates.
 const owner='m73-events-owner',other='m73-events-other';
 // Distinct fixture UUIDs from M7.2; global primary keys cannot be reused across owner-scoped tests.
 const wa='c9111111-1111-4111-8111-111111111111';
 const wb='c9222222-2222-4222-8222-222222222222';
 const ta='c9333333-3333-4333-8333-333333333333';
 const tb='c9444444-4444-4444-8444-444444444444';
 const tc='c9555555-5555-4555-8555-555555555555';
 const sa='c9666666-6666-4666-8666-666666666666';
 const sb='c9777777-7777-4777-8777-777777777777';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Insights A','custom'),($3,$4,'Insights B','custom')",[wa,owner,wb,other]);
 await pool.query("INSERT INTO dayframe.notification_preferences(owner_user_id,time_zone) VALUES($1,'Asia/Baku'),($2,'Asia/Baku')",[owner,other]);
 await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title,estimate_minutes,deadline) VALUES($1,$2,$3,'Tracked task',30,'2026-11-07'),($4,$2,$3,'Unsegmented task',20,'2026-11-07')",[ta,owner,wa,tb]);
 await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title,estimate_minutes,deadline) VALUES($1,$2,$3,'Other owner',30,'2026-11-07')",[tc,other,wb]);
 await pool.query("UPDATE dayframe.tasks SET status='done' WHERE id IN ($1,$2,$3)",[ta,tb,tc]);
 for(const [o,t,when] of [[owner,ta,'2026-11-07T15:00:00Z'],[owner,tb,'2026-11-07T20:00:00Z'],[other,tc,'2026-11-07T15:00:00Z']]){
  const result=await pool.query("UPDATE dayframe.task_events SET created_at=$3::timestamptz WHERE owner_user_id=$1 AND task_id=$2 AND event_type='completed' RETURNING event_id",[o,t,when]);
  assert.equal(result.rows.length,1,'Completion audit snapshot must exist');
 }
 // One exact tracked hour and one unknown old 5-minute session for a second
 // task. The second task must be excluded from estimate comparisons.
 await pool.query("INSERT INTO dayframe.time_sessions(id,owner_user_id,task_id,task_title_snapshot,workspace_id_snapshot,started_at,accumulated_ms,state,ended_at,end_reason) VALUES($1,$2,$3,'Tracked task',$4,'2026-11-07T12:00:00Z',3600000,'stopped','2026-11-07T13:00:00Z','stopped'),($5,$2,$6,'Unsegmented task',$4,'2026-11-07T12:00:00Z',300000,'stopped','2026-11-07T12:05:00Z','stopped')",[sa,owner,ta,wa,sb,tb]);
 await pool.query("INSERT INTO dayframe.time_session_segments(session_id,started_at,ended_at,duration_ms) VALUES($1,'2026-11-07T12:00:00Z','2026-11-07T13:00:00Z',3600000)",[sa]);
 const {rows:[insights]}=await pool.query(TIME_INSIGHTS_SQL,[owner,'day','2026-11-07']);
 assert.equal(insights.timeZone,'Asia/Baku');
 assert.equal(insights.deadline.completedEvents,2);
 assert.equal(insights.deadline.onTime,1);
 assert.equal(insights.deadline.late,1,'Date-only deadline ends strictly before next local midnight');
 assert.equal(insights.estimate.measuredTasks,1);
 assert.equal(insights.estimate.excludedLegacyTasks,1);
 assert.equal(insights.estimate.untrackedTasks,0);
 assert.equal(Number(insights.estimate.estimatedMinutes),30);
 assert.equal(Number(insights.estimate.recordedMs),3600000);
 assert.equal(Number(insights.estimate.absoluteErrorMs),1800000);
 assert.equal(insights.weeklyTrend.length,6);
 assert.equal(insights.weeklyTrend.at(-1).weekStart,'2026-11-02');
 assert.equal(Number(insights.weeklyTrend.at(-1).recordedMs),3600000);
 assert.equal(insights.weeklyTrend.at(-1).completedEvents,2);
 const foreign=(await pool.query(TIME_INSIGHTS_SQL,[other,'day','2026-11-07'])).rows[0];
 assert.equal(foreign.deadline.completedEvents,1);
 assert.equal(Number(foreign.weeklyTrend.at(-1).recordedMs),0);
 assert.equal(foreign.history.some(x=>x.taskId===ta),false);
});

test('M8.1 linked private docs prevent inconsistent cross-workspace task moves',async()=>{
 const owner='m81-task-document-owner';
 const original='e8111111-1111-4111-8111-111111111111';
 const target='e8222222-2222-4222-8222-222222222222';
 const task='e8333333-3333-4333-8333-333333333333';
 const doc='e8444444-4444-4444-8444-444444444444';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Source','custom'),($3,$2,'Destination','custom')",[original,owner,target]);
 await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title) VALUES($1,$2,$3,'Task with document')",[task,owner,original]);
 await pool.query("INSERT INTO dayframe.documents(id,owner_user_id,workspace_id,task_id,title,blocks) VALUES($1,$2,$3,$4,'Private notes','[]'::jsonb)",[doc,owner,original,task]);
 const move="SELECT dayframe.move_task_subtree($1,$2,$3,$4::uuid,$5)";
 await assert.rejects(pool.query(move,[owner,task,target,null,1]),error=>error.code==='DF001');
 const unchanged=(await pool.query("SELECT workspace_id::text AS workspace FROM dayframe.tasks WHERE id=$1",[task])).rows[0];
 assert.equal(unchanged.workspace,original);
 assert.equal((await pool.query("SELECT workspace_id::text AS workspace FROM dayframe.documents WHERE id=$1",[doc])).rows[0].workspace,original);
 await pool.query("UPDATE dayframe.documents SET deleted_at=now(),revision=revision+1 WHERE id=$1",[doc]);
 assert.equal((await pool.query(move,[owner,task,target,null,1])).rows.length,1);
 assert.equal((await pool.query("SELECT workspace_id::text AS workspace FROM dayframe.tasks WHERE id=$1",[task])).rows[0].workspace,target);
 await assert.rejects(pool.query("UPDATE dayframe.documents SET deleted_at=NULL,revision=revision+1 WHERE id=$1",[doc]),
  error=>error.code==='23514');
 await assert.rejects(pool.query(move,['another-owner',task,original,null,2]),
  error=>error.code==='40001');
});
test('M8.1 changing quiet-hours or account timezone invalidates only unsent own outbox',async()=>{
 const owner='m81-push-preference-owner',other='m81-push-preference-other';
 const w='e8555555-5555-4555-8555-555555555555';
 const t='e8666666-6666-4666-8666-666666666666';
 const n='e8777777-7777-4777-8777-777777777777';
 const endpoint='https://fcm.googleapis.com/fcm/send/m81-quiet-owner';
 await pool.query("INSERT INTO dayframe.workspaces(id,owner_user_id,name,kind) VALUES($1,$2,'Push','custom')",[w,owner]);
 await pool.query("INSERT INTO dayframe.tasks(id,owner_user_id,workspace_id,title) VALUES($1,$2,$3,'Quiet task')",[t,owner,w]);
 await pool.query("INSERT INTO dayframe.quick_notes(id,owner_user_id,workspace_id,title,content) VALUES($1,$2,$3,'Quiet note','')",[n,owner,w]);
 await pool.query("INSERT INTO dayframe.notification_preferences(owner_user_id,time_zone) VALUES($1,'UTC'),($2,'UTC')",[owner,other]);
 await pool.query("INSERT INTO dayframe.push_subscriptions(endpoint,owner_user_id) VALUES($1,$2)",[endpoint,owner]);
 await pool.query("INSERT INTO dayframe.notification_deliveries(owner_user_id,task_id,kind,source_day,source_time,send_after,endpoint,status) VALUES($1,$2,'reminder','2026-11-07','09:00',now(),$3,'pending'),($1,$2,'reminder','2026-11-08','09:00',now(),$3,'delivered')",[owner,t,endpoint]);
 await pool.query("INSERT INTO dayframe.note_notification_deliveries(owner_user_id,note_id,source_day,source_time,send_after,endpoint,status) VALUES($1,$2,'2026-11-07','09:00',now(),$3,'retry')",[owner,n,endpoint]);
 await pool.query("UPDATE dayframe.notification_preferences SET quiet_start='22:00',quiet_end='07:00' WHERE owner_user_id=$1",[owner]);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM dayframe.notification_deliveries WHERE owner_user_id=$1 AND status='pending'",[owner])).rows[0].n,0);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM dayframe.note_notification_deliveries WHERE owner_user_id=$1 AND status='retry'",[owner])).rows[0].n,0);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM dayframe.notification_deliveries WHERE owner_user_id=$1 AND status='delivered'",[owner])).rows[0].n,1);
 await pool.query("UPDATE dayframe.notification_preferences SET time_zone='Asia/Baku' WHERE owner_user_id=$1",[owner]);
 assert.equal((await pool.query("SELECT time_zone FROM dayframe.notification_preferences WHERE owner_user_id=$1",[other])).rows[0].time_zone,'UTC');
});
