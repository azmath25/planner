import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTimeInsights,timeInsightsCsv} from '../web/src/domain/timeInsights.ts';

const value=()=>({
 period:'week',timeZone:'Asia/Baku',startDay:'2026-11-02',endDayExclusive:'2026-11-09',
 deadline:{completedEvents:3,withDeadline:2,withoutDeadline:1,onTime:1,late:1},
 estimate:{measuredTasks:2,excludedLegacyTasks:1,untrackedTasks:0,
  estimatedMinutes:'90',recordedMs:'3600000',absoluteErrorMs:'1800000'},
 weeklyTrend:[
  ['2026-09-28','2026-10-05'],['2026-10-05','2026-10-12'],
  ['2026-10-12','2026-10-19'],['2026-10-19','2026-10-26'],
  ['2026-10-26','2026-11-02'],['2026-11-02','2026-11-09']
 ].map(([weekStart,weekEndExclusive])=>({
  weekStart,weekEndExclusive,recordedMs:'600000',completedEvents:1
 })),
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

test('M7.3 six-week progress data remains exact and ordered',()=>{
 const parsed=parseTimeInsights(value());
 assert.equal(parsed.weeklyTrend.length,6);
 assert.equal(parsed.weeklyTrend[0].recordedMs,600000);
 assert.equal(parsed.estimate.absoluteErrorMs,1800000);
 assert.equal(parsed.estimate.untrackedTasks,0);
 assert.throws(()=>parseTimeInsights({...value(),weeklyTrend:[]}),/Invalid/);
 assert.throws(()=>parseTimeInsights({...value(),
  weeklyTrend:[...value().weeklyTrend].reverse()}),/Invalid/);
});
test('M7.3 CSV escapes formula-like task names, quotes and line breaks',()=>{
 const data=parseTimeInsights({...value(),history:[{
  ...value().history[0],title:'=HYPERLINK("https://example.invalid","bad")\nsecondary'
 }]});
 const csv=timeInsightsCsv(data);
 assert.ok(csv.startsWith('\ufeff'));
 assert.ok(csv.includes('dayframe.insights.v1'));
 assert.ok(csv.includes("'=HYPERLINK"));
 assert.ok(csv.includes('""https://example.invalid""'));
 assert.ok(csv.includes('2026-11-02'));
 assert.ok(!csv.includes('\r\n=HYPERLINK'));
});
