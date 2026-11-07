import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createHandler,ALERT_LIST_SQL,NOTE_ALERT_LIST_SQL,NOTE_ALERT_ACTION_SQL
} from '../src/index.mjs';
import {
 dispatchDueNotes,NOTE_CLAIM_SQL,NOTE_ELIGIBLE_SQL,PUSH_QUIET_SQL
} from '../src/reminder-dispatch.mjs';

const N='b1111111-1111-4111-8111-111111111111';
const T='a1111111-1111-4111-8111-111111111111';
const note={
 noteId:N,title:'Private draft',kind:'note',day:'2026-12-01',time:'09:00',
 dueAt:'2026-12-01T09:00:00Z',revision:null,acknowledgedAt:null,snoozedUntil:null
};
function apiSetup(run){
 const calls=[];
 const api=createHandler({
  verifyToken:async token=>{if(!['alice','bob'].includes(token))throw Error('Unauthorized');return token;},
  query:async(sql,args)=>{calls.push({sql,args});return run(sql,args);}
 });
 const request=(path,method='GET',token='alice',body)=>api.fetch(new Request('https://invalid.example'+path,{
  method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 }));
 return {request,calls};
}

test('M6.1a combined inbox queries both sources with verified owner and one browser request',async()=>{
 const {request,calls}=apiSetup(async(sql,args)=>{
  if(sql===ALERT_LIST_SQL)return {rows:args[0]==='alice'?[{
   taskId:T,title:'Old task',kind:'reminder',day:'2026-12-01',time:'09:00',
   dueAt:'2026-12-01T12:00:00Z',revision:null,acknowledgedAt:null,snoozedUntil:null
  }]:[]};
  if(sql===NOTE_ALERT_LIST_SQL)return {rows:args[0]==='alice'?[note]:[]};
  throw Error('Unexpected query');
 });
 const reply=await request('/v1/alerts/combined?timeZone=UTC');
 assert.equal(reply.status,200);
 assert.deepEqual((await reply.json()).alerts.map(a=>a.kind),['note','reminder']);
 assert.equal((await request('/v1/alerts/combined?timeZone=UTC','GET','bob')).status,200);
 assert.equal((await request('/v1/alerts/combined?timeZone=UTC','GET',null)).status,401);
 assert.equal((await request('/v1/alerts/combined?timeZone=UTC','GET','forged')).status,401);
 assert.deepEqual(calls.map(c=>c.args[0]).sort(),['alice','alice','bob','bob']);
 assert.match(NOTE_ALERT_LIST_SQL,/n.owner_user_id=\$1/);
 assert.match(NOTE_ALERT_LIST_SQL,/a.owner_user_id=n.owner_user_id/);
 assert.match(NOTE_ALERT_LIST_SQL,/n.deleted_at IS NULL/);
 assert.match(NOTE_ALERT_LIST_SQL,/w.archived_at IS NULL/);
});
test('M6.1a note acknowledgements and snoozes are revision fenced and owned',async()=>{
 const {request,calls}=apiSetup(async(sql,args)=>{
  if(sql===NOTE_ALERT_ACTION_SQL)return {rows:[{revision:args[4]+1}]};
  throw Error('Unexpected query');
 });
 const body={day:'2026-12-01',time:'09:00',revision:0,action:'acknowledge',owner:'bob'};
 const res=await request('/v1/note-alerts/'+N,'POST','alice',body);
 assert.equal(res.status,200);
 assert.equal((await res.json()).revision,1);
 assert.deepEqual(calls[0],{sql:NOTE_ALERT_ACTION_SQL,args:['alice',N,'2026-12-01','09:00',0,'acknowledge',null]});
 for(const invalid of [
  {...body,revision:-1},{...body,day:'2026-02-30'},
  {...body,action:'snooze'},{...body,action:'reset',until:'2026-12-01T09:00:00Z'}
 ])assert.equal((await request('/v1/note-alerts/'+N,'POST','alice',invalid)).status,400);
 assert.equal(calls.length,1);
 assert.equal((await request('/v1/note-alerts/'+N,'POST',null,body)).status,401);
});
test('M6.1a stale or foreign note reminders get a safe conflict',async()=>{
 const {request}=apiSetup(async(sql)=>{
  if(sql===NOTE_ALERT_ACTION_SQL)throw Object.assign(Error('internal notes relation'),{code:'40001'});
  throw Error('Unexpected query');
 });
 const response=await request('/v1/note-alerts/'+N,'POST','alice',{
  day:'2026-12-01',time:'09:00',revision:0,action:'acknowledge'
 });
 assert.equal(response.status,409);
 assert.doesNotMatch(await response.text(),/database|relation|password|SELECT/i);
});
test('M6.1a stale, deleted or foreign note never sends a Web Push',async()=>{
 let sends=0;
 const endpoint='https://fcm.googleapis.com/fcm/send/synthetic';
 const sql=async(sql)=>{
  if(sql===NOTE_CLAIM_SQL)return {rows:[{id:19,endpoint,attempts:1}]};
  if(sql===NOTE_ELIGIBLE_SQL)return {rows:[]};
  if(sql.includes("status='expired'"))return {rows:[]};
  throw Error('Unexpected SQL');
 };
 const result=await dispatchDueNotes({sql,vapid:()=> 'vapid dummy',
  send:()=>{sends++;throw Error('Must not push');}});
 assert.deepEqual(result,{claimed:1,delivered:0,expired:1,retrying:0});
 assert.equal(sends,0);
 assert.match(NOTE_ELIGIBLE_SQL,/n.deleted_at IS NULL/);
 assert.match(NOTE_ELIGIBLE_SQL,/s.owner_user_id=d.owner_user_id/);
 assert.match(NOTE_ELIGIBLE_SQL,/a.acknowledged_at IS NULL/);
});
test('M6.1a valid note push contains no title/body and is sent at most once per claim',async()=>{
 const endpoint='https://web.push.apple.com/synthetic';
 const sent=[];let statusWrites=0;
 const sql=async(statement)=>{
  if(statement===NOTE_CLAIM_SQL)return {rows:[{id:20,owner_user_id:'alice',endpoint,attempts:1}]};
  if(statement===NOTE_ELIGIBLE_SQL)return {rows:[{'?column?':1}]};
  if(statement===PUSH_QUIET_SQL)return {rows:[{not_before:new Date(0)}]};
  if(statement.includes("status='delivered'")){statusWrites++;return {rows:[]};}
  throw Error('Unexpected SQL');
 };
 const result=await dispatchDueNotes({sql,vapid:()=> 'vapid token',send:async(...args)=>{
  sent.push(args);return {ok:true,status:201};
 }});
 assert.deepEqual(result,{claimed:1,delivered:1,expired:0,retrying:0});
 assert.deepEqual(sent,[[endpoint,'vapid token']]);
 assert.equal(statusWrites,1);
});
test('M6.1a retryable push response uses exponential backoff',async()=>{
 let retries=0;const endpoint='https://fcm.googleapis.com/fcm/send/synthetic';
 const sql=async(statement)=>{
  if(statement===NOTE_CLAIM_SQL)return {rows:[{id:21,owner_user_id:'alice',endpoint,attempts:2}]};
  if(statement===NOTE_ELIGIBLE_SQL)return {rows:[{'?column?':1}]};
  if(statement===PUSH_QUIET_SQL)return {rows:[{not_before:new Date(0)}]};
  if(statement.includes("status=CASE WHEN attempts>=6")){retries++;return {rows:[]};}
  throw Error('Unexpected SQL');
 };
 const r=await dispatchDueNotes({sql,vapid:()=> 'vapid token',send:async()=>({ok:false,status:503})});
 assert.deepEqual(r,{claimed:1,delivered:0,expired:0,retrying:1});
 assert.equal(retries,1);
});

test('M6.1c do not send note push after entering quiet hours during an earlier retry',async()=>{
 const endpoint='https://fcm.googleapis.com/fcm/send/quiet';
 const future=new Date(Date.now()+60*60*1000);
 const actions=[];let sent=0;
 const sql=async(statement,args)=>{
  actions.push({statement,args});
  if(statement===NOTE_CLAIM_SQL)return {rows:[{id:77,owner_user_id:'alice',endpoint,attempts:1}]};
  if(statement===NOTE_ELIGIBLE_SQL)return {rows:[{'?column?':1}]};
  if(statement===PUSH_QUIET_SQL)return {rows:[{not_before:future}]};
  if(statement.includes("status='retry',next_attempt_at=$2::timestamptz"))return {rows:[]};
  throw Error('Unexpected statement');
 };
 const r=await dispatchDueNotes({sql,vapid:()=> 'unused',send:()=>{
  sent++;throw Error('Quiet hours breached');
 }});
 assert.equal(sent,0);
 assert.deepEqual(r,{claimed:1,delivered:0,expired:0,retrying:1});
 assert.ok(actions.some(x=>x.statement===PUSH_QUIET_SQL&&x.args[0]==='alice'));
});
