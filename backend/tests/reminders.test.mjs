import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,ALERT_LIST_SQL,ALERT_ACTION_SQL,NOTIFICATION_PREF_GET_SQL,NOTIFICATION_PREF_SAVE_SQL,PUSH_SUB_SAVE_SQL,PUSH_SUB_DELETE_SQL,PUSH_SUB_STATUS_SQL} from '../src/index.mjs';

const TASK='66666666-6666-4666-8666-666666666666';
const record={taskId:TASK,title:'Research notes',kind:'reminder',day:'2026-11-07',time:'09:00',dueAt:'2026-11-07T05:00:00.000Z',revision:null,acknowledgedAt:null,snoozedUntil:null};
function setup(){
 const calls=[];
 const api=createHandler({
  verifyToken:async token=>{if(token!=='alice'&&token!=='bob')throw Error('Invalid token');return token;},
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql===ALERT_LIST_SQL)return {rows:args[0]==='alice'?[record]:[]};
   if(sql===ALERT_ACTION_SQL)return {rows:[{revision:args[5]+1}]};
   throw Error('Unexpected query');
  }
 });
 const req=(path,method='GET',token='alice',body)=>api.fetch(new Request('https://invalid.example'+path,{
  method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 }));
 return {req,calls};
}
test('M4.3 due alerts are owner scoped and require verified identity',async()=>{
 const {req,calls}=setup();
 const a=await req('/v1/alerts?timeZone=Asia%2FBaku');
 assert.equal(a.status,200);
 assert.equal((await a.json()).alerts[0].taskId,TASK);
 assert.deepEqual((await (await req('/v1/alerts?timeZone=UTC','GET','bob')).json()).alerts,[]);
 assert.equal((await req('/v1/alerts?timeZone=UTC','GET',null)).status,401);
 assert.equal((await req('/v1/alerts?timeZone=UTC','GET','forged')).status,401);
 assert.deepEqual(calls.map(x=>x.args[0]),['alice','bob']);
 assert.match(ALERT_LIST_SQL,/t.owner_user_id=\$1/);
 assert.match(ALERT_LIST_SQL,/a.owner_user_id=\$1/);
});
test('M4.3 rejects invalid time zones and malformed snoozes before queries',async()=>{
 const {req,calls}=setup();
 for(const zone of ['Moon%2FSea','%27%3BDROP%20TABLE','A'.repeat(70)])
  assert.equal((await req('/v1/alerts?timeZone='+zone)).status,400);
 for(const body of [
  {day:'2026-11-07',time:'09:00',revision:-1,action:'acknowledge'},
  {day:'2026-11-07',time:'27:00',revision:0,action:'acknowledge'},
  {day:'2026-02-30',time:'09:00',revision:0,action:'acknowledge'},
  {day:'2026-11-07',time:'09:00',revision:0,action:'snooze'},
  {day:'2026-11-07',time:'09:00',revision:0,action:'snooze',until:'1999-01-01T00:00:00Z'},
  {day:'2026-11-07',time:'09:00',revision:0,action:'reset',until:'2027-01-01T00:00:00Z'}
 ])assert.equal((await req('/v1/alerts/'+TASK+'/reminder','POST','alice',body)).status,400);
 assert.equal(calls.length,0);
});
test('M4.3 action routes forward owned occurrence and revision without modifying task deadlines',async()=>{
 const {req,calls}=setup();
 const body={day:'2026-11-07',time:'09:00',revision:0,action:'acknowledge'};
 const response=await req('/v1/alerts/'+TASK+'/reminder','POST','alice',body);
 assert.equal(response.status,200);
 assert.equal((await response.json()).revision,1);
 const until=new Date(Date.now()+3600000).toISOString();
 assert.equal((await req('/v1/alerts/'+TASK+'/deadline','POST','bob',{...body,action:'snooze',until})).status,200);
 assert.equal(calls.length,2);
 assert.equal(calls[0].sql,ALERT_ACTION_SQL);
 assert.deepEqual(calls[0].args,['alice',TASK,'reminder','2026-11-07','09:00',0,'acknowledge',null]);
 assert.equal(calls[1].args[0],'bob');
 assert.equal(calls[1].args[2],'deadline');
 assert.equal(calls[1].args[7],until);
 assert.doesNotMatch(ALERT_ACTION_SQL,/UPDATE dayframe\.tasks/i);
});

test('M4.3 push enrollment is owner scoped and rejects untrusted push hosts',async()=>{
 const calls=[];
 const api=createHandler({
  verifyToken:async token=>{if(!['alice','bob'].includes(token))throw Error('Bad token');return token;},
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql===NOTIFICATION_PREF_GET_SQL)return {rows:[]};
   if(sql===NOTIFICATION_PREF_SAVE_SQL)return {rows:[{timeZone:args[1]}]};
   if(sql===PUSH_SUB_SAVE_SQL||sql===PUSH_SUB_DELETE_SQL)return {rows:[]};
   if(sql===PUSH_SUB_STATUS_SQL)return {rows:args[0]==='alice'?[{registered:1}]:[]};
   throw Error('Unexpected query');
  }
 });
 const req=(path,method='GET',token='alice',body)=>api.fetch(new Request('https://local.invalid'+path,{
  method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 }));
 assert.equal((await req('/v1/notification-preferences','GET')).status,200);
 assert.equal((await req('/v1/notification-preferences','PUT','alice',{timeZone:'Asia/Baku'})).status,200);
 assert.equal((await req('/v1/notification-preferences','PUT','alice',{timeZone:'Moon/Base'})).status,400);
 const endpoint='https://fcm.googleapis.com/fcm/send/synthetic-endpoint';
 for(const bad of ['http://localhost/secrets','https://fcm.googleapis.com.evil.example/push',
 'https://username:password@fcm.googleapis.com/send','https://127.0.0.1/test']){
  assert.equal((await req('/v1/push-subscription','PUT','alice',{endpoint:bad})).status,400,bad);
 }
 assert.equal((await req('/v1/push-subscription','PUT','alice',{endpoint})).status,200);
 assert.equal((await req('/v1/push-subscription/status','POST','alice',{endpoint})).status,200);
 assert.equal((await (await req('/v1/push-subscription/status','POST','bob',{endpoint})).json()).registered,false);
 assert.equal((await req('/v1/push-subscription','DELETE','alice',{endpoint})).status,200);
 assert.ok(calls.some(x=>x.sql===PUSH_SUB_SAVE_SQL&&x.args[0]==='alice'));
 assert.ok(calls.some(x=>x.sql===PUSH_SUB_STATUS_SQL&&x.args[0]==='bob'));
 assert.equal(calls.length,6);
});
