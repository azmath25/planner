export type ReportPeriod='day'|'week'|'month';
export type PeriodWorkspace={
 workspaceId:string;name:string|null;archived:boolean;
 recordedMs:number;legacyEstimatedMs:number;plannedMinutes:number;
};
export type PeriodLongTermTask={
 taskId:string;title:string;workspaceId:string;
 status:'open'|'done'|'cancelled';recordedMs:number;plannedMinutes:number;
};
export type PeriodReport={
 period:ReportPeriod;timeZone:string;startDay:string;endDayExclusive:string;
 accountRecordedMs:number;accountLegacyEstimatedMs:number;
 accountPlannedMinutes:number;runningIncluded:boolean;
 workspaces:PeriodWorkspace[];longTermTasks:PeriodLongTermTask[];
};
const date=(s:unknown)=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s);
const safe=(s:unknown)=>{
 const value=Number(s);
 if(!((typeof s==='string'&&/^\d+$/.test(s))||
       (typeof s==='number'&&Number.isInteger(s)))||
   !Number.isSafeInteger(value)||value<0)throw Error('Invalid report duration');
 return value;
};
function record(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid report data');
 return value as Record<string,unknown>;
}
export function parsePeriodReport(input:unknown):PeriodReport{
 const o=record(input);
 if(!['day','week','month'].includes(String(o.period))||!date(o.startDay)||
   !date(o.endDayExclusive)||typeof o.timeZone!=='string'||o.timeZone.length>64||
   typeof o.runningIncluded!=='boolean'||
   !Array.isArray(o.workspaces)||!Array.isArray(o.longTermTasks)||
   o.workspaces.length>5000||o.longTermTasks.length>5000)
  throw Error('Invalid time report');
 const workspaces=o.workspaces.map(item=>{
  const w=record(item);
  if(typeof w.workspaceId!=='string'||w.workspaceId.length>100||
   (w.name!==null&&typeof w.name!=='string')||typeof w.archived!=='boolean')
   throw Error('Invalid report workspace');
  return {workspaceId:w.workspaceId,name:w.name,archived:w.archived,
   recordedMs:safe(w.recordedMs),legacyEstimatedMs:safe(w.legacyEstimatedMs),
   plannedMinutes:safe(w.plannedMinutes)} as PeriodWorkspace;
 });
 const longTermTasks=o.longTermTasks.map(item=>{
  const t=record(item);
  if(typeof t.taskId!=='string'||typeof t.workspaceId!=='string'||
   typeof t.title!=='string'||t.title.length>160||
   !['open','done','cancelled'].includes(String(t.status)))
   throw Error('Invalid long-term task report');
  return {taskId:t.taskId,workspaceId:t.workspaceId,title:t.title,
   status:t.status,recordedMs:safe(t.recordedMs),
   plannedMinutes:safe(t.plannedMinutes)} as PeriodLongTermTask;
 });
 const result:PeriodReport={
  period:o.period as ReportPeriod,timeZone:o.timeZone as string,
  startDay:o.startDay as string,endDayExclusive:o.endDayExclusive as string,
  accountRecordedMs:safe(o.accountRecordedMs),
  accountLegacyEstimatedMs:safe(o.accountLegacyEstimatedMs),
  accountPlannedMinutes:safe(o.accountPlannedMinutes),
  runningIncluded:o.runningIncluded as boolean,workspaces,longTermTasks
 };
 if(workspaces.reduce((sum,w)=>sum+w.recordedMs,0)!==result.accountRecordedMs||
    workspaces.reduce((sum,w)=>sum+w.legacyEstimatedMs,0)!==result.accountLegacyEstimatedMs||
    workspaces.reduce((sum,w)=>sum+w.plannedMinutes,0)!==result.accountPlannedMinutes)
  throw Error('Time report does not reconcile across workspaces');
 return result;
}
