import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,TIME_PERIOD_REPORT_SQL} from '../src/index.mjs';
const report={
 period:'day',timeZone:'Asia/Baku',startDay:'2026-11-07',endDayExclusive:'2026-11-08',
 accountRecordedMs:'1800000',accountLegacyEstimatedMs:'300000',
 accountPlannedMinutes:'60',runningIncluded:false,workspaces:[],longTermTasks:[]
};
function api(){
 const calls=[];
 const handler=createHandler({
  verifyToken:async token=>{if(token!=='owner')throw Error('Not allowed');return 'owner';},
  query:async(sql,args)=>{
   if(sql!==TIME_PERIOD_REPORT_SQL)throw Error('Unexpected SQL');
   calls.push(args);return {rows:[report]};
  }
 });
 const request=(path,method='GET',token='owner')=>handler.fetch(new Request(
  'https://invalid.example'+path,{method,headers:token?{authorization:'Bearer '+token}:{}}));
 return {request,calls};
}
test('M7.2 reports validate period and date and derive owner from JWT',async()=>{
 const {request,calls}=api();
 assert.equal((await request('/v1/time-report?period=day&day=2026-11-07', 'GET',null)).status,401);
 assert.equal((await request('/v1/time-report?period=day&day=2026-11-07','GET','forged')).status,401);
 for(const path of [
  '/v1/time-report?period=hour&day=2026-11-07',
  '/v1/time-report?period=week&day=2026-02-30',
  '/v1/time-report?period=month&day=bad',
  '/v1/time-report?period=day&day=1900-01-01',
  '/v1/time-report?period=day'
 ])assert.equal((await request(path)).status,400);
 assert.equal(calls.length,0);
 const response=await request('/v1/time-report?period=day&day=2026-11-07&owner=bob');
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).report,report);
 assert.deepEqual(calls,[['owner','day','2026-11-07']]);
 assert.equal((await request('/v1/time-report?period=day&day=2026-11-07','POST')).status,405);
});
test('M7.2 report SQL is owner-scoped and explicitly segregates historical time',()=>{
 assert.match(TIME_PERIOD_REPORT_SQL,/s.owner_user_id=\$1/);
 assert.match(TIME_PERIOD_REPORT_SQL,/i.owner_user_id=\$1/);
 assert.match(TIME_PERIOD_REPORT_SQL,/accumulated_ms-COALESCE\(g.total_ms,0\)/);
 assert.match(TIME_PERIOD_REPORT_SQL,/AT TIME ZONE zone/);
 assert.match(TIME_PERIOD_REPORT_SQL,/running_spans/);
 assert.match(TIME_PERIOD_REPORT_SQL,/end_day/);
 assert.match(TIME_PERIOD_REPORT_SQL,/longterm_recorded/);
});
