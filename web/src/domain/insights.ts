import type {PeriodReport,ReportPeriod} from './timeReports';
export type InsightTask={
 taskId:string;title:string;workspaceId:string;completedAt:string;trackedMs:number;
 estimateMinutes:number|null;deadlineDay:string|null;deadlineTime:string|null;
 metDeadline:boolean|null;snapshotExists:boolean;comparable:boolean;
};
export type InsightWeek={
 weekStart:string;weekEndExclusive:string;recordedMs:number;finishedTasks:number;
};
export type InsightsReport={
 period:ReportPeriod;timeZone:string;startDay:string;endDayExclusive:string;
 finishedTasks:number;estimateComparedTasks:number;estimateUntrackedTasks:number;
 comparedEstimatedMs:number;comparedTrackedMs:number;absoluteErrorMs:number;
 deadlinesKnown:number;deadlinesMet:number;deadlinesLate:number;
 completionSnapshotsMissing:number;tasks:InsightTask[];weeklyTrend:InsightWeek[];
};
const uuid=(x:unknown)=>typeof x==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const date=(x:unknown):x is string=>{
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const d=new Date(x+'T00:00:00Z');
 return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===x;
};
const obj=(x:unknown):Record<string,unknown>=>{
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('Invalid insights response');
 return x as Record<string,unknown>;
};
const count=(x:unknown)=>{
 if(typeof x!=='number'||!Number.isSafeInteger(x)||x<0)
  throw Error('Invalid insights count');
 return x;
};
const ms=(x:unknown)=>{
 if(!((typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x))||
      (typeof x==='number'&&Number.isSafeInteger(x)&&x>=0)))
  throw Error('Invalid insights time');
 const n=Number(x);
 if(!Number.isSafeInteger(n)||n<0)throw Error('Unsupported insights precision');
 return n;
};
export function parseInsights(input:unknown):InsightsReport{
 const r=obj(input);
 if(!['day','week','month'].includes(String(r.period))||
    !date(r.startDay)||!date(r.endDayExclusive)||
    r.startDay>=r.endDayExclusive||
    typeof r.timeZone!=='string'||r.timeZone.length>64||
    !Array.isArray(r.tasks)||r.tasks.length>200||
    !Array.isArray(r.weeklyTrend)||r.weeklyTrend.length!==6)
  throw Error('Invalid insights period');
 try{new Intl.DateTimeFormat('en-US',{timeZone:r.timeZone});}
 catch{throw Error('Invalid insights time zone');}
 const finishedTasks=count(r.finishedTasks);
 const estimateComparedTasks=count(r.estimateComparedTasks);
 const estimateUntrackedTasks=count(r.estimateUntrackedTasks);
 const deadlinesKnown=count(r.deadlinesKnown),deadlinesMet=count(r.deadlinesMet);
 const deadlinesLate=count(r.deadlinesLate);
 const completionSnapshotsMissing=count(r.completionSnapshotsMissing);
 const comparedEstimatedMs=ms(r.comparedEstimatedMs),comparedTrackedMs=ms(r.comparedTrackedMs);
 const absoluteErrorMs=ms(r.absoluteErrorMs);
 if(estimateComparedTasks>finishedTasks||estimateUntrackedTasks>finishedTasks||
    completionSnapshotsMissing>finishedTasks||deadlinesKnown>finishedTasks||
    deadlinesMet+deadlinesLate!==deadlinesKnown||
    estimateComparedTasks+estimateUntrackedTasks>finishedTasks||
    (estimateComparedTasks===0&&(comparedEstimatedMs!==0||comparedTrackedMs!==0||absoluteErrorMs!==0))||
    (estimateComparedTasks>0&&(comparedEstimatedMs===0||comparedTrackedMs===0))||
    (r.tasks.length!==Math.min(finishedTasks,200)))
  throw Error('Inconsistent insights totals');
 const ids=new Set<string>();
 const tasks:InsightTask[]=r.tasks.map(raw=>{
  const t=obj(raw),estimated=t.estimateMinutes;
  if(!uuid(t.taskId)||ids.has(t.taskId)||!uuid(t.workspaceId)||
     typeof t.title!=='string'||t.title.length>160||
     typeof t.completedAt!=='string'||!Number.isFinite(Date.parse(t.completedAt))||
     !(estimated===null||(typeof estimated==='number'&&Number.isSafeInteger(estimated)&&
       estimated>=1&&estimated<=100000))||
     !(t.deadlineDay===null||date(t.deadlineDay))||
     !(t.deadlineTime===null||(typeof t.deadlineTime==='string'&&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(t.deadlineTime)))||
     !(t.metDeadline===null||typeof t.metDeadline==='boolean')||
     typeof t.snapshotExists!=='boolean'||typeof t.comparable!=='boolean')
    throw Error('Invalid insight task');
  ids.add(t.taskId);
  const trackedMs=ms(t.trackedMs);
  if(t.comparable!==(t.snapshotExists&&estimated!==null&&trackedMs>0)||
     (t.metDeadline!==null)!==(t.snapshotExists&&t.deadlineDay!==null))
   throw Error('Inconsistent insight task evidence');
  return {
   taskId:t.taskId as string,title:t.title as string,
   workspaceId:t.workspaceId as string,completedAt:t.completedAt as string,
   trackedMs,estimateMinutes:estimated as number|null,
   deadlineDay:t.deadlineDay as string|null,deadlineTime:t.deadlineTime as string|null,
   metDeadline:t.metDeadline as boolean|null,
   snapshotExists:t.snapshotExists as boolean,comparable:t.comparable as boolean
  };
 });
 const weeklyTrend:InsightWeek[]=r.weeklyTrend.map((raw,index)=>{
  const w=obj(raw);
  if(!date(w.weekStart)||!date(w.weekEndExclusive)||
     w.weekStart>=w.weekEndExclusive||
     index>0&&(w.weekStart as string)<=String(obj(r.weeklyTrend[index-1]).weekStart))
   throw Error('Invalid insights weekly history');
  return {weekStart:w.weekStart,weekEndExclusive:w.weekEndExclusive,
   recordedMs:ms(w.recordedMs),finishedTasks:count(w.finishedTasks)} as InsightWeek;
 });
 return {
  period:r.period as ReportPeriod,timeZone:r.timeZone,
  startDay:r.startDay,endDayExclusive:r.endDayExclusive,
  finishedTasks,estimateComparedTasks,estimateUntrackedTasks,
  comparedEstimatedMs,comparedTrackedMs,absoluteErrorMs,
  deadlinesKnown,deadlinesMet,deadlinesLate,
  completionSnapshotsMissing,tasks,weeklyTrend
 } as InsightsReport;
}
// Quote every CSV cell, prefix formula-like data, never trust task titles.
// Excel/Sheets may evaluate a leading =,+,-,@ as a formula even inside quotes.
function cell(value:unknown):string{
 let content=String(value??'').replace(/\u0000/g,'');
 if(/^\s*[=+\-@\t\r]/.test(content))content="'"+content;
 return '"'+content.replace(/"/g,'""')+'"';
}
function row(values:unknown[]):string{return values.map(cell).join(',');}
export function makeInsightsCsv(data:InsightsReport,periodReport?:PeriodReport):string{
 if(periodReport&&(periodReport.period!==data.period||
    periodReport.startDay!==data.startDay||periodReport.endDayExclusive!==data.endDayExclusive))
  throw Error('Cannot combine different report periods');
 const lines:string[]=[
  row(['Dayframe private insights export v1']),
  row(['Period',data.period,'From',data.startDay,'End (exclusive)',data.endDayExclusive,
   'Account time zone',data.timeZone]),
  row(['Metric','Value','Meaning']),
  row(['Finished tasks (current status)',data.finishedTasks,'Currently completed and not deleted']),
  row(['Estimate comparisons',data.estimateComparedTasks,'Snapshot estimate and positive direct tracked time']),
  row(['Compared estimated milliseconds',data.comparedEstimatedMs,'Estimated total for eligible tasks']),
  row(['Compared tracked milliseconds',data.comparedTrackedMs,'Direct recorded sessions, not total human effort']),
  row(['Absolute estimate difference milliseconds',data.absoluteErrorMs,'Sum of absolute direct tracked-minus-estimated differences']),
  row(['Untracked estimate candidates',data.estimateUntrackedTasks,'Excluded from estimate comparison']),
  row(['Deadline known',data.deadlinesKnown,'Completion-time deadline snapshot exists']),
  row(['On or before deadline',data.deadlinesMet,'Verified completion-time deadline']),
  row(['After deadline',data.deadlinesLate,'Verified completion-time deadline']),
  row(['Missing completion snapshots',data.completionSnapshotsMissing,'Excluded from accuracy and deadline rates']),
  row(['Detail is limited to first 200 tasks',data.finishedTasks>200?'yes':'no',
   'Totals include all eligible tasks; detail may be truncated']),
  '',
  row(['Recent week start','End exclusive','Exact recorded milliseconds','Finished tasks (current status)'])
 ];
 for(const w of data.weeklyTrend)lines.push(row([w.weekStart,w.weekEndExclusive,w.recordedMs,w.finishedTasks]));
 lines.push('',row(['Task ID','Title','Workspace ID','Completed at','Direct tracked ms','Estimated minutes',
  'Deadline date','Deadline time','Met deadline','Completion snapshot','Estimate comparable']));
 for(const t of data.tasks)lines.push(row([
  t.taskId,t.title,t.workspaceId,t.completedAt,t.trackedMs,t.estimateMinutes,
  t.deadlineDay,t.deadlineTime,t.metDeadline,t.snapshotExists,t.comparable
 ]));
 if(periodReport){
  lines.push('',row(['Workspace ID','Name','Exact recorded ms','Legacy estimated ms','Planned minutes']));
  for(const w of periodReport.workspaces)lines.push(row([
   w.workspaceId,w.name,w.recordedMs,w.legacyEstimatedMs,w.plannedMinutes
  ]));
 }
 return '\ufeff'+lines.join('\r\n')+'\r\n';
}
