import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,TIME_INSIGHTS_SQL} from '../src/index.mjs';

const SAMPLE={
 period:'week',timeZone:'Asia/Baku',startDay:'2026-11-02',endDayExclusive:'2026-11-09',
 deadline:{completedEvents:3,withDeadline:2,withoutDeadline:1,onTime:1,late:1},
 estimate:{measuredTasks:2,excludedLegacyTasks:1,estimatedMinutes:'90',recordedMs:'5400000'},
 history:[]
};
function setup(){
 const calls=[];
 const handler=createHandler({
  verifyToken:async(token)=>{if(token!=='owner')throw Error('Unauthorized');return 'owner';},
  query:async(sql,args)=>{
   if(sql!==TIME_INSIGHTS_SQL)throw Error('Unexpected SQL');
   calls.push(args);return {rows:[SAMPLE]};
  }
 });
 const request=(path,method='GET',token='owner')=>handler.fetch(new Request(
  'https://invalid.example'+path,{
   method,headers:token?{authorization:'Bearer '+token}:{}
  }));
 return {request,calls};
}
test('M7.3 deadline insight API scopes identity and bounds to owner',async()=>{
 const {request,calls}=setup();
 assert.equal((await request('/v1/time-insights?period=week&day=2026-11-07','GET',null)).status,401);
 assert.equal((await request('/v1/time-insights?period=week&day=2026-11-07','GET','forged')).status,401);
 const reply=await request('/v1/time-insights?period=week&day=2026-11-07&owner=bob');
 assert.equal(reply.status,200);
 assert.equal((await reply.json()).insights.deadline.completedEvents,3);
 assert.deepEqual(calls,[['owner','week','2026-11-07']]);
 for(const invalid of [
  '/v1/time-insights?period=year&day=2026-11-07',
  '/v1/time-insights?period=week&day=2026-02-30',
  '/v1/time-insights?period=day&day=1900-01-01',
  '/v1/time-insights?period=week'
 ])assert.equal((await request(invalid)).status,400);
 assert.equal((await request('/v1/time-insights?period=week&day=2026-11-07','POST')).status,405);
 assert.equal(calls.length,1);
});
test('M7.3 deadline and estimate SQL derives completion snapshots from the owner audit',()=>{
 assert.match(TIME_INSIGHTS_SQL,/e.owner_user_id=\$1/);
 assert.match(TIME_INSIGHTS_SQL,/e.event_type='completed'/);
 assert.match(TIME_INSIGHTS_SQL,/after_state->>'deadline'/);
 assert.match(TIME_INSIGHTS_SQL,/after_state->>'estimate'/);
 assert.match(TIME_INSIGHTS_SQL,/s.id=g.session_id AND s.owner_user_id=\$1/);
 assert.match(TIME_INSIGHTS_SQL,/time_session_segments/);
 assert.match(TIME_INSIGHTS_SQL,/excludedLegacyTasks|excluded_legacy_tasks/);
 assert.match(TIME_INSIGHTS_SQL,/AT TIME ZONE b.zone/);
});
