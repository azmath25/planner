import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTimeInsights} from '../web/src/domain/timeInsights.ts';

const value=()=>({
 period:'week',timeZone:'Asia/Baku',startDay:'2026-11-02',endDayExclusive:'2026-11-09',
 deadline:{completedEvents:3,withDeadline:2,withoutDeadline:1,onTime:1,late:1},
 estimate:{measuredTasks:2,excludedLegacyTasks:1,estimatedMinutes:'90',recordedMs:'3600000'},
 history:[{
  eventId:'123',taskId:'11111111-1111-4111-8111-111111111111',
  title:'Research paper',completedAt:'2026-11-07T18:00:00Z',
  deadline:'2026-11-07',deadlineTime:null,onTime:true
 }]
});
test('M7.3 insight parser preserves separately verified histories and estimate totals',()=>{
 const parsed=parseTimeInsights(value());
 assert.equal(parsed.deadline.completedEvents,3);
 assert.equal(parsed.deadline.withDeadline,2);
 assert.equal(parsed.estimate.estimatedMinutes,90);
 assert.equal(parsed.history[0].title,'Research paper');
});
test('M7.3 insight parser rejects inconsistent counts, overflow and invalid audit states',()=>{
 for(const invalid of [
  {...value(),deadline:{...value().deadline,onTime:3}},
  {...value(),deadline:{...value().deadline,withoutDeadline:7}},
  {...value(),estimate:{...value().estimate,recordedMs:'9007199254740999'}},
  {...value(),estimate:{...value().estimate,measuredTasks:-3}},
  {...value(),history:[{...value().history[0],onTime:'unknown'}]},
  {...value(),history:new Array(31).fill(value().history[0])}
 ])assert.throws(()=>parseTimeInsights(invalid),/Invalid|Inconsistent/);
});
