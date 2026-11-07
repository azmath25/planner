import { AUTH_URL, authClient } from './client';

export const API_URL='https://br-shiny-king-b9np2anx-dayframeapi.compute.c-7.eu-central-1.aws.neon.tech';

export type CloudWorkspace={
  id:string;kind:'general'|'custom';name:string;subtitle:string;color:string;cover:string;
  revision:number;createdAt:string;archivedAt:string|null;
};
export type CloudTask={
  id:string;workspace:string;parent:string|null;title:string;notes:string;
  status:'open'|'done'|'cancelled';priority:'low'|'medium'|'high';estimate:number;long:boolean;
  deadline:string|null;deadlineTime:string|null;reminder:string|null;reminderTime:string|null;
  pinned:boolean;tags:string[];archivedAt:string|null;completedAt:string|null;cancelledAt:string|null;
  revision:number;createdAt:string;updatedAt:string;
};
export type TaskInput=Pick<CloudTask,'workspace'|'title'|'notes'|'status'|'priority'|'estimate'|'long'|'parent'|'deadline'|'deadlineTime'|'reminder'|'reminderTime'|'pinned'|'tags'>;
export type TaskEvent={id:string;type:string;before:Record<string,unknown>|null;after:Record<string,unknown>|null;createdAt:string};
export type TaskMedia={slot:'cover'|'avatar';data:string;focalY:number};
export type CloudSnapshot={workspaces:CloudWorkspace[];tasks:CloudTask[]};
export type DailyPool={day:string;revision:number;taskIds:string[]};
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
 async trashTask(id:string):Promise<void>{
  await call('/v1/tasks/'+encodeURIComponent(id),{method:'DELETE'});
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
 async restoreTask(id:string):Promise<CloudTask>{
  return (await call<{task:CloudTask}>('/v1/tasks/'+encodeURIComponent(id)+'/restore',{method:'POST'})).task;
 }
};
