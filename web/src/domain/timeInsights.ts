import type {ReportPeriod} from './timeReports';
export type CompletionHistory={
 eventId:string;taskId:string;title:string;completedAt:string;
 deadline:string|null;deadlineTime:string|null;onTime:boolean|null;
};
export type InsightWeek={
 weekStart:string;weekEndExclusive:string;recordedMs:number;completedEvents:number;
};
export type TimeInsights={
 period:ReportPeriod;timeZone:string;startDay:string;endDayExclusive:string;
 deadline:{completedEvents:number;withDeadline:number;withoutDeadline:number;onTime:number;late:number};
 estimate:{measuredTasks:number;excludedLegacyTasks:number;untrackedTasks:number;
  estimatedMinutes:number;recordedMs:number;absoluteErrorMs:number};
 history:CompletionHistory[];weeklyTrend:InsightWeek[];
};
function record(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid insights result');
 return value as Record<string,unknown>;
}
const numeric=(v:unknown):number=>{
 if(!((typeof v==='string'&&/^(0|[1-9]\d*)$/.test(v))||
  (typeof v==='number'&&Number.isInteger(v)))||
  !Number.isSafeInteger(Number(v))||Number(v)<0)
  throw Error('Invalid insights total');
 return Number(v);
};
const date=(x:unknown):x is string=>{
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const parsed=new Date(x+'T00:00:00Z');
 return Number.isFinite(parsed.valueOf())&&parsed.toISOString().slice(0,10)===x;
};
const uuid=(x:unknown):x is string=>typeof x==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function parseTimeInsights(value:unknown):TimeInsights{
 const d=record(value),deadline=record(d.deadline),estimate=record(d.estimate);
 if(!['day','week','month'].includes(String(d.period))||
  typeof d.timeZone!=='string'||d.timeZone.length>64||
  !date(d.startDay)||!date(d.endDayExclusive)||d.startDay>=d.endDayExclusive||
  !Array.isArray(d.history)||d.history.length>30||
  !Array.isArray(d.weeklyTrend)||d.weeklyTrend.length!==6)
  throw Error('Invalid insights format');
 try{new Intl.DateTimeFormat('en-US',{timeZone:d.timeZone});}
 catch{throw Error('Invalid insights timezone');}
 const counts={
  completedEvents:numeric(deadline.completedEvents),
  withDeadline:numeric(deadline.withDeadline),
  withoutDeadline:numeric(deadline.withoutDeadline),
  onTime:numeric(deadline.onTime),late:numeric(deadline.late)
 };
 if(counts.onTime+counts.late!==counts.withDeadline||
  counts.withDeadline+counts.withoutDeadline!==counts.completedEvents||
  d.history.length>counts.completedEvents)
  throw Error('Inconsistent deadline history');
 const measured={
  measuredTasks:numeric(estimate.measuredTasks),
  excludedLegacyTasks:numeric(estimate.excludedLegacyTasks),
  untrackedTasks:numeric(estimate.untrackedTasks),
  estimatedMinutes:numeric(estimate.estimatedMinutes),
  recordedMs:numeric(estimate.recordedMs),
  absoluteErrorMs:numeric(estimate.absoluteErrorMs)
 };
 if((measured.measuredTasks===0&&
     (measured.estimatedMinutes!==0||measured.recordedMs!==0||measured.absoluteErrorMs!==0))||
  (measured.measuredTasks>0&&(measured.estimatedMinutes===0||measured.recordedMs===0))||
  measured.measuredTasks>counts.completedEvents)
  throw Error('Inconsistent estimate evidence');
 const events=new Set<string>();
 const history:CompletionHistory[]=d.history.map(x=>{
  const item=record(x);
  if(typeof item.eventId!=='string'||!/^\d+$/.test(item.eventId)||
   events.has(item.eventId)||!uuid(item.taskId)||
   typeof item.title!=='string'||item.title.length>160||
   typeof item.completedAt!=='string'||!Number.isFinite(Date.parse(item.completedAt))||
   !(item.deadline===null||date(item.deadline))||
   !(item.deadlineTime===null||(typeof item.deadlineTime==='string'&&
     /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(item.deadlineTime)))||
   !(item.onTime===null||typeof item.onTime==='boolean')||
   (item.onTime!==null)!==(item.deadline!==null))
   throw Error('Invalid completion event');
  events.add(item.eventId);
  return item as CompletionHistory;
 });
 const weeklyTrend:InsightWeek[]=d.weeklyTrend.map((raw,index)=>{
  const w=record(raw);
  if(!date(w.weekStart)||!date(w.weekEndExclusive)||
   w.weekStart>=w.weekEndExclusive||
   (index>0&&w.weekStart<=String(record(d.weeklyTrend[index-1]).weekStart)))
   throw Error('Invalid weekly insight');
  return {
   weekStart:w.weekStart,weekEndExclusive:w.weekEndExclusive,
   recordedMs:numeric(w.recordedMs),completedEvents:numeric(w.completedEvents)
  };
 });
 return {
  period:d.period as ReportPeriod,timeZone:d.timeZone,
  startDay:d.startDay,endDayExclusive:d.endDayExclusive,
  deadline:counts,estimate:measured,history,weeklyTrend
 } as TimeInsights;
}
// Every CSV cell is quoted; prefix formula-like names so Excel/Sheets cannot
// execute user-controlled task titles or other spreadsheet formulas.
function csvCell(input:unknown):string{
 let value=String(input??'').replace(/\u0000/g,'');
 if(/^[\s\u0000-\u001f]*[=+@-]/.test(value))value="'"+value;
 return '"'+value.replace(/"/g,'""')+'"';
}
const csvRow=(values:unknown[])=>values.map(csvCell).join(',');
export function timeInsightsCsv(data:TimeInsights):string{
 const d=data.deadline,e=data.estimate;
 const rows=[
  csvRow(['Dayframe private completion insights','dayframe.insights.v1']),
  csvRow(['Period',data.period,'Time zone',data.timeZone,'From',data.startDay,
   'End exclusive',data.endDayExclusive]),
  csvRow(['Metric','Value','Notes']),
  csvRow(['Completion events',d.completedEvents,'Can include multiple completions of a reopened task']),
  csvRow(['On-time events',d.onTime,'Completion-time deadline snapshot']),
  csvRow(['Late events',d.late,'Completion-time deadline snapshot']),
  csvRow(['No deadline at completion',d.withoutDeadline,'Not included in on-time ratio']),
  csvRow(['Estimate-comparable tasks',e.measuredTasks,'Positive exact direct tracking and no known legacy residual']),
  csvRow(['Estimated minutes',e.estimatedMinutes,'Completion-time estimate for eligible task']),
  csvRow(['Exact tracked milliseconds',e.recordedMs,'Not all human effort; paused time excluded']),
  csvRow(['Absolute error milliseconds',e.absoluteErrorMs,'Sum of absolute task-level estimate/tracked differences']),
  csvRow(['Legacy excluded tasks',e.excludedLegacyTasks,'Unknown segment attribution']),
  csvRow(['Untracked excluded tasks',e.untrackedTasks,'No direct recorded focus time']),
  csvRow(['History detail limited to 30 events',d.completedEvents>30?'yes':'no',
   'Summary counts include all completion events']),
  '',
  csvRow(['Week starting','End exclusive','Exact recorded milliseconds','Completion events'])
 ];
 for(const w of data.weeklyTrend)
  rows.push(csvRow([w.weekStart,w.weekEndExclusive,w.recordedMs,w.completedEvents]));
 rows.push('',csvRow(['Completion event ID','Task ID','Title','Completed at UTC',
  'Deadline at completion','Deadline time','On-time outcome']));
 for(const h of data.history)
  rows.push(csvRow([h.eventId,h.taskId,h.title,h.completedAt,
   h.deadline,h.deadlineTime,h.onTime]));
 return '\ufeff'+rows.join('\r\n')+'\r\n';
}
