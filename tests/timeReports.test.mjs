import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePeriodReport} from '../web/src/domain/timeReports.ts';
const W='a1111111-1111-4111-8111-111111111111';
const T='a2222222-2222-4222-8222-222222222222';
const valid=()=>({
 period:'week',timeZone:'Asia/Baku',startDay:'2026-11-02',
 endDayExclusive:'2026-11-09',accountRecordedMs:'3600000',
 accountLegacyEstimatedMs:'600000',accountPlannedMinutes:'120',runningIncluded:true,
 workspaces:[{workspaceId:W,name:'Research',archived:false,recordedMs:'3600000',
  legacyEstimatedMs:'600000',plannedMinutes:'120'}],
 longTermTasks:[{taskId:T,title:'Research paper',workspaceId:W,status:'open',
  recordedMs:'3600000',plannedMinutes:'120'}]
});
test('M7.2 parser accepts owner report, exact and legacy values separately',()=>{
 const result=parsePeriodReport(valid());
 assert.equal(result.accountRecordedMs,3600000);
 assert.equal(result.accountLegacyEstimatedMs,600000);
 assert.equal(result.accountPlannedMinutes,120);
 assert.equal(result.timeZone,'Asia/Baku');
 assert.equal(result.workspaces[0].recordedMs,3600000);
 assert.equal(result.longTermTasks[0].recordedMs,3600000);
});
test('M7.2 parser rejects invalid total, overflow and forged structures',()=>{
 for(const invalid of [
  {...valid(),accountRecordedMs:'3600001'},
  {...valid(),accountPlannedMinutes:'-1'},
  {...valid(),accountRecordedMs:'9007199254740992'},
  {...valid(),longTermTasks:[{...valid().longTermTasks[0],status:'other'}]},
  {...valid(),workspaces:[{...valid().workspaces[0],archived:'no'}]},
  {...valid(),period:'year'},
  {...valid(),workspaces:'not-an-array'}
 ])assert.throws(()=>parsePeriodReport(invalid));
});
