import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,TIMED_RANGE_SQL,TIMED_SAVE_SQL,TIMED_DELETE_SQL} from '../src/index.mjs';
const A='44444444-4444-4444-8444-444444444444';
const B='55555555-5555-4555-8555-555555555555';
const TASK='66666666-6666-4666-8666-666666666666';
const DAY='2026-11-07';
function setup(){
 const records=new Map(),calls=[];
 const query=async(sql,args)=>{
  calls.push({sql,args});
  if(sql===TIMED_RANGE_SQL){
   const [owner,from,to]=args;
   return {rows:[...records.values()].filter(x=>x.owner===owner&&x.day>=from&&x.day<=to)
    .sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start))
    .map(({owner,...row})=>row)};
  }
  if(sql===TIMED_SAVE_SQL){
   const [owner,id,task,day,start,end,timeZone,rev]=args;
   const old=records.get(id);
   if(old && old.owner!==owner)throw Object.assign(Error('Foreign ID'),{code:'40001'});
   if(old && (rev===0 && old.day===day && old.start===fmt(start)&&old.end===fmt(end) && old.taskId===task && old.timeZone===timeZone))
    return {rows:[{revision:old.revision}]};
   if((!old&&rev!==0)||(old&&old.revision!==rev))throw Object.assign(Error('Stale'),{code:'40001'});
   if([...records.values()].some(x=>x.owner===owner&&x.day===day&&x.id!==id&&x.start<fmt(end)&&fmt(start)<x.end))
    throw Object.assign(Error('Overlaps'),{code:'23P01'});
   const record={owner,id,taskId:task,day,start:fmt(start),end:fmt(end),timeZone,revision:old?old.revision+1:1};
   records.set(id,record);return {rows:[{revision:record.revision}]};
  }
  if(sql===TIMED_DELETE_SQL){
   const [owner,id,rev]=args,old=records.get(id);
   if(!old||old.owner!==owner||old.revision!==rev)return {rows:[]};
   records.delete(id);return {rows:[{id}]};
  }
  throw Error('Unknown SQL');
 };
 const verifyToken=async token=>{if(token!=='alice'&&token!=='bob')throw Error('Unauthorized');return token;};
 const api=createHandler({verifyToken,query});
 const req=(path,method='GET',token='alice',body)=>{
  return api.fetch(new Request('https://localhost.invalid'+path,{
   method,headers:{...(token?{authorization:'Bearer '+token}:{}),
   ...(body===undefined?{}:{'content-type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  }));
 };
 return {req,calls,records};
}
const fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const input=(o={})=>({taskId:TASK,day:DAY,start:'09:00',end:'10:30',timeZone:'Asia/Baku',revision:0,...o});
test('M4.2 task blocks split across dates and owned calendar read',async()=>{
 const {req,calls}=setup();
 assert.equal((await req('/v1/timed-intervals/'+A,'PUT','alice',input())).status,201);
 assert.equal((await req('/v1/timed-intervals/'+B,'PUT','alice',input({day:'2026-11-08',start:'11:00',end:'12:00'}))).status,201);
 const today=await (await req('/v1/timed-intervals?from='+DAY+'&to='+DAY)).json();
 assert.equal(today.intervals.length,1);
 assert.equal(today.intervals[0].timeZone,'Asia/Baku');
 const week=await (await req('/v1/timed-intervals?from=2026-11-07&to=2026-11-13')).json();
 assert.equal(week.intervals.length,2);
 assert.equal((await (await req('/v1/timed-intervals?from=2026-11-07&to=2026-11-13','GET','bob')).json()).intervals.length,0);
 assert.ok(calls.every(c=>['alice','bob'].includes(c.args[0])));
 assert.match(TIMED_RANGE_SQL,/s.owner_user_id=\$1/);
});
test('M4.2 overlap errors, adjacent blocks, moving and revision checks',async()=>{
 const {req}=setup();
 assert.equal((await req('/v1/timed-intervals/'+A,'PUT','alice',input())).status,201);
 const overlap=await req('/v1/timed-intervals/'+B,'PUT','alice',input({start:'10:00',end:'11:00'}));
 assert.equal(overlap.status,409);
 assert.match((await overlap.json()).error,/overlap/i);
 const adjacent=await req('/v1/timed-intervals/'+B,'PUT','alice',input({start:'10:30',end:'11:30'}));
 assert.equal(adjacent.status,201);
 assert.equal((await req('/v1/timed-intervals/'+B,'PUT','alice',input({revision:1,day:'2026-11-08',start:'09:00',end:'10:00'}))).status,200);
 const second=await (await req('/v1/timed-intervals?from=2026-11-08&to=2026-11-08')).json();
 assert.equal(second.intervals[0].revision,2);
 assert.equal((await req('/v1/timed-intervals/'+B,'PUT','alice',input({revision:1,day:'2026-11-08'}))).status,409);
 assert.equal((await req('/v1/timed-intervals/'+B,'DELETE','alice',{revision:1})).status,409);
 assert.equal((await req('/v1/timed-intervals/'+B,'DELETE','alice',{revision:2})).status,200);
});
test('M4.2 create idempotency never silently replaces an existing ID',async()=>{
 const {req}=setup();
 const first=input();
 assert.equal((await req('/v1/timed-intervals/'+A,'PUT','alice',first)).status,201);
 const retry=await req('/v1/timed-intervals/'+A,'PUT','alice',first);
 assert.equal(retry.status,201);
 assert.equal((await retry.json()).interval.revision,1);
 assert.equal((await req('/v1/timed-intervals/'+A,'PUT','alice',input({start:'15:00',end:'16:00'}))).status,409);
});
test('M4.2 rejects invalid ranges, time zones, clock ranges, and unauthorized access',async()=>{
 const {req,calls}=setup();
 for(const body of [
 input({end:'08:00'}),input({start:'24:00'}),input({start:'09:65'}),
 input({timeZone:'Moon/Base'}),input({day:'2026-02-30'}),input({revision:-1}),
 input({taskId:'not-a-uuid'}),input({end:'09:00'})
 ])assert.equal((await req('/v1/timed-intervals/'+A,'PUT','alice',body)).status,400,JSON.stringify(body));
 for(const [from,to] of [['2026-11-07','2027-11-07'],['2026-11-09','2026-11-07'],['2026-02-30','2026-03-01']]){
  assert.equal((await req('/v1/timed-intervals?from='+from+'&to='+to)).status,400);
 }
 for(const method of ['GET','PUT','DELETE']){
  const path=method==='GET'?'/v1/timed-intervals?from='+DAY+'&to='+DAY:'/v1/timed-intervals/'+A;
  const body=method==='PUT'?input():method==='DELETE'?{revision:1}:undefined;
  assert.equal((await req(path,method,null,body)).status,401);
  assert.equal((await req(path,method,'forged',body)).status,401);
 }
 assert.equal(calls.length,0);
});
test('M4.2 private CORS preflight is limited to trusted origin',async()=>{
 const {req}=setup();
 const api=createHandler({verifyToken:async()=>{throw Error('No auth')},query:async()=>{throw Error('No query')}});
 const url='https://example.invalid/v1/timed-intervals/'+A;
 const opts=origin=>api.fetch(new Request(url,{method:'OPTIONS',headers:{origin,'access-control-request-method':'PUT'}}));
 const allowed=await opts('https://azmath25.github.io');
 assert.equal(allowed.status,204);
 assert.match(allowed.headers.get('access-control-allow-methods'),/PUT/);
 assert.equal((await opts('https://untrusted.example')).status,403);
});
