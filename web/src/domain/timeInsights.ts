import type {ReportPeriod} from './timeReports';
export type CompletionHistory={
 eventId:string;taskId:string;title:string;completedAt:string;
 deadline:string|null;deadlineTime:string|null;onTime:boolean|null;
};
export type TimeInsights={
 period:ReportPeriod;timeZone:string;startDay:string;endDayExclusive:string;
 deadline:{completedEvents:number;withDeadline:number;withoutDeadline:number;onTime:number;late:number};
 estimate:{measuredTasks:number;excludedLegacyTasks:number;estimatedMinutes:number;recordedMs:number};
 history:CompletionHistory[];
};
const record=(value:unknown):Record<string,unknown>=>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid insights result');
 return value as Record<string,unknown>;
};
const nonnegative=(v:unknown):number=>{
 if(!((typeof v==='string'&&/^\d+$/.test(v))||
     (typeof v==='number'&&Number.isInteger(v)))||
    !Number.isSafeInteger(Number(v))||Number(v)<0)throw Error('Invalid insights total');
 return Number(v);
};
export function parseTimeInsights(value:unknown):TimeInsights{
 const d=record(value),deadline=record(d.deadline),estimate=record(d.estimate);
 if(!['day','week','month'].includes(String(d.period))||
    typeof d.timeZone!=='string'||d.timeZone.length>64||
    typeof d.startDay!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d.startDay)||
    typeof d.endDayExclusive!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d.endDayExclusive)||
    !Array.isArray(d.history)||d.history.length>30)
  throw Error('Invalid insights format');
 const counts={
  completedEvents:nonnegative(deadline.completedEvents),
  withDeadline:nonnegative(deadline.withDeadline),
  withoutDeadline:nonnegative(deadline.withoutDeadline),
  onTime:nonnegative(deadline.onTime),late:nonnegative(deadline.late)
 };
 if(counts.onTime+counts.late!==counts.withDeadline||
    counts.withDeadline+counts.withoutDeadline!==counts.completedEvents)
  throw Error('Inconsistent deadline history');
 const results=d.history.map(x=>{
  const item=record(x);
  if(typeof item.eventId!=='string'||typeof item.taskId!=='string'||
   typeof item.title!=='string'||item.title.length>160||
   typeof item.completedAt!=='string'||
   !(item.deadline===null||typeof item.deadline==='string')||
   !(item.deadlineTime===null||typeof item.deadlineTime==='string')||
   !(item.onTime===null||typeof item.onTime==='boolean'))
   throw Error('Invalid completion event');
  return item as CompletionHistory;
 });
 const measured={
  measuredTasks:nonnegative(estimate.measuredTasks),
  excludedLegacyTasks:nonnegative(estimate.excludedLegacyTasks),
  estimatedMinutes:nonnegative(estimate.estimatedMinutes),
  recordedMs:nonnegative(estimate.recordedMs)
 };
 return {
  period:d.period as ReportPeriod,timeZone:d.timeZone as string,
  startDay:d.startDay as string,endDayExclusive:d.endDayExclusive as string,
  deadline:counts,estimate:measured,history:results
 };
}
