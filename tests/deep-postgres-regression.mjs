// Runs against an ephemeral PostgreSQL service in GitHub Actions, never Neon.
// Applies the actual Dayframe migrations and imports the actual API SQL.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {TASK_TRASH_SQL,TASK_RESTORE_SQL,TIMED_SAVE_SQL,ALERT_ACTION_SQL,PUSH_SUB_SAVE_SQL} from '../backend/src/index.mjs';
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
 for(let i=1;i<=11;i++){
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
test('all eleven production migrations execute without dependency errors',async()=>{
 const {rows}=await pool.query('SELECT version FROM dayframe.schema_migrations ORDER BY version');
 assert.equal(rows.length,11);
 assert.equal(rows[10].version,'0011_time_sessions');
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
