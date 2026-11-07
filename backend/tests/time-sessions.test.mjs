import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,TIME_ACTIVE_SQL,TIME_TRANSITION_SQL,TIME_ROLLUPS_SQL} from '../src/index.mjs';
const ID='77777777-7777-4777-8777-777777777777';
const OTHER='88888888-8888-4888-8888-888888888888';
const TASK='99999999-9999-4999-8999-999999999999';
const snapshot={id:ID,taskId:TASK,taskTitle:'Write paper',state:'running',
 startedAt:'2026-11-07T12:00:00Z',segmentStartedAt:'2026-11-07T12:00:00Z',
 accumulatedMs:0,revision:1,serverNow:'2026-11-07T12:00:01Z',endedAt:null,endReason:null};
function make({rejectConflict=false}={}){
 const calls=[];
 const api=createHandler({
  verifyToken:async token=>{if(!['alice','bob'].includes(token))throw Error('Invalid JWT');return token;},
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql===TIME_ROLLUPS_SQL)return {rows:[{
    session:args[0]==='alice'?snapshot:null,
    tasks:args[0]==='alice'?[{taskId:TASK,directMs:'2000',totalMs:'5000'}]:[],
    workspaces:args[0]==='alice'?[{workspaceId:OTHER,totalMs:'2000'}]:[],
    accountTotalMs:args[0]==='alice'?'2000':'0',deletedTaskMs:'0',
    activeAncestorIds:args[0]==='alice'?[TASK,OTHER]:[]
   }]};
   if(sql===TIME_TRANSITION_SQL){
    if(rejectConflict)throw Object.assign(Error('Time session changed'),{code:'40001'});
    return {rows:[{session:{...snapshot,id:args[2],taskId:args[3]??TASK,state:args[1]==='stop'?'stopped':'running'}}]};
   }
   throw Error('Unexpected query '+sql);
  }
 });
 const req=(path,method='GET',token='alice',body)=>api.fetch(new Request('https://test.invalid'+path,{
  method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 }));
 return {req,calls};
}
test('M5.1 reads only authenticated active timer belonging to current JWT',async()=>{
 const {req,calls}=make();
 const a=await req('/v1/time-session');assert.equal(a.status,200);
 const response=await a.json();
 assert.deepEqual(response.session,snapshot);
 assert.deepEqual(response.taskTotals,[{taskId:TASK,totalMs:'2000'}]);
 assert.equal(response.rollups.tasks[0].totalMs,'5000');
 assert.equal(response.rollups.accountTotalMs,'2000');
 const b=await req('/v1/time-session','GET','bob');
 assert.equal(b.status,200);assert.equal((await b.json()).session,null);
 assert.equal((await req('/v1/time-session','GET',null)).status,401);
 assert.equal((await req('/v1/time-session','GET','forged')).status,401);
 assert.deepEqual(calls.map(x=>x.args),[['alice'],['bob']]);
 assert.match(TIME_ACTIVE_SQL,/owner_user_id=\$1/);
});
test('M5.1 validates action, UUID and revision before database access',async()=>{
 const {req,calls}=make();
 for(const body of [
  {},{action:'delete',sessionId:ID},{action:'start',sessionId:'bad',taskId:TASK},
  {action:'start',sessionId:ID,taskId:'bad'},{action:'switch',sessionId:ID,taskId:TASK,previousId:ID,revision:1},
  {action:'switch',sessionId:ID,taskId:TASK,previousId:OTHER,revision:-1},
  {action:'pause',sessionId:ID,revision:0},{action:'stop',sessionId:ID,revision:1.5},
  {action:'resume',sessionId:ID,revision:'5'}
 ]){
  const response=await req('/v1/time-session','POST','alice',body);
  assert.equal(response.status,400,'Should reject '+JSON.stringify(body));
 }
 assert.equal(calls.length,0);
});
test('M5.1 start, switch and stop use server functions without accepting browser owner ID',async()=>{
 const {req,calls}=make();
 const start={action:'start',sessionId:ID,taskId:TASK,owner_user_id:'bob'};
 assert.equal((await req('/v1/time-session','POST','alice',start)).status,201);
 const switched={action:'switch',sessionId:OTHER,taskId:TASK,previousId:ID,revision:1};
 assert.equal((await req('/v1/time-session','POST','bob',switched)).status,201);
 assert.equal((await req('/v1/time-session','POST','alice',{action:'stop',sessionId:ID,revision:1})).status,200);
 assert.ok(calls.every(c=>c.sql===TIME_TRANSITION_SQL));
 assert.deepEqual(calls[0].args,['alice','start',ID,TASK,0,null]);
 assert.deepEqual(calls[1].args,['bob','switch',OTHER,TASK,1,ID]);
 assert.deepEqual(calls[2].args,['alice','stop',ID,null,1,null]);
});
test('M5.1 simultaneous competing device transitions become explicit conflicts',async()=>{
 const {req}=make({rejectConflict:true});
 const response=await req('/v1/time-session','POST','alice',{action:'pause',sessionId:ID,revision:1});
 assert.equal(response.status,409);
 const err=(await response.json()).error;
 assert.match(err,/Timer changed on another device/);
 assert.doesNotMatch(err,/SELECT|postgres|password/i);
});

test('M5.2 rollup snapshot preserves direct versus descendants, owner scope, and one query',async()=>{
 const {req,calls}=make();
 const own=await (await req('/v1/time-session')).json();
 assert.equal(own.rollups.tasks[0].directMs,'2000');
 assert.equal(own.rollups.tasks[0].totalMs,'5000');
 assert.deepEqual(own.rollups.activeAncestorIds,[TASK,OTHER]);
 assert.equal(own.rollups.workspaces[0].totalMs,'2000');
 assert.deepEqual(calls,[{sql:TIME_ROLLUPS_SQL,args:['alice']}]);
 const other=await (await req('/v1/time-session','GET','bob')).json();
 assert.deepEqual(other.rollups.tasks,[]);
 assert.equal(other.rollups.accountTotalMs,'0');
 assert.equal(calls.length,2);
});
