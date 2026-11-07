import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,TIME_WEEK_SQL,TIME_WEEK_TARGET_SQL} from '../src/index.mjs';

const WS='11111111-1111-4111-8111-111111111111';
const row={timeZone:'Asia/Baku',weekStart:'2026-11-02',weekEnd:'2026-11-09',
 workspaces:[{workspaceId:WS,name:'General',archived:false,targetMinutes:300,revision:1,
  actualMs:'3600000',legacyEstimatedMs:'60000',plannedMinutes:'90'}],
 accountActualMs:'3600000',accountLegacyEstimatedMs:'60000',accountPlannedMinutes:'90'};
function setup({conflict=false}={}){
 const calls=[];
 const handler=createHandler({
  verifyToken:async token=>{if(token==='alice'||token==='bob')return token;throw Error('Invalid token');},
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql===TIME_WEEK_SQL)return {rows:[args[0]==='alice'?row:{
    ...row,workspaces:[],accountActualMs:'0',
    accountLegacyEstimatedMs:'0',accountPlannedMinutes:'0'}]};
   if(sql===TIME_WEEK_TARGET_SQL)return {rows:conflict?[]:[{
    workspaceId:args[1],targetMinutes:args[2],revision:args[3]+1
   }]};
   throw Error('Unexpected SQL');
  }
 });
 const request=(path,method='GET',token='alice',body)=>{
  const req=new Request('https://test.invalid'+path,{
   method,headers:{...(token?{authorization:'Bearer '+token}:{}),
    ...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  return handler.fetch(req);
 };
 return {request,calls};
}
test('M5.3 weekly snapshot uses JWT owner, never browser zone or owner ID',async()=>{
 const {request,calls}=setup();
 const res=await request('/v1/time-week?timeZone=Pacific%2FHawaii&owner=bob');
 assert.equal(res.status,200);
 const week=(await res.json()).week;
 assert.deepEqual(week,row);
 assert.equal((await (await request('/v1/time-week','GET','bob')).json()).week.workspaces.length,0);
 assert.deepEqual(calls.map(c=>c.args),[['alice'],['bob']]);
 assert.equal(calls[0].sql,TIME_WEEK_SQL);
 assert.equal((await request('/v1/time-week','GET',null)).status,401);
 assert.equal((await request('/v1/time-week','GET','not-valid')).status,401);
});
test('M5.3 weekly targets require integer minute amount and observed revision',async()=>{
 const {request,calls}=setup();
 const invalid=[
  {targetMinutes:-1,revision:0},
  {targetMinutes:10081,revision:0},
  {targetMinutes:1.5,revision:0},
  {targetMinutes:600,revision:-1},
  {targetMinutes:600,revision:'0'},
  {targetMinutes:600},
  {targetMinutes:null,revision:0},
  {},
 ];
 for(const body of invalid){
  assert.equal((await request('/v1/time-week/targets/'+WS,'PUT','alice',body)).status,400);
 }
 assert.equal(calls.length,0);
 const good=await request('/v1/time-week/targets/'+WS,'PUT','bob',
  {targetMinutes:420,revision:3,owner_user_id:'alice'});
 assert.equal(good.status,200);
 assert.deepEqual((await good.json()).target,{workspaceId:WS,targetMinutes:420,revision:4});
 assert.deepEqual(calls[0],{sql:TIME_WEEK_TARGET_SQL,args:['bob',WS,420,3]});
});
test('M5.3 stale weekly targets return conflict without spilling SQL',async()=>{
 const {request}=setup({conflict:true});
 const res=await request('/v1/time-week/targets/'+WS,'PUT','alice',{targetMinutes:600,revision:0});
 assert.equal(res.status,409);
 const detail=(await res.json()).error;
 assert.match(detail,/target changed/i);
 assert.doesNotMatch(detail,/SELECT|SQL|postgres/i);
});
