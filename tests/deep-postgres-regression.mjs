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
 for(let i=1;i<=10;i++){
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
test('all ten production migrations execute without dependency errors',async()=>{
 const {rows}=await pool.query('SELECT version FROM dayframe.schema_migrations ORDER BY version');
 assert.equal(rows.length,10);
 assert.equal(rows[9].version,'0010_notification_delivery');
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
