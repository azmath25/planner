import { AUTH_URL, authClient } from './client';

export const API_URL='https://br-shiny-king-b9np2anx-dayframeapi.compute.c-7.eu-central-1.aws.neon.tech';

export type CloudWorkspace={
  id:string;kind:'general'|'custom';name:string;subtitle:string;color:string;cover:string;
  revision:number;createdAt:string;archivedAt:string|null;
};
export type CloudQuickNote={
 id:string;workspace:string;title:string;content:string;
 color:'cream'|'lilac'|'green'|'blue';pinned:boolean;
 reminder:string|null;reminderTime:string|null;
 convertedTaskId:string|null;convertedAt:string|null;deletedAt:string|null;
 revision:number;createdAt:string;updatedAt:string;
};
export type QuickNoteInput=Pick<CloudQuickNote,
 'workspace'|'title'|'content'|'color'|'pinned'|'reminder'|'reminderTime'>;
function verifyQuickNote(input:unknown):input is CloudQuickNote{
 if(!input||typeof input!=='object')return false;
 const x=input as Record<string,unknown>;
 return isUuid(x.id)&&isUuid(x.workspace)&&typeof x.title==='string'&&
  x.title.length>0&&x.title.length<=120&&typeof x.content==='string'&&x.content.length<=8000&&
  ['cream','lilac','green','blue'].includes(String(x.color))&&typeof x.pinned==='boolean'&&
  (x.reminder===null||typeof x.reminder==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.reminder))&&
  (x.reminderTime===null||typeof x.reminderTime==='string'&&/^\d{2}:\d{2}$/.test(x.reminderTime))&&
  (x.convertedTaskId===null||isUuid(x.convertedTaskId))&&
  (x.convertedAt===null||typeof x.convertedAt==='string')&&
  (x.deletedAt===null||typeof x.deletedAt==='string')&&
  typeof x.revision==='number'&&Number.isSafeInteger(x.revision)&&x.revision>=1&&
  typeof x.createdAt==='string'&&typeof x.updatedAt==='string';
}

export type CloudTask={
  id:string;workspace:string;parent:string|null;title:string;notes:string;
  status:'open'|'done'|'cancelled';priority:'low'|'medium'|'high';estimate:number;long:boolean;
  deadline:string|null;deadlineTime:string|null;reminder:string|null;reminderTime:string|null;
  pinned:boolean;tags:string[];archivedAt:string|null;completedAt:string|null;cancelledAt:string|null;
  revision:number;createdAt:string;updatedAt:string;
};
export type TaskInput=Pick<CloudTask,'workspace'|'title'|'notes'|'status'|'priority'|'estimate'|'long'|'parent'|'deadline'|'deadlineTime'|'reminder'|'reminderTime'|'pinned'|'tags'>;
export type TaskEvent={id:string;type:string;before:Record<string,unknown>|null;after:Record<string,unknown>|null;createdAt:string};
type CloudAlertBase={
 title:string;day:string;time:string;dueAt:string;
 revision:number|null;acknowledgedAt:string|null;snoozedUntil:string|null;
};
export type CloudAlert=(CloudAlertBase&{taskId:string;kind:'reminder'|'deadline'})|
 (CloudAlertBase&{noteId:string;kind:'note'});
export type TaskMedia={slot:'cover'|'avatar';data:string;focalY:number};
export type CloudTimeSession={
 id:string;taskId:string|null;taskTitle:string;workspaceIdAtStart:string;
 state:'running'|'paused'|'stopped';startedAt:string;segmentStartedAt:string|null;
 accumulatedMs:number;revision:number;endedAt:string|null;endReason:string|null;
 serverNow:string;
};
export type CloudTimeRollups={
 tasks:Record<string,{directMs:number;totalMs:number}>;
 workspaces:Record<string,number>;
 accountTotalMs:number;
 deletedTaskMs:number;
 activeAncestorIds:string[];
};
export type CloudWeeklyWorkspace={
 workspaceId:string;name:string|null;archived:boolean;
 targetMinutes:number;revision:number;
 actualMs:number;legacyEstimatedMs:number;plannedMinutes:number;
};
export type CloudTimeWeek={
 timeZone:string;weekStart:string;weekEnd:string;
 workspaces:CloudWeeklyWorkspace[];
 accountActualMs:number;accountLegacyEstimatedMs:number;accountPlannedMinutes:number;
};
function parseCloudTimeWeek(value:unknown):CloudTimeWeek{
 if(!value||typeof value!=='object')throw new Error('Invalid weekly time response');
 const data=value as Record<string,unknown>;
 if(typeof data.timeZone!=='string'||data.timeZone.length>64)
  throw new Error('Invalid weekly time zone');
 try{new Intl.DateTimeFormat('en-US',{timeZone:data.timeZone});}
 catch{throw new Error('Invalid weekly time zone');}
 if(typeof data.weekStart!=='string'||typeof data.weekEnd!=='string'||
  !/^\d{4}-\d{2}-\d{2}$/.test(data.weekStart)||
  !/^\d{4}-\d{2}-\d{2}$/.test(data.weekEnd)||
  !Array.isArray(data.workspaces)||data.workspaces.length>10000)
  throw new Error('Invalid weekly time period');
 const workspaces:CloudWeeklyWorkspace[]=[];
 const ids=new Set<string>();
 for(const entry of data.workspaces){
  if(!entry||typeof entry!=='object')throw new Error('Invalid weekly workspace');
  const w=entry as Record<string,unknown>;
  if(!isUuid(w.workspaceId)||ids.has(w.workspaceId)||
   (w.name!==null&&typeof w.name!=='string')||typeof w.archived!=='boolean'||
   typeof w.targetMinutes!=='number'||typeof w.revision!=='number'||
   !Number.isSafeInteger(w.targetMinutes)||!Number.isSafeInteger(w.revision)||
   Number(w.targetMinutes)<0||Number(w.targetMinutes)>10080||Number(w.revision)<0)
    throw new Error('Invalid weekly workspace');
  ids.add(w.workspaceId);
  const actualMs=safeTimeMs(w.actualMs),legacyEstimatedMs=safeTimeMs(w.legacyEstimatedMs);
  const plannedMinutes=safeTimeMs(w.plannedMinutes);
  if(legacyEstimatedMs>actualMs)throw new Error('Invalid historical time attribution');
  workspaces.push({
   workspaceId:w.workspaceId,name:w.name,archived:w.archived,
   targetMinutes:w.targetMinutes as number,revision:w.revision as number,
   actualMs,legacyEstimatedMs,plannedMinutes
  });
 }
 const accountActualMs=safeTimeMs(data.accountActualMs),
  accountLegacyEstimatedMs=safeTimeMs(data.accountLegacyEstimatedMs),
  accountPlannedMinutes=safeTimeMs(data.accountPlannedMinutes);
 if(accountLegacyEstimatedMs>accountActualMs||
  workspaces.reduce((v,w)=>v+w.actualMs,0)!==accountActualMs||
  workspaces.reduce((v,w)=>v+w.plannedMinutes,0)!==accountPlannedMinutes||
  workspaces.reduce((v,w)=>v+w.legacyEstimatedMs,0)!==accountLegacyEstimatedMs)
   throw new Error('Weekly totals do not reconcile');
 return {
  timeZone:data.timeZone,weekStart:data.weekStart,weekEnd:data.weekEnd,
  workspaces,accountActualMs,accountLegacyEstimatedMs,accountPlannedMinutes
 };
}
export type CloudTimeState={
 session:CloudTimeSession|null;
 taskTotals:Record<string,number>;
 rollups:CloudTimeRollups|null;
};
const isUuid=(id:unknown):id is string=>
 typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
function safeTimeMs(input:unknown):number{
 if(typeof input!=='string'&&typeof input!=='number')throw new Error('Invalid time value');
 if(!/^(?:0|[1-9][0-9]*)$/.test(String(input)))throw new Error('Invalid time value');
 const number=Number(input);
 if(!Number.isSafeInteger(number)||number<0)throw new Error('Time exceeds supported precision');
 return number;
}
function parseTimeRollups(input:unknown):CloudTimeRollups|null{
 if(input===null||input===undefined)return null; // Compatibility with M5.1 mocks.
 if(!input||typeof input!=='object')throw new Error('Invalid time rollups');
 const data=input as Record<string,unknown>;
 if(!Array.isArray(data.tasks)||!Array.isArray(data.workspaces)||
  !Array.isArray(data.activeAncestorIds)||data.tasks.length>100000||
  data.workspaces.length>10000||data.activeAncestorIds.length>100000)
  throw new Error('Invalid time rollups');
 const tasks:CloudTimeRollups['tasks']=Object.create(null);
 const workspaces:CloudTimeRollups['workspaces']=Object.create(null);
 for(const value of data.tasks){
  if(!value||typeof value!=='object')throw new Error('Invalid task rollup');
  const item=value as Record<string,unknown>;
  if(!isUuid(item.taskId))throw new Error('Invalid task rollup identifier');
  const directMs=safeTimeMs(item.directMs),totalMs=safeTimeMs(item.totalMs);
  if(totalMs<directMs||Object.hasOwn(tasks,item.taskId))
   throw new Error('Invalid task rollup');
  tasks[item.taskId]={directMs,totalMs};
 }
 for(const value of data.workspaces){
  if(!value||typeof value!=='object')throw new Error('Invalid workspace rollup');
  const item=value as Record<string,unknown>;
  if(!isUuid(item.workspaceId)||Object.hasOwn(workspaces,item.workspaceId))
   throw new Error('Invalid workspace rollup identifier');
  workspaces[item.workspaceId]=safeTimeMs(item.totalMs);
 }
 const accountTotalMs=safeTimeMs(data.accountTotalMs);
 const deletedTaskMs=safeTimeMs(data.deletedTaskMs);
 if(deletedTaskMs>accountTotalMs)throw new Error('Invalid deleted-task time');
 const activeAncestorIds=data.activeAncestorIds;
 if(!activeAncestorIds.every(isUuid)||new Set(activeAncestorIds).size!==activeAncestorIds.length)
  throw new Error('Invalid active ancestors');
 // Each session is credited to precisely one workspace, even if its task
 // has since been moved or permanently deleted.
 if(Object.values(workspaces).reduce((sum,amount)=>sum+amount,0)!==accountTotalMs)
  throw new Error('Workspace totals do not reconcile with account total');
 return {tasks,workspaces,accountTotalMs,deletedTaskMs,activeAncestorIds};
}
function verifyCloudTimeSession(value:unknown):value is CloudTimeSession{
 if(!value||typeof value!=='object')return false;
 const s=value as Partial<CloudTimeSession>;
 return typeof s.id==='string'&&/^[\da-f-]{36}$/i.test(s.id)&&
 (s.taskId===null||typeof s.taskId==='string')&&typeof s.taskTitle==='string'&&
 typeof s.workspaceIdAtStart==='string'&&['running','paused','stopped'].includes(s.state||'')&&
 typeof s.startedAt==='string'&&Number.isFinite(Date.parse(s.startedAt))&&
 (s.segmentStartedAt===null||(typeof s.segmentStartedAt==='string'&&Number.isFinite(Date.parse(s.segmentStartedAt))))&&
 typeof s.accumulatedMs==='number'&&Number.isSafeInteger(s.accumulatedMs)&&s.accumulatedMs>=0&&
 typeof s.revision==='number'&&Number.isSafeInteger(s.revision)&&s.revision>=1&&
 typeof s.serverNow==='string'&&Number.isFinite(Date.parse(s.serverNow))&&
 (s.endedAt===null||(typeof s.endedAt==='string'&&Number.isFinite(Date.parse(s.endedAt))));
}

export type CloudSnapshot={workspaces:CloudWorkspace[];tasks:CloudTask[]};
export type DailyPool={day:string;revision:number;taskIds:string[]};
export type TimedInterval={
 id:string;taskId:string;day:string;start:string;end:string;timeZone:string;revision:number
};
function verifyTimedInterval(value:unknown):value is TimedInterval{
 if(!value||typeof value!=='object')return false;
 const row=value as Partial<TimedInterval>;
 return typeof row.id==='string'&&typeof row.taskId==='string'&&
  typeof row.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.day)&&
  typeof row.start==='string'&&/^\d\d:\d\d$/.test(row.start)&&
  typeof row.end==='string'&&/^\d\d:\d\d$/.test(row.end)&&
  typeof row.timeZone==='string'&&Number.isSafeInteger(row.revision)&&row.revision!>=1;
}
function assertDailyPool(value:unknown,day:string):DailyPool{
 if(!value||typeof value!=='object')throw new Error('Invalid day pool response');
 const item=value as Partial<DailyPool>;
 if(item.day!==day||!Number.isSafeInteger(item.revision)||item.revision!<0||
  !Array.isArray(item.taskIds)||item.taskIds.length>100||
  item.taskIds.some(id=>typeof id!=='string')||
  new Set(item.taskIds).size!==item.taskIds.length)throw new Error('Invalid day pool data');
 return item as DailyPool;
}
export class ApiFailure extends Error {
  constructor(message:string,readonly status:number) {super(message);}
}
async function call<T>(path:string,opts:{method?:string;body?:object;signal?:AbortSignal}={}):Promise<T>{
  // A stale in-memory SDK cache must not make a valid browser session unusable.
  // Retry through Neon's official cookie-backed token route, never accept a
  // user ID from the browser or persist tokens in localStorage/sessionStorage.
  let token:string|undefined;
  try {
    const result=await authClient.token();
    if(!result.error && typeof result.data?.token==='string')token=result.data.token;
  } catch { /* fallback to a fresh cookie-backed request below */ }
  if(!token){
    try {
      const response=await fetch((AUTH_URL.endsWith('/')?AUTH_URL.slice(0,-1):AUTH_URL)+'/token',{
        method:'GET',credentials:'include',cache:'no-store',signal:opts.signal
      });
      if(response.ok){
        const body:unknown=await response.json();
        if(body&&typeof body==='object'&&'token' in body&&typeof body.token==='string')token=body.token;
      }
    } catch { /* report a safe, actionable error without logging credentials */ }
  }
  if(!token)throw new ApiFailure(
    'Sign-in reached Neon, but this browser did not provide a usable session token. Safari may be blocking the cross-site auth cookie. Try another browser until first-party authentication is available.',401);
  const resp=await fetch(API_URL+path,{
    method:opts.method||'GET',
    headers:{Authorization:'Bearer '+token,...(opts.body?{'Content-Type':'application/json'}:{})},
    body:opts.body?JSON.stringify(opts.body):undefined,cache:'no-store',signal:opts.signal
  });
  if(!resp.ok) {
    const safe=await resp.json().catch(()=>({})) as {error?:unknown};
    const message=resp.status===401?'Your session has expired. Sign in again.':
      (typeof safe.error==='string'?safe.error:'Dayframe could not save your change. Please retry.');
    throw new ApiFailure(message,resp.status);
  }
  return await resp.json() as T;
}
function verifyWorkspace(item:unknown):item is CloudWorkspace{
 return !!item&&typeof item==='object'&&'id' in item&&typeof item.id==='string'&&
  'kind' in item&&(item.kind==='general'||item.kind==='custom')&&
  'name' in item&&typeof item.name==='string';
}
function verifyTask(item:unknown):item is CloudTask {
 return !!item&&typeof item==='object'&&'id' in item&&typeof item.id==='string'&&
  'workspace' in item&&typeof item.workspace==='string'&&
  'title' in item&&typeof item.title==='string'&&
  'revision' in item&&typeof item.revision==='number';
}
export async function loadCloudSnapshot(signal?:AbortSignal):Promise<CloudSnapshot>{
 const ws=await call<{workspaces:unknown[]}>('/v1/workspaces',{signal});
 if(!Array.isArray(ws.workspaces)||!ws.workspaces.every(verifyWorkspace)||
    ws.workspaces.filter(w=>w.kind==='general').length!==1) {
  throw new Error('The permanent General workspace could not be verified.');
 }
 const tasks:CloudTask[]=[];
 let offset:number|null=0;
 let page=0;
 while(offset!==null){
  if(++page>1000)throw new Error('Too many task pages. Please contact support.');
  const response:{tasks:unknown[];nextOffset:number|null}=await call<{tasks:unknown[];nextOffset:number|null}>('/v1/tasks?limit=100&offset='+offset,{signal});
  if(!Array.isArray(response.tasks)||!response.tasks.every(verifyTask))throw new Error('Invalid task list response.');
  tasks.push(...response.tasks);
  if(response.nextOffset!==null && (!Number.isSafeInteger(response.nextOffset)||response.nextOffset<=offset))throw new Error('Invalid task pagination.');
  offset=response.nextOffset;
 }
 return {workspaces:ws.workspaces,tasks};
}
export const cloudApi={
 async listQuickNotes():Promise<CloudQuickNote[]>{
  const notes:CloudQuickNote[]=[];let offset:number|null=0;
  for(let page=0;offset!==null;page++){
   if(page>1000)throw new Error('Too many note pages');
   const result=await call<{notes:unknown[];nextOffset:number|null}>(
    '/v1/notes?limit=100&offset='+offset);
   if(!Array.isArray(result.notes)||!result.notes.every(verifyQuickNote))
    throw new Error('Invalid note list response');
   notes.push(...result.notes);
   if(result.nextOffset!==null&&(!Number.isSafeInteger(result.nextOffset)||
    result.nextOffset<=offset))
    throw new Error('Invalid notes pagination');
   offset=result.nextOffset;
  }
  return notes;
 },
 async listTrashedQuickNotes():Promise<CloudQuickNote[]>{
  const notes:CloudQuickNote[]=[];let offset:number|null=0;
  for(let page=0;offset!==null;page++){
   if(page>1000)throw new Error('Too many deleted note pages');
   const result=await call<{notes:unknown[];nextOffset:number|null}>(
    '/v1/notes/trash?limit=100&offset='+offset);
   if(!Array.isArray(result.notes)||!result.notes.every(verifyQuickNote)||
    result.notes.some(note=>!note.deletedAt))
    throw new Error('Invalid deleted note response');
   notes.push(...result.notes);
   if(result.nextOffset!==null&&(!Number.isSafeInteger(result.nextOffset)||
    result.nextOffset<=offset))
    throw new Error('Invalid deleted note pagination');
   offset=result.nextOffset;
  }
  return notes;
 },
 async restoreQuickNote(id:string,revision:number):Promise<CloudQuickNote>{
  if(!isUuid(id)||!Number.isSafeInteger(revision)||revision<1)
   throw new Error('Invalid deleted note revision');
  const result=await call<{note:unknown}>(
   '/v1/notes/'+id+'/restore',{method:'POST',body:{revision}});
  if(!verifyQuickNote(result.note)||result.note.deletedAt!==null)
   throw new Error('Invalid restored note response');
  return result.note;
 },
 async createQuickNote(body:QuickNoteInput&{id:string}):Promise<CloudQuickNote>{
  const data=await call<{note:unknown}>('/v1/notes',{method:'POST',body});
  if(!verifyQuickNote(data.note))throw new Error('Invalid created note response');
  return data.note;
 },
 async updateQuickNote(id:string,body:QuickNoteInput&{revision:number}):Promise<CloudQuickNote>{
  if(!isUuid(id))throw new Error('Invalid note identifier');
  const data=await call<{note:unknown}>('/v1/notes/'+id,{method:'PATCH',body});
  if(!verifyQuickNote(data.note))throw new Error('Invalid updated note response');
  return data.note;
 },
 async deleteQuickNote(id:string,revision:number):Promise<void>{
  if(!isUuid(id)||!Number.isSafeInteger(revision)||revision<1)
   throw new Error('Invalid note revision');
  await call('/v1/notes/'+id,{method:'DELETE',body:{revision}});
 },
 async convertQuickNote(id:string,revision:number,taskId:string,estimate=30):Promise<{
  task:CloudTask;note:CloudQuickNote
 }>{
  if(!isUuid(id)||!isUuid(taskId)||!Number.isSafeInteger(revision)||revision<1||
   !Number.isSafeInteger(estimate)||estimate<1||estimate>100000)
   throw new Error('Invalid note conversion');
  const result=await call<{note:unknown;task:unknown}>(
   '/v1/notes/'+id+'/convert',{method:'POST',body:{revision,taskId,estimate}});
  if(!verifyQuickNote(result.note)||!verifyTask(result.task))
   throw new Error('Invalid note conversion response');
  return {note:result.note,task:result.task};
 },

 async getWeeklyTime():Promise<CloudTimeWeek>{
  const result=await call<{week:unknown}>('/v1/time-week');
  return parseCloudTimeWeek(result.week);
 },
 async saveWeeklyTarget(workspaceId:string,targetMinutes:number,revision:number):Promise<{
  workspaceId:string;targetMinutes:number;revision:number
 }>{
  if(!isUuid(workspaceId)||!Number.isInteger(targetMinutes)||targetMinutes<0||
    targetMinutes>10080||!Number.isInteger(revision)||revision<0)
    throw new Error('Invalid weekly target');
  const result=await call<{target:{
   workspaceId:string;targetMinutes:number;revision:number
  }}>('/v1/time-week/targets/'+encodeURIComponent(workspaceId),{
   method:'PUT',body:{targetMinutes,revision}
  });
  const t=result.target;
  if(!t||t.workspaceId!==workspaceId||!Number.isSafeInteger(t.targetMinutes)||
   !Number.isSafeInteger(t.revision)||t.revision<1)
    throw new Error('Invalid weekly target response');
  return t;
 },
 async getTimeState(signal?:AbortSignal):Promise<CloudTimeState>{
  const data=await call<{session:unknown;taskTotals:unknown;rollups?:unknown}>('/v1/time-session',{signal});
  if(data.session!==null&&!verifyCloudTimeSession(data.session))throw new Error('Invalid server time session');
  if(!Array.isArray(data.taskTotals)||data.taskTotals.length>100000)
   throw new Error('Invalid time totals');
  const totals:Record<string,number>={};
  for(const item of data.taskTotals){
   if(!item||typeof item!=='object')throw new Error('Invalid time total');
   const entry=item as {taskId?:unknown;totalMs?:unknown};
   const amount=Number(entry.totalMs);
   if(typeof entry.taskId!=='string'||!Number.isSafeInteger(amount)||amount<0)
    throw new Error('Invalid time total');
   totals[entry.taskId]=amount;
  }
  const rollups=parseTimeRollups(data.rollups);
  // The compatibility field must agree with each task's direct recorded time.
  if(rollups){
   for(const [id,time] of Object.entries(totals))
    if(rollups.tasks[id]?.directMs!==time)throw new Error('Task totals do not reconcile');
  }
  return {session:data.session as CloudTimeSession|null,taskTotals:totals,rollups};
 },
 async changeTimeSession(action:'start'|'pause'|'resume'|'stop'|'switch',
  sessionId:string,revision:number,taskId?:string,previousId?:string):Promise<CloudTimeSession>{
  const response=await call<{session:unknown}>('/v1/time-session',{
   method:'POST',body:{action,sessionId,revision,
    ...(taskId?{taskId}:{}),...(previousId?{previousId}:{})}
  });
  if(!verifyCloudTimeSession(response.session))throw new Error('Invalid server time session');
  return response.session;
 },

 async notificationPreferences():Promise<{timeZone:string|null;publicKey:string}>{
  const data=await call<{timeZone:string|null;publicKey:string}>('/v1/notification-preferences');
  if((data.timeZone!==null&&typeof data.timeZone!=='string')||
   typeof data.publicKey!=='string'||!/^[-_A-Za-z0-9]+$/.test(data.publicKey))
   throw new Error('Invalid notification settings');
  return data;
 },
 async setNotificationTimeZone(timeZone:string):Promise<void>{
  await call('/v1/notification-preferences',{method:'PUT',body:{timeZone}});
 },
 async isPushRegistered(endpoint:string):Promise<boolean>{
  const result=await call<{registered:boolean}>('/v1/push-subscription/status',{method:'POST',body:{endpoint}});
  if(typeof result.registered!=='boolean')throw new Error('Invalid push subscription state');
  return result.registered;
 },
 async savePushSubscription(endpoint:string):Promise<void>{
  await call('/v1/push-subscription',{method:'PUT',body:{endpoint}});
 },
 async removePushSubscription(endpoint:string):Promise<void>{
  await call('/v1/push-subscription',{method:'DELETE',body:{endpoint}});
 },

 async listAlerts(timeZone:string):Promise<CloudAlert[]>{
  const data=await call<{alerts:CloudAlert[]}>('/v1/alerts/combined?timeZone='+encodeURIComponent(timeZone));
  if(!Array.isArray(data.alerts)||data.alerts.some(x=>!x||
   (x.kind==='note'?typeof x.noteId!=='string'||!isUuid(x.noteId):
    !['reminder','deadline'].includes(x.kind)||typeof x.taskId!=='string'||!isUuid(x.taskId))||
   typeof x.day!=='string'||typeof x.time!=='string'||
   typeof x.title!=='string'||typeof x.dueAt!=='string'||
   (x.revision!==null&&(!Number.isSafeInteger(x.revision)||x.revision<1))))
   throw new Error('Invalid alert response');
  return data.alerts;
 },
 async changeAlert(alert:CloudAlert,action:'acknowledge'|'snooze'|'reset',until?:string):Promise<number>{
  const route=alert.kind==='note'
   ?'/v1/note-alerts/'+encodeURIComponent(alert.noteId)
   :'/v1/alerts/'+encodeURIComponent(alert.taskId)+'/'+encodeURIComponent(alert.kind);
  const response=await call<{revision:number}>(route,{
   method:'POST',body:{day:alert.day,time:alert.time,revision:alert.revision??0,action,...(until?{until}:{})}
  });
  if(!Number.isSafeInteger(response.revision)||response.revision<1)throw new Error('Invalid alert revision');
  return response.revision;
 },

 async listTimedIntervals(from:string,to:string):Promise<TimedInterval[]>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))
   throw new Error('Invalid calendar dates');
  const data=await call<{intervals:unknown[]}>('/v1/timed-intervals?from='+from+'&to='+to);
  if(!Array.isArray(data.intervals)||!data.intervals.every(verifyTimedInterval))throw new Error('Invalid schedule data');
  return data.intervals;
 },
 async saveTimedInterval(block:TimedInterval):Promise<TimedInterval>{
  const {id,...body}=block;
  const data=await call<{interval:unknown}>('/v1/timed-intervals/'+encodeURIComponent(id),{
   method:'PUT',body
  });
  if(!verifyTimedInterval(data.interval))throw new Error('Invalid saved interval');
  return data.interval;
 },
 async deleteTimedInterval(id:string,revision:number):Promise<void>{
  await call('/v1/timed-intervals/'+encodeURIComponent(id),{method:'DELETE',body:{revision}});
 },

 async loadDailyPool(day:string,signal?:AbortSignal):Promise<DailyPool>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('Invalid planning date');
  return assertDailyPool(await call('/v1/daily-pool/'+day,{signal}),day);
 },
 async saveDailyPool(day:string,revision:number,taskIds:string[]):Promise<DailyPool>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isSafeInteger(revision)||revision<0||
   !Array.isArray(taskIds)||taskIds.length>100||new Set(taskIds).size!==taskIds.length){
   throw new Error('Invalid daily pool changes');
  }
  return assertDailyPool(await call('/v1/daily-pool/'+day,{method:'PUT',body:{revision,taskIds}}),day);
 },

 async listArchivedWorkspaces():Promise<CloudWorkspace[]>{
  const data=await call<{workspaces:unknown[]}>('/v1/workspaces/archived');
  if(!Array.isArray(data.workspaces)||!data.workspaces.every(verifyWorkspace)||
     data.workspaces.some(w=>w.kind!=='custom'||!('archivedAt' in w)||typeof w.archivedAt!=='string')){
    throw new Error('Invalid archived workspace response.');
  }
  return data.workspaces;
 },
 async archiveWorkspace(id:string,revision:number):Promise<CloudWorkspace>{
  return (await call<{workspace:CloudWorkspace}>('/v1/workspaces/'+encodeURIComponent(id)+'/archive',{method:'POST',body:{revision}})).workspace;
 },
 async restoreWorkspace(id:string,revision:number):Promise<CloudWorkspace>{
  return (await call<{workspace:CloudWorkspace}>('/v1/workspaces/'+encodeURIComponent(id)+'/restore',{method:'POST',body:{revision}})).workspace;
 },
 async createWorkspace(body:{name:string;subtitle?:string;color?:string;cover?:string}):Promise<CloudWorkspace>{
  return (await call<{workspace:CloudWorkspace}>('/v1/workspaces',{method:'POST',body})).workspace;
 },
 async updateWorkspace(id:string,body:{name:string;subtitle?:string;color?:string;cover?:string;revision:number}):Promise<CloudWorkspace>{
  return (await call<{workspace:CloudWorkspace}>('/v1/workspaces/'+encodeURIComponent(id),{method:'PATCH',body})).workspace;
 },
 async createTask(body:TaskInput&{id:string}):Promise<CloudTask>{
  return (await call<{task:CloudTask}>('/v1/tasks',{method:'POST',body})).task;
 },
 async updateTask(id:string,body:TaskInput&{revision:number;allowOpenChildren?:boolean}):Promise<CloudTask>{
  return (await call<{task:CloudTask}>('/v1/tasks/'+encodeURIComponent(id),{method:'PATCH',body})).task;
 },
 async listArchivedTasks():Promise<CloudTask[]>{
  const tasks:CloudTask[]=[];let offset:number|null=0;
  for(let pages=0;offset!==null;pages++){
   if(pages>1000)throw new Error('Too many archived task pages.');
   const result:{tasks:unknown[];nextOffset:number|null}=await call('/v1/tasks/archived?limit=100&offset='+offset);
   if(!Array.isArray(result.tasks)||!result.tasks.every(verifyTask))throw new Error('Invalid archive response.');
   tasks.push(...result.tasks);
   if(result.nextOffset!==null&&(!Number.isSafeInteger(result.nextOffset)||result.nextOffset<=offset))throw new Error('Invalid archive pagination.');
   offset=result.nextOffset;
  }
  return tasks;
 },
 async archiveTask(id:string,revision:number):Promise<CloudTask>{
  return (await call<{task:CloudTask}>('/v1/tasks/'+encodeURIComponent(id)+'/archive',{method:'POST',body:{revision}})).task;
 },
 async unarchiveTask(id:string,revision:number):Promise<CloudTask>{
  return (await call<{task:CloudTask}>('/v1/tasks/'+encodeURIComponent(id)+'/unarchive',{method:'POST',body:{revision}})).task;
 },
 async moveTask(id:string,body:{workspace:string;parent:string|null;revision:number}):Promise<CloudTask>{
  return (await call<{task:CloudTask}>('/v1/tasks/'+encodeURIComponent(id)+'/move',{method:'POST',body})).task;
 },
 async taskEvents(id:string):Promise<TaskEvent[]>{
  const result=await call<{events:TaskEvent[]}>('/v1/tasks/'+encodeURIComponent(id)+'/events?limit=60');
  if(!Array.isArray(result.events))throw new Error('Invalid task history');
  return result.events;
 },
 async permanentlyDeleteTask(id:string,revision:number,confirm:string):Promise<void>{
  await call('/v1/tasks/'+encodeURIComponent(id)+'/permanent',{method:'DELETE',body:{revision,confirm}});
 },
 async getTaskMedia(id:string):Promise<TaskMedia[]>{
  const response=await call<{images:unknown[]}>('/v1/tasks/'+encodeURIComponent(id)+'/media');
  if(!Array.isArray(response.images))throw new Error('Invalid task image response');
  return response.images.filter((image):image is TaskMedia=>!!image&&typeof image==='object'&&
   'slot' in image&&(image.slot==='cover'||image.slot==='avatar')&&
   'data' in image&&typeof image.data==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(image.data)&&
   'focalY' in image&&typeof image.focalY==='number');
 },
 async saveTaskMedia(id:string,slot:'cover'|'avatar',data:string,focalY=50):Promise<void>{
  await call('/v1/tasks/'+encodeURIComponent(id)+'/media/'+slot,{method:'PUT',body:{data,focalY}});
 },
 async setTaskMediaFocal(id:string,slot:'cover'|'avatar',focalY:number):Promise<void>{
  await call('/v1/tasks/'+encodeURIComponent(id)+'/media/'+slot,{method:'PATCH',body:{focalY}});
 },
 async deleteTaskMedia(id:string,slot:'cover'|'avatar'):Promise<void>{
  await call('/v1/tasks/'+encodeURIComponent(id)+'/media/'+slot,{method:'DELETE'});
 },
 async trashTask(id:string,revision:number):Promise<void>{
  await call('/v1/tasks/'+encodeURIComponent(id),{method:'DELETE',body:{revision}});
 },
 async listTrash():Promise<CloudTask[]>{
  const tasks:CloudTask[]=[];
  let offset:number|null=0;
  let page=0;
  while(offset!==null){
   if(++page>1000)throw new Error('Too many Trash pages. Please contact support.');
   const result:{tasks:unknown[];nextOffset:number|null}=await call('/v1/tasks/trash?limit=100&offset='+offset);
   if(!Array.isArray(result.tasks)||!result.tasks.every(verifyTask))throw new Error('Invalid Trash response.');
   tasks.push(...result.tasks);
   if(result.nextOffset!==null&&(!Number.isSafeInteger(result.nextOffset)||result.nextOffset<=offset))throw new Error('Invalid Trash pagination.');
   offset=result.nextOffset;
  }
  return tasks;
 },
 async restoreTask(id:string,revision:number):Promise<CloudTask>{
  return (await call<{task:CloudTask}>('/v1/tasks/'+encodeURIComponent(id)+'/restore',{method:'POST',body:{revision}})).task;
 }
};
