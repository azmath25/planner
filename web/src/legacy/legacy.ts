// @ts-nocheck
/**
 * Temporary bridge for the fully functional M1.2 browser-only preview.
 * Explicit cleanup prevents duplicate listeners during React StrictMode remounts.
 */
import { getElapsedMs, startTimer, pauseTimer, resumeTimer, finishSession, formatElapsed, restoreTimer, recordedMs } from '../domain/timeTracking';
import { cloudApi } from '../auth/api';
import { periodReportCsv } from '../domain/reportCsv';
import { timeInsightsCsv } from '../domain/timeInsights';
import {pieSegments,pieGradient} from '../domain/reportPie';
import {createQuickNoteAutosaver} from '../domain/quickNoteAutosave';
import {effectiveNoteTitle} from '../domain/quickNoteDraft';

export function mountLegacyDayframe(storageKey = 'dayframe.m1.design-demo.1', cloud: any = null, account: any = {}) {
 const accountName=String(account?.name|| (cloud?'Account':'Local demo')).trim()||'Account';
 const accountEmail=String(account?.email||'').trim();
 const accountInitials=accountName.split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toLocaleUpperCase().slice(0,2);
 const isCloud=Boolean(cloud);
 // Enable only after SQL 0009 and the authenticated alert routes are deployed and verified.
 const alertsBackendEnabled=true;
 // Neon M5.1 migration and authenticated Function are deployed and verified.
 const timeBackendEnabled=true;
 const isCloudTime=isCloud&&timeBackendEnabled;
 const localWorkspace=w=>({
  id:w.kind==='general'?'general':w.id,serverId:w.id,kind:w.kind,name:w.name,
  subtitle:w.subtitle||'',color:w.color||'#85a99d',cover:w.cover||'general',pinned:Boolean(w.pinned),revision:w.revision||1,archivedAt:w.archivedAt||null
 });
  const listeners = [];
  const trackListener = (eventName, handler) => {
    document.addEventListener(eventName, handler);
    listeners.push([eventName, handler]);
  };
// Dayframe M1.1 — interactive design prototype. Demo data stays in this browser only.
const $ = (selector, root=document) => root.querySelector(selector);
const MS_DAY = 86400000;
const today = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime()-offset).toISOString().slice(0,10);
};
const dayOffset = n => { const d=new Date(`${today()}T12:00:00`); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const niceDate = (str, options={month:'short',day:'numeric'}) => str ? new Date(`${str}T12:00:00`).toLocaleDateString(undefined,options) : 'No date';
const minsText = min => min < 60 ? `${min}m` : `${Math.floor(min/60)}h${min%60 ? ` ${min%60}m`:''}`;
const escapeHTML = (value='') => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const SYMBOLS={home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/>',list:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 9 1.5 1.5L12 8M14 9h3m-9 6 1.5 1.5L12 14m2 1h3"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',note:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',chart:'<path d="M4 20V11M10 20V4M16 20v-9M22 20v-5M2 20h21"/>',plus:'<path d="M12 5v14M5 12h14"/>',search:'<circle cx="10.6" cy="10.6" r="7"/><path d="m16 16 5 5"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',settings:'<path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42M18.36 5.64l-1.42 1.42M7.06 16.94l-1.42 1.42"/><circle cx="12" cy="12" r="5"/>',arrow:'<path d="m9 18 6-6-6-6"/>',check:'<path d="m5 12 4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',play:'<path d="m8 5 12 7-12 7z"/>',pause:'<path d="M8 5v14M16 5v14"/>',stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>',spark:'<path d="m12 3 1.5 6.5L20 11l-6.5 1.5L12 19l-1.5-6.5L4 11l6.5-1.5z"/>',alert:'<path d="m12 3 10 18H2z"/><path d="M12 9v5m0 3v.1"/>',menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',close:'<path d="M5 5 19 19M19 5 5 19"/>',up:'<path d="m6 14 6-6 6 6"/>',down:'<path d="m6 10 6 6 6-6"/>',trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v7M14 11v7"/>',edit:'<path d="m4 16 11-11 4 4L8 20H4zM13 7l4 4"/>',bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m3 18 5-5 3 3 4-5 6 6"/>',layers:'<path d="m12 2 10 6-10 6L2 8zM2 13l10 6 10-6M2 18l10 6 10-6"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',back:'<path d="m15 18-6-6 6-6"/>',pin:'<path d="m16 3 5 5-3 1-3 5-4 1-1 5-3-6-4-3 6-1 2-4 1-3z"/>',file:'<path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h7m-7 4h7"/>',refresh:'<path d="M20 8a8 8 0 1 0 1 7M20 3v5h-5"/>',target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'};
const icon=(name,cls='')=>`<svg class="${cls}" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SYMBOLS[name]||SYMBOLS.spark}</svg>`;
const workspaces=isCloud?cloud.workspaces.map(localWorkspace):[
{id:'general',name:'General',subtitle:'The everyday things',color:'#85a99d',cover:'general'},
{id:'research',name:'Research',subtitle:'Ideas, papers & discovery',color:'#83a5cd',cover:'research'},
{id:'dev',name:'Development',subtitle:'Build what matters',color:'#72a89b',cover:'dev'}];
const serverWorkspaceId=id=>workspaces.find(w=>w.id===id)?.serverId||id;
const localWorkspaceId=id=>workspaces.find(w=>w.serverId===id)?.id||id;
const localTask=t=>({...t,pinned:Boolean(t.pinned),tags:Array.isArray(t.tags)?t.tags:[],workspace:localWorkspaceId(t.workspace),spent:0,spentMs:
 isCloudTime?0:(Array.isArray(saved.sessions)?saved.sessions:[]).filter(x=>x.taskId===t.id).reduce((m,x)=>m+(Number(x.durationMs)||0),0)});
const remoteTask=t=>({
 id:t.id,workspace:serverWorkspaceId(t.workspace),parent:t.parent||null,
 title:t.title,notes:t.notes||'',status:t.status||'open',priority:t.priority||'medium',
 estimate:t.estimate||30,long:Boolean(t.long),deadline:t.deadline||null,
 deadlineTime:t.deadlineTime||null,reminder:t.reminder||null,
 reminderTime:t.reminderTime||null,pinned:Boolean(t.pinned),tags:Array.isArray(t.tags)?t.tags:[],revision:t.revision||1
});
const saveError=e=>window.alert(e instanceof Error?e.message:'Could not save your change. Please retry.');
const initialTasks=()=>[
{id:'t1',title:'Review research paper',workspace:'research',estimate:90,spent:45,status:'open',deadline:dayOffset(2),reminder:dayOffset(1),long:true,priority:'high',parent:null,notes:'Collect references and review the main argument.'},
{id:'t2',title:'Prepare lecture materials',workspace:'general',estimate:60,spent:0,status:'open',deadline:dayOffset(1),reminder:today(),long:false,priority:'high',parent:null,notes:'Focus on examples for the new section.'},
{id:'t3',title:'Improve the dashboard layout',workspace:'dev',estimate:120,spent:30,status:'open',deadline:dayOffset(5),reminder:null,long:true,priority:'medium',parent:null,notes:'Keep the design light and make small-screen layouts intuitive.'},
{id:'t4',title:'Reply to important email',workspace:'general',estimate:20,spent:0,status:'open',deadline:null,reminder:today(),long:false,priority:'medium',parent:null,notes:''},
{id:'t5',title:'Read article on approximation',workspace:'research',estimate:45,spent:0,status:'open',deadline:null,reminder:null,long:false,priority:'low',parent:'t1',notes:''},
{id:'t6',title:'Draft weekly report',workspace:'dev',estimate:50,spent:0,status:'open',deadline:dayOffset(4),reminder:dayOffset(3),long:false,priority:'medium',parent:null,notes:''},
{id:'t7',title:'Organize desk and notes',workspace:'general',estimate:15,spent:15,status:'done',deadline:null,reminder:null,long:false,priority:'low',parent:null,notes:''}
];
const initialNotes=()=>[{id:'n1',title:'Something to remember',content:'Ask about the upcoming schedule before Friday.',color:'cream',workspace:'general',pinned:true},{id:'n2',title:'Paper idea',content:'Try the alternative geometric argument. Compare the two constructions.',color:'lilac',workspace:'research',pinned:true},{id:'n3',title:'Product details',content:'Keep task creation fast. The daily pool should never require exact times.',color:'green',workspace:'dev',pinned:false}];
const STORAGE=storageKey;
let saved={};try{saved=JSON.parse(localStorage.getItem(STORAGE)||'{}')}catch{}
const state={page:'home',filter:'all',taskSort:saved.taskSort||'deadline',subtaskParent:null,workspaceFilter:'all',archivedTasks:[],taskArchiveBusy:false,taskEvents:[],taskEventsBusy:false,viewWorkspace:'general',taskId:null,taskTab:'overview',search:'',modal:null,modalTask:null,reportPeriod:'week',reportAnchor:today(),periodReport:null,periodLoading:false,periodError:'',insights:null,insightsKey:'',insightsLoading:false,insightsError:'',planDay:today(),calendarAnchor:today(),calendarView:'week',scheduleLoading:false,scheduleBusy:false,scheduleError:'',scheduleEditId:null,alerts:[],alertError:'',alertLoading:false,alertBusy:false,pushBusy:false,pushEnabled:false,pushMessage:'',quietBusy:false,quietLoading:false,quietError:'',quietStart:null,quietEnd:null,theme:saved.theme||'minimal',accent:saved.accent||'default',density:saved.density||'comfortable',coverStyle:saved.coverStyle||'standard',media:saved.media||{},mediaPos:saved.mediaPos||{},mediaTarget:null,tasks:isCloud?cloud.tasks.map(localTask):(saved.tasks||initialTasks()),
notes:isCloud?[]:(saved.notes||initialNotes()),noteLoading:false,noteBusy:false,noteError:'',noteLoaded:!isCloud,noteFilter:'all',noteSearch:'',noteMode:'active',noteTrash:[],noteTrashLoading:false,noteTrashLoaded:false,noteTrashError:'',notePendingConversion:null,notePendingCreate:null,
pools:isCloud?{}:(saved.pools||{[today()]:['t2','t4','t5']}),poolRevisions:{},poolErrors:{},poolBusy:false,
scheduled:isCloud?[]:(saved.scheduled||[{id:'s1',taskId:'t1',day:today(),start:'09:00',end:'10:30'},{id:'s2',taskId:'t3',day:today(),start:'14:00',end:'15:30'}]),capacity:saved.capacity||6,timer:isCloudTime?null:(saved.timer||null),sessions:isCloudTime?[]:(Array.isArray(saved.sessions)?saved.sessions:[]),timeSession:null,timeTaskTotals:{},timeRollups:null,timeWeek:null,weekLoading:false,weekSaving:false,weekError:'',timeServerAt:0,timeMonotonicAt:0,timeBusy:false,timeLoading:false,timeLoaded:!isCloud,timeError:'',trashed:[],trashBusy:false,cloudBusy:false,archiveBusy:false,archivedWorkspaces:[]};
state.timer=restoreTimer(state.timer,new Set(state.tasks.filter(t=>t.status!=='done').map(t=>t.id)));
Object.defineProperty(state,'pool',{get(){return state.pools[state.planDay]||(state.pools[state.planDay]=[])},set(v){state.pools[state.planDay]=v}});
const poolForDay=day=>state.pools[day]||[];
const remainingUnscheduled=(task,day)=>Math.max(0,task.estimate-(isCloudTime?taskTimeMs(task)/60000:task.spent)-state.scheduled.filter(s=>s.taskId===task.id&&s.day===day).reduce((sum,s)=>sum+parseClock(s.end)-parseClock(s.start),0));
const persist=()=>{try{localStorage.setItem(STORAGE,JSON.stringify({theme:state.theme,accent:state.accent,density:state.density,coverStyle:state.coverStyle,media:isCloud?Object.fromEntries(Object.entries(state.media).filter(([key])=>!key.startsWith('task:'))):state.media,mediaPos:isCloud?Object.fromEntries(Object.entries(state.mediaPos).filter(([key])=>!key.startsWith('task:'))):state.mediaPos,tasks:isCloud?undefined:state.tasks,notes:isCloud?undefined:state.notes,pools:isCloud?undefined:state.pools,scheduled:isCloud?undefined:state.scheduled,capacity:state.capacity,taskSort:state.taskSort,timer:isCloudTime?(saved.timer??undefined):state.timer,sessions:isCloudTime?(Array.isArray(saved.sessions)?saved.sessions:[]):state.sessions}));return true}catch(err){console.warn('Dayframe demo local storage is full',err);return false}};
const localQuickNote=note=>({...note,workspace:localWorkspaceId(note.workspace)});
const remoteQuickNote=note=>({
 workspace:serverWorkspaceId(note.workspace),title:note.title,
 content:note.content||'',color:note.color||'cream',
 pinned:Boolean(note.pinned),reminder:note.reminder||null,
 reminderTime:note.reminderTime||null
});
async function loadCloudNotes(preserveError=false){
 if(!isCloud||disposed||state.noteLoading||state.noteBusy)return;
 state.noteLoading=true;if(!preserveError)state.noteError='';
 try{
  const notes=await cloudApi.listQuickNotes();
  if(disposed)return;
  state.notes=notes.map(localQuickNote);
  state.noteLoaded=true;
 }catch(err){
  if(!disposed)state.noteError=err instanceof Error?err.message:'Quick Notes unavailable';
 }finally{
  state.noteLoading=false;
  if(!disposed&&['notes','workspace','home'].includes(state.page))render();
 }
}
async function loadCloudTrashedNotes(preserveError=false){
 if(!isCloud||disposed||state.noteTrashLoading||state.noteBusy)return;
 state.noteTrashLoading=true;
 if(!preserveError)state.noteTrashError='';
 try{
  const rows=await cloudApi.listTrashedQuickNotes();
  if(disposed)return;
  state.noteTrash=rows.map(localQuickNote);
  state.noteTrashLoaded=true;
 }catch(err){
  if(!disposed)state.noteTrashError=err instanceof Error?err.message:'Deleted notes unavailable';
 }finally{
  state.noteTrashLoading=false;
  if(!disposed&&state.page==='notes'&&state.noteMode==='trash')render();
 }
}
const upsertQuickNote=note=>{
 const existing=state.notes.findIndex(n=>n.id===note.id);
 if(existing<0)state.notes.unshift(localQuickNote(note));
 else state.notes[existing]=localQuickNote(note);
};

const poolLoaded=new Set(),poolPending=new Set();let disposed=false;
async function loadCloudPool(day){
 if(!isCloud||disposed||poolPending.has(day))return;
 poolPending.add(day);delete state.poolErrors[day];render();
 try{
  const data=await cloudApi.loadDailyPool(day);
  if(disposed)return;
  state.pools[day]=data.taskIds.filter(id=>state.tasks.some(t=>t.id===id&&t.status==='open'));
  state.poolRevisions[day]=data.revision;poolLoaded.add(day);
 }catch(e){
  if(disposed)return;
  state.poolErrors[day]=e instanceof Error?e.message:'Could not load this day';
  poolLoaded.delete(day);
 }finally{poolPending.delete(day);if(!disposed)render();}
}
async function changeDailyPool(mutate,day=state.planDay){
 if(!isCloud){state.pools[day]=mutate([...poolForDay(day)]);persist();render();return true;}
 if(state.poolBusy||poolPending.has(day)||!poolLoaded.has(day)){
  if(!poolPending.has(day))state.poolErrors[day]='Load the day before editing its pool.';
  render();return false;
 }
 const before=[...poolForDay(day)].filter(id=>state.tasks.some(t=>t.id===id&&t.status==='open')),next=mutate([...before]);
 if(next.length>100||new Set(next).size!==next.length||
  next.some(id=>!state.tasks.some(t=>t.id===id&&t.status==='open'))){
  state.poolErrors[day]='Select up to 100 distinct open tasks.';render();return false;
 }
 if(before.length===next.length&&before.every((id,i)=>id===next[i]))return true;
 state.poolBusy=true;delete state.poolErrors[day];render();
 try{
  const data=await cloudApi.saveDailyPool(day,state.poolRevisions[day],next);
  if(disposed)return false;
  state.pools[day]=data.taskIds;state.poolRevisions[day]=data.revision;persist();return true;
 }catch(e){
  if(!disposed){
   if(e?.status===409){
    await loadCloudPool(day);
    state.poolErrors[day]='Pool changed on another device, or a task is no longer open. Saved order was refreshed; review and retry.';
   }else state.poolErrors[day]=e instanceof Error?e.message:'Could not save pool';
  }
  return false;
 }finally{state.poolBusy=false;if(!disposed)render();}
}
const dayAdd=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const mondayOf=day=>{const d=new Date(day+'T12:00:00Z');return dayAdd(day,-(d.getUTCDay()+6)%7);};
const monthStart=day=>day.slice(0,7)+'-01';
const rangeForCalendar=()=>{
 if(state.calendarView==='day')return [state.calendarAnchor,state.calendarAnchor];
 if(state.calendarView==='week'){const start=mondayOf(state.calendarAnchor);return [start,dayAdd(start,6)];}
 const start=mondayOf(monthStart(state.calendarAnchor));return [start,dayAdd(start,41)];
};
let scheduleRequest=0;
const scheduleLoadedDates=new Set();
async function loadCloudSchedule(from,to){
 if(!isCloud||disposed)return;
 const request=++scheduleRequest;
 state.scheduleLoading=true;state.scheduleError='';render();
 try{
  const rows=await cloudApi.listTimedIntervals(from,to);
  if(disposed||request!==scheduleRequest)return;
  state.scheduled=state.scheduled.filter(x=>x.day<from||x.day>to).concat(rows);
  for(let day=from;day<=to;day=dayAdd(day,1))scheduleLoadedDates.add(day);
 }catch(error){
  if(disposed||request!==scheduleRequest)return;
  state.scheduleError=error instanceof Error?error.message:'Could not load timed blocks';
 }finally{
  if(!disposed&&request===scheduleRequest){state.scheduleLoading=false;render();}
 }
}
// User-initiated opt-in: service worker receives generic no-payload Web Push.
async function disableBrowserPush(){
 if(!isCloud||state.pushBusy)return;
 state.pushBusy=true;state.pushMessage='';
 try{
  const registration=await navigator.serviceWorker.getRegistration(new URL('./',document.baseURI).pathname);
  const subscription=await registration?.pushManager.getSubscription();
  if(subscription){
   await cloudApi.removePushSubscription(subscription.endpoint);
   await subscription.unsubscribe();
  }
  state.pushEnabled=false;state.pushMessage='Browser push disabled for this device.';
 }catch(error){state.pushMessage=error instanceof Error?error.message:'Could not disable push';}
 finally{state.pushBusy=false;if(!disposed)render();}
}
async function setCurrentNotificationZone(){
 if(!isCloud||state.pushBusy)return;
 state.pushBusy=true;
 try{
  await cloudApi.setNotificationTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');
  state.pushMessage='Reminder time zone updated for your account.';
  await loadCloudAlerts();
 }catch(error){state.pushMessage=error instanceof Error?error.message:'Could not update reminder time zone';}
 finally{state.pushBusy=false;if(!disposed)render();}
}
async function openQuietHours(){
 if(!isCloud||disposed)return;
 state.quietError='';state.quietLoading=true;state.modal='quiet-hours';render();
 try{
  const prefs=await cloudApi.notificationPreferences();
  if(disposed||state.modal!=='quiet-hours')return;
  state.quietStart=prefs.quietStart;
  state.quietEnd=prefs.quietEnd;
 }catch(error){
  if(!disposed&&state.modal==='quiet-hours')
   state.quietError=error instanceof Error?error.message:'Could not load quiet hours';
 }finally{
  state.quietLoading=false;
  if(!disposed&&state.modal==='quiet-hours')render();
 }
}
async function enableBrowserPush(){
 if(!isCloud||state.pushBusy)return;
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
  state.pushMessage='This browser does not support web push for this website.';render();return;
 }
 if(Notification.permission==='denied'){
  state.pushMessage='Browser notifications are blocked. Allow Dayframe in your browser settings.';render();return;
 }
 state.pushBusy=true;state.pushMessage='';render();
 try{
  // Request permission first while the user click is still active.
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(permission!=='granted')throw new Error('Notification permission was not granted.');
  const settings=await cloudApi.notificationPreferences();
  if(!settings.timeZone){
   await cloudApi.setNotificationTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');
  }
  const scopeUrl=new URL('./',document.baseURI);
  const registration=await navigator.serviceWorker.register(new URL('sw.js',scopeUrl).toString(),{scope:scopeUrl.pathname});
  await navigator.serviceWorker.ready;
  const raw=settings.publicKey.replace(/-/g,'+').replace(/_/g,'/');
  const bytes=Uint8Array.from(atob(raw+'='.repeat((4-raw.length%4)%4)),c=>c.charCodeAt(0));
  let existing=await registration.pushManager.getSubscription();
  // A changed VAPID key requires a new browser subscription. Otherwise a
  // previously enabled device silently stops receiving scheduled pushes.
  if(existing){
   const key=existing.options.applicationServerKey;
   const prior=key?new Uint8Array(key):null;
   const matches=prior?.length===bytes.length&&
    bytes.every((item,index)=>prior[index]===item);
   if(!matches){
    try{await cloudApi.removePushSubscription(existing.endpoint);}
    catch{/* An obsolete server record expires when the sender sees it. */}
    if(!await existing.unsubscribe())
     throw new Error('Old browser push subscription could not be replaced. Disable notifications and retry.');
    existing=null;
   }
  }
  const subscription=existing||await registration.pushManager.subscribe({
   userVisibleOnly:true,applicationServerKey:bytes
  });
  await cloudApi.savePushSubscription(subscription.endpoint);
  if(disposed)return;
  state.pushEnabled=true;
  state.pushMessage='Browser push enabled for this device. Delivery can be delayed by the browser or operating system.';
 }catch(error){
  if(!disposed)state.pushMessage=error instanceof Error?error.message:'Could not enable browser notifications';
 }finally{state.pushBusy=false;if(!disposed)render();}
}
// In-app inbox only. A closed website cannot receive a browser notification.
async function loadCloudAlerts(){
 if(!isCloud||!alertsBackendEnabled||disposed||state.alertLoading)return;
 state.alertLoading=true;
 try{
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
  state.alerts=await cloudApi.listAlerts(zone);
  state.alertError='';
 }catch(error){state.alertError=error instanceof Error?error.message:'Alerts unavailable';}
 finally{state.alertLoading=false;if(!disposed&&state.page==='home')render();}
}
async function changeCloudAlert(index,action){
 if(!isCloud||state.alertBusy)return;
 const alert=state.alerts[index];if(!alert)return;
 let until;
 if(action==='snooze')until=new Date(Date.now()+60*60*1000).toISOString();
 state.alertBusy=true;
 try{await cloudApi.changeAlert(alert,action,until);await loadCloudAlerts();}
 catch(err){saveError(err);await loadCloudAlerts();}
 finally{state.alertBusy=false;if(!disposed)render();}
}
async function changeTimedSchedule(operation){
 if(state.scheduleBusy)return false;
 state.scheduleBusy=true;state.scheduleError='';render();
 try{
  const result=await operation();
  if(disposed)return false;
  if(result?.removed){state.scheduled=state.scheduled.filter(x=>x.id!==result.id);}
  else if(result){state.scheduled=state.scheduled.filter(x=>x.id!==result.id).concat(result);}
  persist();return true;
 }catch(err){
  if(!disposed){
   state.scheduleError=err instanceof Error?err.message:'Could not save this timed block';
   if(err?.status===409){
    // Refresh the visible period. Preserve the user's entered form until they retry.
    const [from,to]=state.page==='calendar'?rangeForCalendar():[state.planDay,state.planDay];
    await loadCloudSchedule(from,to);
    state.scheduleError=err instanceof Error?err.message:'Schedule conflict; review and retry';
   }
  }
  return false;
 }finally{
  state.scheduleBusy=false;if(!disposed)render();
 }
}
const workspace=id=>workspaces.find(w=>w.id===id)||workspaces[0];
// M3 private task media is fetched only after opening a task; workspace images remain local.
const mediaKey=(kind,id,slot)=>`${kind}:${id}:${slot}`;
const loadTaskMedia=async id=>{
 if(!isCloud)return;
 try{
  const images=await cloudApi.getTaskMedia(id);
  for(const slot of ['cover','avatar']){
   delete state.media[mediaKey('task',id,slot)];delete state.mediaPos[mediaKey('task',id,slot)];
  }
  for(const image of images){
   state.media[mediaKey('task',id,image.slot)]=image.data;
   state.mediaPos[mediaKey('task',id,image.slot)]=image.focalY;
  }
  if(state.page==='detail'&&state.taskId===id)render();
 }catch(err){saveError(err);}
};
const photoFor=(kind,id,slot)=>{const data=state.media[mediaKey(kind,id,slot)];return typeof data==='string'&&/^data:image\/(webp|jpeg|png);base64,[a-zA-Z0-9+/=]+$/.test(data)&&data.length<1000000?data:null};
const photoStyle=(kind,id,slot)=>{const data=photoFor(kind,id,slot);const p=Number(state.mediaPos[mediaKey(kind,id,slot)]??50);return data?` style="background-image:url('${data}');background-position:center ${Math.max(0,Math.min(100,p))}%;"`:''};
const photoClass=(kind,id,slot)=>photoFor(kind,id,slot)?'has-photo':'';
const photoButton=(kind,id,slot,label)=>`<button class="btn secondary small" data-action="edit-image" data-kind="${kind}" data-id="${escapeHTML(id)}" data-slot="${slot}">${icon(slot==='cover'?'image':'upload')} ${label}</button>`;
const taskPhoto=(t)=>photoFor('task',t.id,'avatar')?`<span class="task-thumbnail"${photoStyle('task',t.id,'avatar')}></span>`:'';
const coverFrame=(kind,id,coverClass,avatarIcon)=>`<div class="workspace-detail-cover ${coverClass} ${photoClass(kind,id,'cover')}"${photoStyle(kind,id,'cover')}><div class="workspace-avatar ${photoClass(kind,id,'avatar')}"${photoStyle(kind,id,'avatar')}>${photoFor(kind,id,'avatar')?'':icon(avatarIcon)}</div></div>`;

const openTasks=()=>state.tasks.filter(t=>t.status!=='done'&&t.status!=='cancelled');
const findTask=id=>state.tasks.find(t=>t.id===id);
const subtreeIds=id=>{
 const seen=new Set([id]);let changed=true;
 while(changed){changed=false;
  for(const task of state.tasks)if(task.parent&&seen.has(task.parent)&&!seen.has(task.id)){seen.add(task.id);changed=true;}
 }
 return seen;
};
const fmtTime=(str)=>str?str:'—';
const timerNow=()=>isCloudTime&&state.timeServerAt>0
  ?state.timeServerAt+Math.max(0,performance.now()-state.timeMonotonicAt):Date.now();
const formatTimer=()=>formatElapsed(getElapsedMs(state.timer,timerNow()));
const taskTimeMs=t=>{
 if(!isCloudTime)return recordedMs(t)+((state.timer?.taskId===t.id)?getElapsedMs(state.timer,Date.now()):0);
 const raw=state.timeTaskTotals[t.id]||0;
 const segment=state.timer?.taskId===t.id&&state.timer.running
   ?Math.max(0,getElapsedMs(state.timer,timerNow())-state.timer.elapsed):0;
 return raw+segment;
};

/** Rollup display values are inclusive. Never add parent rollups to account
 * or workspace totals: a descendant appears in multiple ancestor displays. */
const activeTimeDeltaMs=()=>isCloudTime&&state.timer?.running
 ?Math.max(0,getElapsedMs(state.timer,timerNow())-state.timer.elapsed):0;
const isDescendantOf=(leafId,ancestorId)=>{
 const visited=new Set();
 let id=leafId;
 while(id&&!visited.has(id)){
  if(id===ancestorId)return true;
  visited.add(id);
  id=state.tasks.find(task=>task.id===id)?.parent||null;
 }
 return false;
};
const taskTimeWithSubtasksMs=task=>{
 if(!isCloudTime){
  return state.tasks.filter(t=>isDescendantOf(t.id,task.id))
   .reduce((sum,t)=>sum+recordedMs(t),0)
   +(state.timer&&isDescendantOf(state.timer.taskId,task.id)
     ?getElapsedMs(state.timer,Date.now()):0);
 }
 const rollup=state.timeRollups;
 const saved=rollup?.tasks[task.id]?.totalMs ??
  state.tasks.filter(t=>isDescendantOf(t.id,task.id))
   .reduce((sum,t)=>sum+(state.timeTaskTotals[t.id]||0),0);
 const isActiveAncestor=rollup
  ?rollup.activeAncestorIds.includes(task.id)
  :Boolean(state.timer&&isDescendantOf(state.timer.taskId,task.id));
 return saved+(isActiveAncestor?activeTimeDeltaMs():0);
};
const workspaceTimeMs=w=>{
 if(!isCloudTime){
  return state.tasks.filter(t=>t.workspace===w.id)
   .reduce((sum,t)=>sum+recordedMs(t),0)
   +(state.timer&&findTask(state.timer.taskId)?.workspace===w.id
     ?getElapsedMs(state.timer,Date.now()):0);
 }
 const workspaceId=serverWorkspaceId(w.id);
 const saved=state.timeRollups?.workspaces[workspaceId]||0;
 return saved+(state.timeSession?.workspaceIdAtStart===workspaceId
   ?activeTimeDeltaMs():0);
};
const accountTimeMs=()=>isCloudTime
 ?(state.timeRollups?.accountTotalMs||0)+activeTimeDeltaMs()
 :workspaces.reduce((sum,w)=>sum+workspaceTimeMs(w),0);


const taskRemainingMs=task=>task.status==='open'
 ?Math.max(0,Math.round(task.estimate*60000)-taskTimeMs(task)):0;
const subtreeRemainingMs=task=>state.tasks
 .filter(x=>isDescendantOf(x.id,task.id)&&x.status==='open')
 .reduce((sum,x)=>sum+taskRemainingMs(x),0);
const weekWorkspace=w=>state.timeWeek?.workspaces.find(
  row=>row.workspaceId===serverWorkspaceId(w.id))||null;
const weekCaption=()=>state.timeWeek
 ?'Week '+state.timeWeek.weekStart+'–'+state.timeWeek.weekEnd+
   ' · '+state.timeWeek.timeZone
 :'Current week';
function weekWorkspaceBlock(w){
 if(!isCloudTime)return '';
 const row=weekWorkspace(w);
 const noTarget=!row||row.targetMinutes===0;
 const actual=row?.actualMs||0;
 const legacy=row?.legacyEstimatedMs||0;
 const targetMs=(row?.targetMinutes||0)*60000;
 const percent=targetMs?Math.round(actual/targetMs*100):0;
 const loading=state.weekLoading?'Loading current week…':(state.weekError||'Weekly summary unavailable');
 return `<section class="card" aria-label="Weekly time target for ${escapeHTML(w.name)}">
  <div class="card-title"><h2>Weekly focus target</h2>
   <button type="button" class="btn small secondary" data-action="refresh-week" ${state.weekLoading?'disabled':''}>Refresh</button>
  </div>
  <p class="tiny">${escapeHTML(weekCaption())}. Progress repeats every week. The goal itself is saved across devices.</p>
  ${row?`<div class="metrics">
   <div class="metric"><div class="metric-label">Recorded this week</div><div class="metric-value">${formatElapsed(actual)}</div></div>
   <div class="metric"><div class="metric-label">Fixed plan this week</div><div class="metric-value">${minsText(row.plannedMinutes)}</div></div>
   <div class="metric"><div class="metric-label">Weekly goal</div><div class="metric-value">${noTarget?'Not set':minsText(row.targetMinutes)}</div></div>
  </div>
  ${noTarget?'<p class="tiny">Set a target to monitor weekly progress.</p>':`<label class="form-label" for="week-target-progress">Goal progress: ${percent}%</label>
   <progress id="week-target-progress" value="${Math.min(actual,targetMs)}" max="${targetMs}"></progress>`}
  ${legacy?'<p class="tiny">Some older time is attributed to the week the session started; exact pre-M5.3 segments were unavailable.</p>':''}
  `: `<p class="tiny" role="status">${escapeHTML(loading)}</p>`}
  <form id="weekly-goal-form" class="actions" style="align-items:flex-end;flex-wrap:wrap">
   <label class="field-wrap"><span class="form-label">Weekly target (hours; 0 disables)</span>
    <input class="field" name="hours" type="number" min="0" max="168" step="0.25"
     value="${row?row.targetMinutes/60:0}" ${!row||state.weekSaving?'disabled':''} required/>
   </label>
   <button class="btn small" type="submit" ${!row||state.weekSaving?'disabled':''}>Save weekly goal</button>
  </form>
  ${state.weekError?`<p class="tiny" role="alert">${escapeHTML(state.weekError)}</p>`:''}
 </section>`;
}

const timeControls=(task,compact=false)=>{
  const timerDisabled=isCloudTime&&(state.timeBusy||state.timeLoading||!state.timeLoaded)?' disabled aria-disabled="true"':'';
  if(task.status==='done'||task.status==='cancelled')return `<button class="btn small secondary" data-action="reopen-task" data-id="${escapeHTML(task.id)}">${icon('refresh')} Reopen</button>`;
  const active=state.timer?.taskId===task.id;
  if(!active)return `<button class="btn ${compact?'small':''}" data-action="start" data-id="${escapeHTML(task.id)}" ${timerDisabled}>${icon('play')} Start</button>`;
  return `<button class="btn ${compact?'small':''}" data-action="${state.timer.running?'pause':'resume'}" ${timerDisabled}>${icon(state.timer.running?'pause':'play')} ${state.timer.running?'Pause':'Resume'}</button><button class="btn secondary ${compact?'small':''}" data-action="stop" ${timerDisabled}>${icon('stop')} Stop session</button>`;
};
function globalTimerBar(){
  if(!state.timer)return '';
  const task=findTask(state.timer.taskId);
  if(!task&&isCloudTime)return `<section class="global-timer" aria-label="Recovered server session"><div class="global-timer-task"><strong>${escapeHTML(state.timeSession?.taskTitle||'Saved session')}</strong><small>Task is not in the current list; stop the saved session before starting another.</small></div><time class="global-time-value" data-timer-display>${formatTimer()}</time><button class="btn small secondary" data-action="stop" ${state.timeBusy?'disabled':''}>Stop</button></section>`;
  if(!task)return '';
  return `<section class="global-timer" aria-label="Current time tracking session"><div class="global-timer-task"><span class="timer-pulse ${state.timer.running?'live':'paused'}"></span><div class="timer-task-name"><button data-action="detail" data-id="${escapeHTML(task.id)}" class="timer-task-link" title="Open task">${escapeHTML(task.title)}</button><small>${state.timer.running?'Counting time':'Paused'} · ${escapeHTML(workspace(task.workspace).name)} · ${isCloudTime?"saved in Neon · across devices":"local preview"}</small></div></div><time class="global-time-value" data-timer-display>${formatTimer()}</time><div class="global-timer-actions"><button class="timer-compact-button" data-action="${state.timer.running?'pause':'resume'}" ${isCloud&&state.timeBusy?'disabled':''} aria-label="${state.timer.running?'Pause':'Resume'} timer" title="${state.timer.running?'Pause':'Resume'}">${icon(state.timer.running?'pause':'play')}<span>${state.timer.running?'Pause':'Resume'}</span></button><button class="timer-compact-button" data-action="stop" ${isCloud&&state.timeBusy?'disabled':''} aria-label="Stop and save session" title="Stop session">${icon('stop')}<span>Stop</span></button><button class="timer-compact-button timer-complete" data-action="finish-task" data-id="${escapeHTML(task.id)}" aria-label="Finish ${escapeHTML(task.title)}" title="Finish task">${icon('check')}<span>Finish</span></button></div></section>`;
}
const nav=[['home','Home','home'],['plan','Plan your day','calendar'],['tasks','Tasks','list'],['workspaces','Workspaces','folder'],['notes','Notes','note'],['documents','Documents','file'],['calendar','Calendar','calendar'],['reports','Reports','chart'],['settings','Settings','settings']];
const navButton=([page,label,ic])=>`<button class="nav-item ${state.page===page?'active':''}" data-action="nav" data-page="${page}" aria-current="${state.page===page?'page':'false'}">${icon(ic)}<span>${label}</span>${page==='tasks'?`<span class="nav-count">${openTasks().length}</span>`:''}</button>`;
function layout(content){document.documentElement.setAttribute('data-theme',state.theme);document.documentElement.setAttribute('data-accent',state.accent);document.documentElement.setAttribute('data-density',state.density);document.documentElement.setAttribute('data-cover-style',state.coverStyle);$('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="logo"><span class="brand-mark">◈</span><span>dayframe<span style="color:var(--accent)">.</span></span></div><div class="sidebar-caption">Workspace</div>${nav.slice(0,5).map(navButton).join('')}<div class="sidebar-caption">Explore</div>${nav.slice(5).map(navButton).join('')}<div class="sidebar-bottom"><button type="button" class="profile profile-link ${state.page==='profile'?'active':''}" data-action="nav" data-page="profile" aria-current="${state.page==='profile'?'page':'false'}" aria-label="Open profile for ${escapeHTML(accountName)}"><span class="profile-avatar">${escapeHTML(accountInitials)}</span><span class="profile-label"><strong>${escapeHTML(accountName)}</strong><small>${isCloud?'My profile':'Local preview'}</small></span>${icon('arrow')}</button></div></aside><div class="main"><header class="mobile-top"><div class="logo"><span class="brand-mark">◈</span><span>dayframe<span style="color:var(--accent)">.</span></span></div><div class="top-actions"><button class="icon-btn" data-action="nav" data-page="reports" aria-label="View reports">${icon('chart')}</button><button class="icon-btn" data-action="nav" data-page="settings" aria-label="Settings">${icon('settings')}</button><button type="button" class="mini-avatar profile-avatar-button" data-action="nav" data-page="profile" aria-label="Open profile for ${escapeHTML(accountName)}">${escapeHTML(accountInitials)}</button></div></header>${globalTimerBar()}<main class="content page-${state.page}" id="maincontent"><div class="topline"><div class="breadcrumb">Personal space <span style="padding:0 8px">/</span> ${state.page==='profile'?'Profile':(nav.find(x=>x[0]===state.page)?.[1]||'Home')}</div><div class="top-actions"><span class="demo-flag">${icon('spark')} ${isCloud?'Tasks, plans and time synced':'Interactive design preview'}</span><button class="icon-btn" data-action="nav" data-page="settings" aria-label="Appearance settings">${icon('settings')}</button><button type="button" class="mini-avatar profile-avatar-button" data-action="nav" data-page="profile" aria-label="Open profile for ${escapeHTML(accountName)}">${escapeHTML(accountInitials)}</button></div></div>${content}</main></div><nav class="mobile-nav" aria-label="Main mobile navigation">${[['home','Home','home'],['plan','Plan','calendar'],['tasks','Tasks','list'],['notes','Notes','note']].map(([page,label,ic])=>`<button class="mobile-tab ${state.page===page?'active':''}" data-action="nav" data-page="${page}" aria-label="${label}">${icon(ic)}<span>${label}</span></button>`).join('')}<button class="create-tab" data-action="create" aria-label="Create task or note">${icon('plus')}</button></nav>${renderModal()}</div>`}
const titleHead=(eyebrow,title,sub,buttons='')=>`<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${sub?`<p class="subtitle">${sub}</p>`:''}</div>${buttons?`<div class="actions">${buttons}</div>`:''}</div>`;
const taskMeta=t=>`<span class="dot ${t.workspace==='research'?'blue':t.workspace==='general'?'amber':''}"></span>${escapeHTML(workspace(t.workspace).name)} <span>·</span> ${minsText(t.estimate)} planned ${t.deadline?`<span>·</span>${niceDate(t.deadline)} ${t.deadlineTime||''} deadline`:''}`;
function taskRow(t,withActions=true){const active=state.timer?.taskId===t.id;return `<div class="task-row">${taskPhoto(t)}<button class="circle-check ${t.status==='done'?'done':''}" data-action="toggle-task" data-id="${escapeHTML(t.id)}" aria-label="${t.status!=='open'?'Reopen':'Finish'} ${escapeHTML(t.title)}">${t.status==='done'?icon('check'):t.status==='cancelled'?icon('refresh'):''}</button><div class="task-info"><button style="display:block;border:0;background:none;text-align:left;padding:0;max-width:100%;color:inherit" data-action="detail" data-id="${escapeHTML(t.id)}"><span class="task-title ${t.status==='done'?'done':''}">${escapeHTML(t.title)}</span></button><div class="task-meta">${taskMeta(t)}${(t.tags||[]).length?`<span class="task-tag-label">${escapeHTML(t.tags.slice(0,2).join(' · '))}</span>`:''}${active?`<span class="pill">${icon('clock')} ${state.timer.running?'Tracking':'Paused'} <span data-timer-display>${formatTimer()}</span></span>`:''}</div></div>${t.long?'<span class="pill gray desktop-only">Long-term</span>':''}${t.pinned?'<span class="pill gray desktop-only">Pinned</span>':''}${t.priority==='high'?'<span class="pill danger desktop-only">High</span>':''}${t.status==='cancelled'?'<span class="pill gray">Cancelled</span>':''}${withActions&&t.status==='open'?`<button class="task-action" data-action="${active?(state.timer.running?'pause':'resume'):'start'}" ${active?'':`data-id="${escapeHTML(t.id)}"`} ${isCloudTime&&(state.timeBusy||state.timeLoading||!state.timeLoaded)?'disabled aria-disabled="true"':''} aria-label="${active?(state.timer.running?'Pause':'Resume'):'Start'} task ${escapeHTML(t.title)}">${icon(active&&state.timer.running?'pause':'play')}</button>`:''}</div>`}
function homePins(){
 if(!isCloud)return '';
 const pinnedWorkspaces=workspaces.filter(w=>w.pinned);
 const pinnedTasks=state.tasks.filter(t=>t.pinned&&t.status==='open');
 return `<section class="section dash-grid" aria-label="Pinned account shortcuts">
  <div class="card"><div class="card-title"><h2>Pinned workspaces</h2></div>
   ${pinnedWorkspaces.length?pinnedWorkspaces.map(w=>`
    <button type="button" class="btn small secondary" data-action="workspace" data-id="${escapeHTML(w.id)}"
      style="margin:3px;max-width:100%">${icon('folder')} ${escapeHTML(w.name)}</button>`).join(''):
    '<p class="tiny">Pin a workspace from its page to keep it here.</p>'}
  </div>
  <div class="card"><div class="card-title"><h2>Pinned tasks</h2></div>
   ${pinnedTasks.length?pinnedTasks.slice(0,8).map(t=>taskRow(t,false)).join(''):
    '<p class="tiny">Pin an open task to see it here.</p>'}
   ${pinnedTasks.length>8?'<p class="tiny">Open Tasks to see more pinned items.</p>':''}
  </div></section>`;
}
function home(){const total=openTasks().length;const due=openTasks().filter(t=>t.deadline&&t.deadline<=dayOffset(2));const reminders=openTasks().filter(t=>t.reminder&&t.reminder<=dayOffset(1));const dayTasks=[...state.scheduled.filter(s=>s.day===today()).map(s=>findTask(s.taskId)),...poolForDay(today()).map(findTask)].filter(Boolean);const distinct=[...new Map(dayTasks.map(t=>[t.id,t])).values()];return `${titleHead('Welcome back','Make space for what matters.','Here is a calm overview of everything across your workspaces.',`<button class="btn secondary" data-action="modal-note">${icon('note')}<span class="desktop-only">Quick note</span></button><button class="btn" data-action="modal-task">${icon('plus')}<span class="desktop-only">New task</span></button>`)}${isCloud&&alertsBackendEnabled?`<div class="section"><div class="card"><div class="card-title"><h2>Reminder inbox</h2><button class="btn small secondary" data-action="refresh-alerts" ${state.alertLoading?'disabled':''}>Refresh</button></div><p class="tiny">Alerts are stored in your account. Optional push notifications use this device's permission and may arrive shortly after their due time; a closed browser can still receive them where supported.</p><div class="actions"><button type="button" class="btn small secondary" data-action="${state.pushEnabled?'disable-push':'enable-push'}" ${state.pushBusy?'disabled':''}>${state.pushEnabled?'Disable browser notifications':'Enable browser notifications'}</button><button type="button" class="btn small secondary" data-action="use-device-zone" ${state.pushBusy?'disabled':''}>Use device time zone</button><button type="button" class="btn small secondary" data-action="quiet-hours">Quiet hours</button></div>${state.pushMessage?`<p class="tiny" role="status">${escapeHTML(state.pushMessage)}</p>`:''}${state.alertError?`<p role="alert">${escapeHTML(state.alertError)}</p>`:''}${state.alerts.length?state.alerts.map((a,i)=>`<div class="alert-row"><div class="alert-icon ${a.kind==='deadline'?'danger':''}">${icon(a.kind==='deadline'?'alert':'bell')}</div><div><strong>${escapeHTML(a.title)}</strong><p>${a.kind==='deadline'?'Hard deadline':a.kind==='note'?'Note reminder':'Soft reminder'} · ${escapeHTML(a.day)} ${escapeHTML(a.time)}</p><div class="actions"><button type="button" class="btn small secondary" data-action="alert-ack" data-index="${i}" ${state.alertBusy?'disabled':''}>Acknowledge</button><button type="button" class="btn small secondary" data-action="alert-snooze" data-index="${i}" ${state.alertBusy?'disabled':''}>Snooze 1 hour</button></div></div></div>`).join(''):`<p class="tiny">${state.alertLoading?'Loading alerts…':'No due or upcoming alerts.'}</p>`}</div></div>`:''}<div class="hero"><div class="hero-copy"><small>${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</small><h2>A little progress<br>goes a long way.</h2><p>Your plans, reminders and focused work all in one place.</p></div><button class="btn hero-action" data-action="nav" data-page="plan">Open day plan ${icon('arrow')}</button></div><div class="metrics"><div class="card metric"><div class="metric-label">Open tasks</div><div class="metric-value">${total}</div><div class="metric-note">Across all workspaces</div></div><div class="card metric"><div class="metric-label">Due soon</div><div class="metric-value">${due.length}</div><div class="metric-note">Next 48 hours</div></div><div class="card metric"><div class="metric-label">Today's plan</div><div class="metric-value">${isCloud&&(!poolLoaded.has(today())||!scheduleLoadedDates.has(today()))?'—':distinct.length}</div><div class="metric-note">${isCloud&&(!poolLoaded.has(today())||!scheduleLoadedDates.has(today()))?'Loading your saved plan':'Selected tasks'}</div></div></div><div class="section dash-grid"><div class="card"><div class="card-title"><h2>Today's priorities</h2><button class="text-link" data-action="nav" data-page="plan">View day plan ${icon('arrow')}</button></div>${distinct.length?distinct.slice(0,4).map(t=>taskRow(t)).join(''):'<p class="muted">Your day pool is empty. Choose tasks in Plan Your Day.</p>'}</div><div class="card"><div class="card-title"><h2>Needs your attention</h2><button class="text-link" data-action="nav" data-page="tasks">All tasks</button></div>${isCloud?'<p class="tiny">Your reminders and deadlines are in the inbox above. Acknowledging or snoozing them does not change the task deadline.</p>':([...due.slice(0,1).map(t=>({t,kind:'deadline'})),...reminders.slice(0,2).map(t=>({t,kind:'reminder'}))].slice(0,3).map(({t,kind})=>`<div class="alert-row"><div class="alert-icon ${kind==='deadline'?'danger':''}">${icon(kind==='deadline'?'alert':'bell')}</div><div><strong>${escapeHTML(t.title)}</strong><p>${kind==='deadline'?'Hard deadline':'Soft reminder'} · ${niceDate(kind==='deadline'?t.deadline:t.reminder)} ${kind==='deadline'?(t.deadlineTime||''):(t.reminderTime||'')}</p></div></div>`).join('')||'<p class="tiny">No upcoming alerts.</p>')}</div></div><div class="section dash-grid"><div class="card"><div class="card-title"><h2>Focus & time</h2><span class="pill">${state.timer&&state.timer.running?'Tracking now':'Ready when you are'}</span></div><div class="focus-card"><div><div class="tiny">${state.timer?escapeHTML(findTask(state.timer.taskId)?.title||'Active task'):'No task running'}</div><div class="focus-timer" data-timer-display>${formatTimer()}</div><div class="tiny">${state.timer?(isCloudTime?'Timer saved in Neon':'Timer stored on this device'):(isCloudTime?'Server-backed time sessions':'Start any task to track your time')}</div></div>${state.timer?`<div class="timer-inline-actions"><button class="btn small" data-action="${state.timer.running?'pause':'resume'}">${icon(state.timer.running?'pause':'play')}${state.timer.running?'Pause':'Resume'}</button><button class="btn small secondary" data-action="stop">${icon('stop')} Stop</button><button class="btn small secondary" data-action="finish-task" data-id="${escapeHTML(state.timer.taskId)}">${icon('check')} Finish</button></div>`:`<button class="btn small" data-action="nav" data-page="tasks">${icon('play')} Choose task</button>`}</div></div><div class="card"><div class="card-title"><h2>Your activity</h2><button class="text-link" data-action="nav" data-page="reports">All reports</button></div><div class="metrics" style="margin:0;gap:8px"><div class="metric" style="padding:10px 0"><div class="tiny">${isCloud?'Saved focus time':'Today'}</div><div class="metric-value" style="font-size:21px">${isCloud?(state.timeLoaded&&state.timeRollups?formatElapsed(accountTimeMs()):'—'):'2.4h'}</div></div><div class="metric" style="padding:10px 0"><div class="tiny">${isCloud?'Open tasks':'Week'}</div><div class="metric-value" style="font-size:21px">${isCloud?openTasks().length:'16h'}</div></div><div class="metric" style="padding:10px 0"><div class="tiny">${isCloud?'Completed tasks':'Month'}</div><div class="metric-value" style="font-size:21px">${isCloud?state.tasks.filter(t=>t.status==='done').length:'64h'}</div></div></div><p class="banner-note">${isCloud?'Saved focus time is an all-time account total, not a current-week estimate. Period-specific reports are in M7.2.':'Sample figures in the local design preview.'}</p></div></div>${homePins()}<div class="section"><div class="section-head"><h2>My workspaces</h2><button class="text-link" data-action="nav" data-page="workspaces">Explore all ${icon('arrow')}</button></div>${workspaceCards()}</div>`}
function workspaceCards(){return `<div class="workspace-strip">${workspaces.map(w=>`<button class="workspace-card" data-action="workspace" data-id="${w.id}"><div class="workspace-cover ${w.cover} ${photoClass('workspace',w.id,'cover')}"${photoStyle('workspace',w.id,'cover')}></div><div class="workspace-info"><strong>${escapeHTML(w.name)}</strong><p>${escapeHTML(w.subtitle)}</p><div class="caption-line"><span>${state.tasks.filter(t=>t.workspace===w.id&&t.status!=='done').length} open tasks</span>${icon('arrow')}</div></div></button>`).join('')}</div>`}
function tasksPage(){
 let results=[...state.tasks].filter(t=>state.workspaceFilter==='all'||t.workspace===state.workspaceFilter)
 .filter(t=>{
  const value=state.filter;
  if(value==='active')return t.status==='open';
  if(value==='completed')return t.status==='done';
  if(value==='cancelled')return t.status==='cancelled';
  if(value==='long')return t.long;
  if(value==='pinned')return t.pinned;
  if(value==='overdue')return t.status==='open'&&t.deadline&&t.deadline<today();
  return true;
 }).filter(t=>[t.title,t.notes,...(t.tags||[])].some(v=>String(v||'').toLocaleLowerCase().includes(state.search.toLocaleLowerCase())));
 const priority={high:0,medium:1,low:2};
 results.sort((a,b)=>{
  if(state.taskSort==='priority')return (priority[a.priority]??1)-(priority[b.priority]??1)||a.title.localeCompare(b.title);
  if(state.taskSort==='name')return a.title.localeCompare(b.title);
  if(state.taskSort==='oldest')return String(a.createdAt||'').localeCompare(String(b.createdAt||''));
  if(state.taskSort==='newest')return String(b.createdAt||'').localeCompare(String(a.createdAt||''));
  return (a.deadline||'9999-12-31').localeCompare(b.deadline||'9999-12-31')||(priority[a.priority]??1)-(priority[b.priority]??1)||a.title.localeCompare(b.title);
 });
 const buttons=`<button class="btn" data-action="modal-task">${icon('plus')} New task</button>`+
  `<button class="btn secondary" data-action="nav" data-page="task-archive">${icon('folder')} Archive</button>`+
  `<button class="btn secondary" data-action="nav" data-page="trash">${icon('trash')} Trash</button>`;
 const filters=[['all','All'],['active','Open'],['pinned','Pinned'],['overdue','Overdue'],['long','Long-term'],['completed','Completed'],['cancelled','Cancelled']];
 return titleHead('Keep track','Your tasks','Search, filter and prioritize work across every active workspace.',buttons)+
 `<div class="toolbar task-toolbar">
 <label class="search">${icon('search')}<input id="task-search" type="search" aria-label="Search tasks" placeholder="Search titles, notes and tags" value="${escapeHTML(state.search)}" /></label>
 <select class="field" id="workspace-filter" aria-label="Filter workspace"><option value="all">All workspaces</option>${workspaces.map(w=>`<option value="${escapeHTML(w.id)}" ${state.workspaceFilter===w.id?'selected':''}>${escapeHTML(w.name)}</option>`).join('')}</select>
 <select class="field" id="task-sort" aria-label="Sort tasks">${[['deadline','Due date'],['priority','Priority'],['newest','Newest'],['oldest','Oldest'],['name','Name']].map(([v,label])=>`<option value="${v}" ${state.taskSort===v?'selected':''}>${label}</option>`).join('')}</select>
 </div>
 <div class="filters task-filter-row">${filters.map(([v,l])=>`<button class="filter ${state.filter===v?'active':''}" data-action="filter" data-value="${v}" aria-pressed="${state.filter===v}">${l}</button>`).join('')}</div>
 <div class="card task-list-card">${results.length?results.map(t=>taskRow(t)).join(''):`<div class="empty">${icon('list')}<h3>No matching tasks</h3><p>Change your filters or add something new.</p></div>`}</div>`;
}
function archivedTasksPage(){
 const back='<button class="btn secondary" data-action="nav" data-page="tasks">'+icon('back')+' All tasks</button>';
 const rows=state.archivedTasks.map(t=>
   '<div class="task-row"><div class="task-info"><strong class="task-title">'+escapeHTML(t.title)+'</strong>'+
   '<div class="task-meta">'+escapeHTML(workspace(t.workspace).name)+' · '+escapeHTML(t.status)+'</div></div>'+
   '<button class="btn secondary small" data-action="unarchive-task" data-id="'+escapeHTML(t.id)+'">'+icon('refresh')+' Restore</button></div>'
 ).join('');
 return titleHead('Safe keeping','Archived tasks','Archived tasks and subtasks remain in Neon, but leave active lists.',back)+
  '<div class="card task-list-card">'+(state.taskArchiveBusy?'<p role="status" class="subtitle">Loading archive…</p>':
    rows||'<div class="empty"><h3>No archived tasks</h3><p>Use Archive from a task detail page to keep it out of active views.</p></div>')+'</div>';
}
function trashPage(){
 return titleHead('Recoverable items','Task Trash','Deleted tasks can be restored. Permanent deletion is not enabled.',
 `<button class="btn secondary" data-action="nav" data-page="tasks">${icon('back')} Back to tasks</button>`)
 + (state.trashBusy?'<div class="card"><p>Loading Trash…</p></div>':
 `<div class="card task-list-card">${state.trashed.length?state.trashed.map(t=>`
 <div class="task-row"><div class="task-info"><strong class="task-title">${escapeHTML(t.title)}</strong>
 <div class="task-meta">${escapeHTML(workspace(t.workspace).name)} · Recoverable</div></div>
 <div class="actions"><button class="btn secondary small" data-action="restore-task" data-id="${escapeHTML(t.id)}">${icon('refresh')} Restore</button>${isCloud?`<button class="btn danger small" data-action="modal-permanent-task" data-id="${escapeHTML(t.id)}">${icon('trash')} Delete forever</button>`:''}</div></div>`).join(''):
 '<div class="empty"><h3>Trash is empty</h3><p>Deleted tasks appear here for recovery.</p></div>'}</div>`);
}
function plan(){const selected=state.scheduled.filter(s=>s.day===state.planDay).sort((a,b)=>a.start.localeCompare(b.start));const pool=poolForDay(state.planDay).map(findTask).filter(Boolean).filter(t=>t.status==='open');const scheduledMins=selected.reduce((m,s)=>m+(parseClock(s.end)-parseClock(s.start)),0);const poolMins=pool.reduce((m,t)=>m+remainingUnscheduled(t,state.planDay),0);const all=scheduledMins+poolMins;const available=state.capacity*60;const conflict=selected.some((s,i)=>i>0&&s.start<selected[i-1].end);return `${titleHead('Your time, your rules','Plan your day','Give some tasks a fixed time. Leave the rest in your flexible daily pool.',`<button class="btn secondary" data-action="modal-plan-add" ${isCloud&&(!poolLoaded.has(state.planDay)||state.poolBusy)?'disabled aria-disabled="true"':''}>${icon('plus')} Add to day</button><button class="btn secondary" data-action="nav" data-page="calendar">${icon('calendar')} Calendar</button>`)}<div class="toolbar"><div class="actions"><label class="tiny" for="plan-day">Planning date</label><input class="field" id="plan-day" type="date" value="${state.planDay}" style="max-width:190px" /></div><div class="actions"><label class="tiny" for="capacity">Available hours</label><select class="field" id="capacity" style="max-width:95px">${[2,3,4,5,6,7,8,9,10,12].map(n=>`<option value="${n}" ${state.capacity===n?'selected':''}>${n}h</option>`).join('')}</select></div></div><div class="capacity"><div style="display:flex;justify-content:space-between;gap:7px"><strong>${minsText(all)} planned</strong><span class="tiny">${state.capacity}h available</span></div><div class="progress-bg"><div class="progress-bar ${all>available?'over':''}" style="width:${Math.min(100,100*all/available)}%"></div></div><span class="tiny">${all>available?`${minsText(all-available)} over capacity. Consider moving some pool tasks.`:`${minsText(available-all)} remains unallocated.`} ${conflict?'⚠ Scheduled intervals overlap.':''}</span></div>${isCloud?`<div class="pool-sync-status" role="${state.poolErrors[state.planDay]?'alert':'status'}" aria-live="polite">
 ${poolPending.has(state.planDay)?'Loading saved daily pool…':state.poolBusy?'Saving daily pool…':state.poolErrors[state.planDay]?`<span>${escapeHTML(state.poolErrors[state.planDay])}</span><button type="button" class="btn secondary small" data-action="pool-retry">Retry load</button>`:poolLoaded.has(state.planDay)?'Daily pool saved in Neon · open tasks from every workspace':'Daily pool not yet loaded'}
 </div>`:''}<div class="day-grid"><div class="card"><div class="card-title"><h2>${icon('clock')} Timed schedule</h2><button class="text-link" data-action="modal-schedule" ${isCloud&&(state.scheduleLoading||state.scheduleBusy||!scheduleLoadedDates.has(state.planDay))?'disabled':''}>${icon('plus')} Add interval</button></div>
${isCloud?`<div class="schedule-status" role="${state.scheduleError?'alert':'status'}" aria-live="polite">
 ${state.scheduleLoading?'Loading timed blocks…':state.scheduleBusy?'Saving timed block…':state.scheduleError?`<span>${escapeHTML(state.scheduleError)}</span><button class="btn secondary small" data-action="schedule-retry">Reload</button>`:scheduleLoadedDates.has(state.planDay)?'Timed blocks saved in Neon':'Timed schedule not loaded'}
 </div>`:''}${selected.length?selected.map(s=>{const t=findTask(s.taskId);return `<div class="time-slot"><div class="time-label">${s.start}</div><div class="time-card ${t?.workspace==='research'?'blue':t?.workspace==='general'?'orange':''}"><div><strong>${escapeHTML(t?.title||'Archived task · reserved time')}</strong><p>${s.start} – ${s.end} · ${t?escapeHTML(workspace(t.workspace).name):'Task not in active list'}</p></div><div class="time-card-actions">
 <button class="mini-btn" data-action="edit-interval" data-id="${escapeHTML(s.id)}" aria-label="Edit ${escapeHTML(t?.title||'task')} time interval">${icon('edit')}</button>
 <button class="mini-btn" data-action="unschedule" data-id="${escapeHTML(s.id)}" aria-label="Remove ${escapeHTML(t?.title||'task')} time interval">${icon('close')}</button></div></div></div>`}).join(''):`<div class="empty">${icon('calendar')}<h3>No timed tasks</h3><p>Choose a pool task and give it an interval.</p></div>`}</div><div class="card"><div class="card-title"><h2>${icon('list')} Flexible daily pool</h2><span class="pill gray">${pool.length} unscheduled</span></div>${pool.length?pool.map((t,i)=>`<div class="pool-item"><div style="flex:1;min-width:0"><strong>${escapeHTML(t.title)}</strong><p>${escapeHTML(workspace(t.workspace).name)} · ${minsText(remainingUnscheduled(t,state.planDay))} remaining</p></div><div class="reorder"><button class="mini-btn" data-action="pool-up" data-id="${t.id}" ${i===0?'disabled':''} aria-label="Move ${escapeHTML(t.title)} earlier">${icon('up')}</button><button class="mini-btn" data-action="pool-down" data-id="${t.id}" ${i===pool.length-1?'disabled':''} aria-label="Move ${escapeHTML(t.title)} later">${icon('down')}</button></div><button class="mini-btn" data-action="modal-schedule" data-id="${t.id}" aria-label="Give ${escapeHTML(t.title)} a fixed time">${icon('calendar')}</button><button class="mini-btn" data-action="pool-remove" data-id="${t.id}" aria-label="Remove ${escapeHTML(t.title)} from today">${icon('close')}</button></div>`).join(''):'<div class="empty"><h3>Your pool is empty</h3><p>You can leave tasks here without a time, or schedule them.</p></div>'}<button class="btn secondary small" style="width:100%;margin-top:10px" data-action="modal-plan-add" ${isCloud&&(!poolLoaded.has(state.planDay)||state.poolBusy)?'disabled aria-disabled="true"':''}>${icon('plus')} Choose another task</button></div></div><p class="banner-note">${isCloud?'Untimed pool and timed intervals are saved to Neon. Capacity is a local planning preference; deadlines and reminders are independent.':'Local preview: day pool and timed intervals are saved only on this device.'}</p>`}
function archivedWorkspacesPage(){
 const back='<button class="btn secondary" data-action="nav" data-page="workspaces">'+icon('back')+' All workspaces</button>';
 const rows=state.archivedWorkspaces.map(w=>
  '<div class="archive-workspace-row"><div class="archive-workspace-copy"><strong>'+escapeHTML(w.name)+'</strong>'+
  '<small>'+escapeHTML(w.subtitle||'Custom workspace')+'</small></div>'+
  '<button type="button" class="btn secondary small" data-action="restore-workspace" data-id="'+escapeHTML(w.id)+'">'+icon('refresh')+' Restore</button></div>'
 ).join('');
 return titleHead('Your saved spaces','Archived workspaces','These spaces and their tasks are preserved in Neon, but hidden from active views.',back)+
  '<section class="card archive-workspace-list" aria-label="Archived workspaces">'+
  (state.archiveBusy?'<p class="subtitle" role="status">Loading archived workspaces…</p>':
   rows||'<div class="empty"><h3>Nothing archived</h3><p>Only custom workspaces can be archived. General stays active.</p></div>')+
  '</section>';
}
function workspacesPage(){return `${titleHead('All your worlds','Workspaces','General is always here. Build dedicated spaces for everything else.')}<div class="info-banner">${icon('layers')} Home and the day planner always combine tasks from every workspace.</div>${workspaceCards()}<div class="section"><div class="card"><h2>Why separate workspaces?</h2><p class="subtitle">Each workspace has its own tasks, quick notes, documents, time reports and eventual profile or cover images. Long-term tasks live inside workspaces and have their own scoped reports too.</p><div style="margin-top:15px"><button class="btn secondary small" data-action="modal-workspace">${icon('plus')} Create workspace</button>${isCloud?`<button class="btn secondary small" data-action="nav" data-page="workspace-archive">${icon('folder')} Archived workspaces</button>`:''}</div></div></div>`}
function workspacePage(){const w=workspace(state.viewWorkspace);return `<div style="margin-bottom:13px"><button class="btn ghost small" data-action="nav" data-page="workspaces">${icon('back')} All workspaces</button></div>${coverFrame('workspace',w.id,w.cover,'folder')}<div class="detail-options media-toolbar">${photoButton('workspace',w.id,'cover','Edit cover')}${photoButton('workspace',w.id,'avatar','Edit avatar')}${isCloud?`<button type="button" class="btn secondary small" data-action="pin-workspace" data-id="${escapeHTML(w.id)}" ${state.cloudBusy?'disabled':''} aria-pressed="${Boolean(w.pinned)}">${icon('pin')} ${w.pinned?'Unpin':'Pin'} workspace</button>`:''}${w.kind==='custom'?`<button class="btn secondary small" data-action="modal-workspace-edit" data-id="${escapeHTML(w.id)}">${icon('edit')} Edit workspace</button>`:''}${isCloud&&w.kind==='custom'?`<button type="button" class="btn secondary small" data-action="archive-workspace" data-id="${escapeHTML(w.id)}">${icon('folder')} Archive</button>`:''}</div>${titleHead('Workspace',escapeHTML(w.name),escapeHTML(w.subtitle),`<button type="button" class="btn" data-action="modal-task" data-id="${escapeHTML(w.id)}" aria-label="Add task to ${escapeHTML(w.name)}">${icon('plus')} Add task</button>`)}<div class="metrics" style="margin:0 0 19px"><div class="card metric"><div class="metric-label">Open tasks</div><div class="metric-value">${state.tasks.filter(t=>t.workspace===w.id&&t.status==='open').length}</div></div><div class="card metric"><div class="metric-label">Notes</div><div class="metric-value">${state.notes.filter(n=>n.workspace===w.id).length}</div></div><div class="card metric"><div class="metric-label">Recorded time</div><div class="metric-value" data-current-workspace-time>${isCloudTime&&!state.timeLoaded?'—':formatElapsed(workspaceTimeMs(w))}</div><div class="metric-note">${isCloudTime?'Historical sessions originally recorded here':'Direct time spent on tasks here'}</div></div></div>${weekWorkspaceBlock(w)}<div class="dash-grid"><div class="card"><div class="card-title"><h2>Workspace tasks</h2><button type="button" class="btn small secondary" data-action="modal-task" data-id="${escapeHTML(w.id)}" aria-label="Add task to ${escapeHTML(w.name)}">${icon('plus')} Add task</button></div>${state.tasks.filter(t=>t.workspace===w.id).map(t=>taskRow(t)).join('')||'<p class="tiny">No tasks in this workspace yet. Use Add task to create the first one.</p>'}</div><div class="card"><div class="card-title"><h2>Workspace notes</h2><button class="text-link" data-action="modal-note" data-id="${w.id}">Quick note</button></div>${state.notes.filter(n=>n.workspace===w.id).map(n=>`<div class="alert-row"><div class="document-icon">${icon('note')}</div><div><strong>${escapeHTML(n.title)}</strong><p>${escapeHTML(n.content.slice(0,90))}</p></div></div>`).join('')||'<p class="tiny">No notes yet.</p>'}<p class="banner-note">${isCloud?'<button type="button" class="btn small secondary" data-action="documents-workspace" data-id="'+escapeHTML(w.id)+'">Workspace documents</button>':'Private documents require sign-in.'} Cover uploads remain separate.</p></div></div>`}
function notesPage(){
 const trashed=isCloud&&state.noteMode==='trash';
 const workspaceNotes=(trashed?state.noteTrash:state.notes).filter(n=>workspaces.some(w=>w.id===n.workspace));
 const query=state.noteSearch.trim().toLocaleLowerCase();
 const notes=workspaceNotes.filter(n=>(state.noteFilter==='all'||state.noteFilter==='pinned'&&n.pinned||
  state.noteFilter===n.workspace)&&(!query||[n.title,n.content,workspace(n.workspace).name]
  .some(value=>String(value||'').toLocaleLowerCase().includes(query))))
  .sort((a,b)=>trashed?String(b.deletedAt||'').localeCompare(String(a.deletedAt||'')):
   Number(b.pinned)-Number(a.pinned)||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
 const header=titleHead('Capture thoughts','Notes & documents',
  isCloud?'Quick notes saved to your Dayframe account.':'Quick notes in your local preview.',
  `<button class="btn" data-action="modal-note" ${state.noteBusy?'disabled':''}>${icon('plus')} Quick note</button>`);
 const filters=`<div class="filters" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:15px">
  <label class="field-wrap" style="flex:1;min-width:160px"><span class="form-label">Search notes</span>
   <input class="field" id="note-search" type="search" autocomplete="off"
    value="${escapeHTML(state.noteSearch)}" placeholder="Title or content"/></label>
  <label class="field-wrap" style="min-width:130px"><span class="form-label">Workspace or pins</span>
   <select class="field" id="note-filter"><option value="all">All workspaces</option>
    <option value="pinned" ${state.noteFilter==='pinned'?'selected':''}>Pinned notes</option>
    ${workspaces.map(w=>`<option value="${escapeHTML(w.id)}" ${state.noteFilter===w.id?'selected':''}>${escapeHTML(w.name)}</option>`).join('')}
   </select></label>
   ${isCloud?`<button type="button" class="btn small secondary" data-action="refresh-notes" ${state.noteLoading||state.noteBusy?'disabled':''}>Refresh</button>`:''}
 </div>`;
 const cards=notes.map(n=>{
  const color=['cream','lilac','green','blue'].includes(n.color)?n.color:'cream';
  const disabled=state.noteBusy?'disabled':'';
  const converted=n.convertedAt?'<span class="pill gray">Converted to task</span>':'';
  const canView=n.convertedTaskId&&findTask(n.convertedTaskId);
  const reminder=n.reminder?`<small>Reminder saved: ${escapeHTML(n.reminder)}${n.reminderTime?' '+escapeHTML(n.reminderTime):''} · ${isCloud?'account reminder; browser push requires permission':'local only; no notifications'}</small>`:'';
  return `<article class="note ${color}">
   <div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between">
    <h3>${escapeHTML(n.title)}</h3>
    ${!trashed?`<button type="button" data-action="toggle-note-pin" data-id="${escapeHTML(n.id)}"
     class="mini-btn" ${disabled} aria-pressed="${Boolean(n.pinned)}"
     aria-label="${n.pinned?'Unpin':'Pin'} ${escapeHTML(n.title)}">${icon('pin')} ${n.pinned?'Pinned':'Pin'}</button>`:''}
   </div>
   <p style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHTML(n.content)}</p>
   ${reminder}<div>${converted}</div>
   <div class="note-foot" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
    <span style="margin-right:auto">${escapeHTML(workspace(n.workspace).name)}</span>
${trashed?`<button type="button" class="mini-btn" data-action="restore-note"
      data-id="${escapeHTML(n.id)}" ${disabled} aria-label="Restore ${escapeHTML(n.title)}">Restore note</button>`:`
    <button type="button" class="mini-btn" data-action="edit-note" data-id="${escapeHTML(n.id)}"
     ${disabled} aria-label="Edit ${escapeHTML(n.title)}">${icon('edit')} Edit</button>
    ${canView?`<button type="button" class="mini-btn" data-action="detail" data-id="${escapeHTML(n.convertedTaskId)}">Open task</button>`:''}
    ${!n.convertedAt?`<button type="button" class="mini-btn" data-action="convert-note" data-id="${escapeHTML(n.id)}"
     ${disabled} aria-label="Convert ${escapeHTML(n.title)} to task">To task</button>`:''}
    <button type="button" data-action="delete-note" data-id="${escapeHTML(n.id)}"
     class="mini-btn" ${disabled} title="Remove note with confirmation"
     aria-label="Delete ${escapeHTML(n.title)}">${icon('trash')}</button>`}
   </div>
  </article>`;
 }).join('');
 return `${header}
 <div class="section-head"><h2>${trashed?'Deleted notes':'Quick notes'}</h2><span class="pill gray">${workspaceNotes.length} notes</span></div>
 ${isCloud?`<div class="actions" role="group" aria-label="Notes folders" style="margin-bottom:12px">
  <button type="button" class="btn small ${!trashed?'':'secondary'}" data-action="show-active-notes" aria-pressed="${!trashed}">My notes</button>
  <button type="button" class="btn small ${trashed?'':'secondary'}" data-action="show-note-trash" aria-pressed="${trashed}">Recently deleted</button>
 </div>`:''}
 ${trashed?'<p class="tiny">Deleted notes remain in your account until a future retention policy is introduced. To restore notes from an archived workspace, restore that workspace first.</p>':''}
 ${filters}
 ${(trashed?state.noteTrashError:state.noteError)?`<div class="info-banner" role="alert">${escapeHTML(trashed?state.noteTrashError:state.noteError)}
  <button type="button" class="btn small secondary" data-action="${trashed?'refresh-note-trash':'refresh-notes'}">Retry</button></div>`:''}
 ${isCloud&&(trashed?state.noteTrashLoading&&!state.noteTrashLoaded:state.noteLoading&&!state.noteLoaded)?
   '<p class="subtitle" role="status">Loading saved notes…</p>':''}
 ${!(trashed?state.noteTrashLoading:state.noteLoading)&&
   (trashed?state.noteTrashLoaded:state.noteLoaded)&&notes.length===0?
   `<div class="card"><p>${trashed?'No deleted notes to restore.':'No notes match your selection. Create one or change the filter.'}</p></div>`:''}
 <div class="note-grid">${cards}</div>
 <div class="section"><div class="section-head"><h2>Rich documents</h2></div>
  <div class="card"><p class="subtitle">${isCloud?'Private documents support nested pages, math, links and autosave as you write.':'Private documents require sign-in. Local Quick Notes remain available.'}</p>
   ${isCloud?'<button type="button" class="btn secondary" data-action="nav" data-page="documents">Open document library</button>':''}</div>
 </div>`;
}
function weeklyReportsPanel(){
 if(!isCloudTime)return '';
 const week=state.timeWeek;
 if(!week)return `<section class="card" aria-label="Current week summary">
  <div class="card-title"><h2>Current week · planned versus recorded</h2>
   <button type="button" class="btn small secondary" data-action="refresh-week">Refresh</button>
  </div><p class="tiny" role="status">${escapeHTML(state.weekError||'Loading weekly time…')}</p>
 </section>`;
 const variance=week.accountActualMs-week.accountPlannedMinutes*60000;
 const workspaceRows=week.workspaces.map(w=>{
  const display=workspaces.find(x=>serverWorkspaceId(x.id)===w.workspaceId);
  const name=escapeHTML(display?.name||w.name||'Former workspace');
  const goal=w.targetMinutes?formatElapsed(w.targetMinutes*60000):'Not set';
  const percent=w.targetMinutes?Math.round(100*w.actualMs/(w.targetMinutes*60000)):null;
  return `<tr><td>${name}${w.archived?' (archived)':''}</td>
   <td>${minsText(w.plannedMinutes)}</td>
   <td>${formatElapsed(w.actualMs)}</td>
   <td>${goal}${percent===null?'':` · ${percent}%`}</td></tr>`;
 }).join('');
 return `<section class="card" aria-label="Current week plan and recorded time">
  <div class="card-title"><h2>Current week · planned versus recorded</h2>
   <button type="button" class="btn small secondary" data-action="refresh-week"
    ${state.weekLoading?'disabled':''}>Refresh</button>
  </div>
  <p class="tiny">${escapeHTML(week.weekStart)} to ${escapeHTML(week.weekEnd)} (end exclusive) · ${escapeHTML(week.timeZone)}.
   Fixed plans are current scheduled blocks, not a historical snapshot of earlier plans.</p>
  <div class="metrics">
   <div class="metric"><div class="metric-label">Fixed blocks planned</div><div class="metric-value">${minsText(week.accountPlannedMinutes)}</div></div>
   <div class="metric"><div class="metric-label">Time recorded</div><div class="metric-value" data-week-actual>${formatElapsed(week.accountActualMs)}</div></div>
   <div class="metric"><div class="metric-label">Recorded − planned</div><div class="metric-value">${variance>=0?'+':'−'}${formatElapsed(Math.abs(variance))}</div></div>
  </div>
  <div style="overflow-x:auto"><table class="report-table" aria-label="Current week by workspace">
   <thead><tr><th>Workspace</th><th>Fixed plan</th><th>Recorded</th><th>Target and progress</th></tr></thead>
   <tbody>${workspaceRows||'<tr><td colspan="4">No workspace data yet</td></tr>'}</tbody>
  </table></div>
  ${week.accountLegacyEstimatedMs>0?`<p class="tiny" role="note">Historical precision: ${formatElapsed(week.accountLegacyEstimatedMs)} of this week’s recorded time comes from pre-M5.3 sessions, attributed to their session-start week because exact segments were unavailable.</p>`:''}
  <p class="tiny">Targets repeat weekly. Set them inside each workspace. Actual tracked time is not limited to scheduled blocks.</p>
  ${state.weekError?`<p class="tiny" role="alert">${escapeHTML(state.weekError)}</p>`:''}
 </section>`;
}
function insightsPanel(){
 const data=state.insightsKey===state.reportPeriod+'|'+state.reportAnchor?
  state.insights:null;
 if(!data)return state.insightsLoading?
  '<section class="section card" role="status">Loading account completion insights…</section>':
  state.insightsError?`<section class="section card"><p role="alert">${escapeHTML(state.insightsError)}</p></section>`:'';
 const d=data.deadline,e=data.estimate;
 const onTime=d.withDeadline?Math.round(100*d.onTime/d.withDeadline)+'%':'—';
 const ratio=e.measuredTasks&&e.estimatedMinutes>0?
  (100*e.recordedMs/(e.estimatedMinutes*60000)).toFixed(1)+'%':'—';
 const difference=e.measuredTasks&&e.estimatedMinutes>0?
  (100*e.absoluteErrorMs/(e.estimatedMinutes*60000)).toFixed(1)+'%':'—';
 const max=Math.max(1,...data.weeklyTrend.map(w=>w.recordedMs));
 const weekRows=data.weeklyTrend.map(w=>{
  const width=Math.round(w.recordedMs/max*100);
  return `<tr><th scope="row">${escapeHTML(w.weekStart)}</th>
    <td><div class="df-insight-track" aria-hidden="true"><div class="df-insight-bar"
     style="width:${width}%"></div></div>${formatElapsed(w.recordedMs)}</td>
    <td>${w.completedEvents}</td></tr>`;
 }).join('');
 const recent=data.history.map(h=>
  `<tr><td>${escapeHTML(h.title)}</td>
   <td>${escapeHTML(h.completedAt)}</td>
   <td>${h.deadline?escapeHTML(h.deadline+' '+(h.deadlineTime||'end of day')):'No deadline'}</td>
   <td>${h.onTime===null?'Not rated':h.onTime?'On time':'Late'}</td></tr>`).join('');
 return `<section class="section card" aria-label="Account completion insights">
  <div class="card-title"><h2>Completion insights</h2>
   <div class="actions"><span class="tiny">Audit events · ${escapeHTML(data.timeZone)}</span>
    <button class="btn secondary small" type="button" data-action="export-insights-csv">
     Download insights CSV</button></div></div>
  <p class="tiny">Selected period ${escapeHTML(data.startDay)}–${escapeHTML(data.endDayExclusive)}
   (end exclusive). Completion history counts events, not unique tasks; reopened tasks
   may be completed more than once.</p>
  <div class="report-cards">
   <div class="metric"><div class="metric-label">Completion events</div>
    <div class="metric-value">${d.completedEvents}</div></div>
   <div class="metric"><div class="metric-label">On-time deadline events</div>
    <div class="metric-value">${onTime}</div>
    <p class="tiny">${d.onTime} on time · ${d.late} late · ${d.withoutDeadline} without deadline</p></div>
   <div class="metric"><div class="metric-label">Tracked / estimated</div>
    <div class="metric-value">${ratio}</div>
    <p class="tiny">For ${e.measuredTasks} comparable tasks; not a measure of all labor</p></div>
   <div class="metric"><div class="metric-label">Absolute estimate difference</div>
    <div class="metric-value">${difference}</div>
    <p class="tiny">Weighted sum of each task's absolute tracked-versus-estimated difference</p></div>
  </div>
  <p class="tiny">Estimates and deadlines use completion-event snapshots.
   Date-only deadlines expire at the end of the stated day in the current account
   timezone. ${e.excludedLegacyTasks} comparisons excluded for unsegmented history,
   ${e.untrackedTasks} for no direct tracked time. Timezone changes were not
   historically snapshotted, so old deadline rates can change if you change timezone.</p>
  <h3>Six-week progress trend</h3>
  <p class="tiny">Exact recorded focus segments only; older unsegmented time is excluded.
   Weeks are ISO Monday–Sunday in the selected account timezone.</p>
  <div class="report-table-scroll"><table class="report-table" aria-label="Six week completion and focus trend">
   <thead><tr><th>Week starting</th><th>Recorded focus</th><th>Completion events</th></tr></thead>
   <tbody>${weekRows}</tbody></table></div>
  <h3>Recent deadline history</h3>
  <div class="report-table-scroll"><table class="report-table" aria-label="Recent completion audit events">
   <thead><tr><th>Task</th><th>Completed at (UTC)</th><th>Deadline snapshot</th><th>Outcome</th></tr></thead>
   <tbody>${recent||'<tr><td colspan="4">No completion events in this period</td></tr>'}</tbody>
  </table></div>
  <p class="tiny">Showing ${data.history.length} of ${d.completedEvents} completion
   events. CSV history is also limited to the latest 30 events; aggregate counts
   cover the full selected period. Parent/subtask tracked time is never added twice.</p>
 </section>`;
}
function renderWorkspacePie(title,rows,kind){
 const pie=pieSegments(rows);
 const units=kind==='focus'?'of recorded time':'of fixed planned time';
 const time=value=>kind==='focus'?formatElapsed(value):minsText(value);
 const legend=pie.segments.map(slice=>
  `<li class="df-pie-legend-item">
    <span class="df-pie-key" style="background:${slice.color}" aria-hidden="true"></span>
    <span class="df-pie-name">${escapeHTML(slice.label)}</span>
    <strong>${slice.percentage.toFixed(1)}%</strong>
    <small>${time(slice.value)}</small></li>`).join('');
 return `<section class="card df-pie-card" aria-label="${escapeHTML(title)}">
   <h3>${escapeHTML(title)}</h3>
   <p class="tiny">Share ${units} by workspace, from the selected saved period.</p>
   ${pie.total?
     `<div class="df-pie-content">
       <div class="df-pie-disc" role="img"
        aria-label="${escapeHTML(title+'; '+pie.segments.map(x=>x.label+' '+x.percentage.toFixed(1)+' percent').join(', '))}"
        style="background:${pieGradient(pie)}"></div>
       <ul class="df-pie-legend">${legend}</ul>
      </div>`:
     '<p class="df-pie-empty">No saved time for this period yet.</p>'}
  </section>`;
}
function signedInReportsPage(){
 const period=state.reportPeriod,report=state.periodReport;
 const controls=`<div class="filters" style="display:flex;flex-wrap:wrap;align-items:end;gap:10px;margin-bottom:17px">
  <div class="actions" role="group" aria-label="Report period">
   ${[['day','Day'],['week','Week'],['month','Month']].map(([kind,label])=>
    `<button type="button" class="filter ${kind===period?'active':''}"
       aria-pressed="${kind===period}" data-action="report-period" data-value="${kind}">${label}</button>`).join('')}
  </div>
  <label class="field-wrap"><span class="form-label">Date within the period</span>
   <input id="report-anchor" class="field" type="date" value="${escapeHTML(state.reportAnchor)}"/></label>
  <button type="button" class="btn secondary small" data-action="refresh-period"
    ${state.periodLoading?'disabled':''}>Refresh report</button>
  <button type="button" class="btn secondary small" data-action="export-period-csv"
    ${!report||state.periodLoading?'disabled':''}>Download CSV</button>
  <button type="button" class="btn secondary small" data-action="load-insights"
    ${state.insightsLoading||state.periodLoading?'disabled':''}>Load insights</button>
 </div>`;
 const header=titleHead('Account activity','Reports',
  'Saved focus sessions and fixed planned intervals; historical gaps are identified explicitly.');
 if(!report)return header+controls+
  `<div class="card"><p role="${state.periodError?'alert':'status'}">${escapeHTML(state.periodError||'Loading saved period report…')}</p></div>`;
 const workspaceRows=report.workspaces.filter(w=>w.recordedMs||w.legacyEstimatedMs||w.plannedMinutes);
 const wsHtml=workspaceRows.length?workspaceRows.map(w=>
  `<tr><td>${escapeHTML(w.name||'Deleted workspace')} ${w.archived?'(archived)':''}</td>
    <td>${formatElapsed(w.recordedMs)}</td>
    <td>${minsText(w.plannedMinutes)}</td>
    <td>${w.legacyEstimatedMs?formatElapsed(w.legacyEstimatedMs):'—'}</td></tr>`).join(''):
   '<tr><td colspan="4">No saved activity in this period</td></tr>';
 const longTerms=report.longTermTasks.filter(t=>t.recordedMs||t.plannedMinutes);
 const taskHtml=longTerms.length?longTerms.map(t=>
  `<tr><td>${escapeHTML(t.title)} ${t.status!=='open'?'('+escapeHTML(t.status)+')':''}</td>
    <td>${formatElapsed(t.recordedMs)}</td><td>${minsText(t.plannedMinutes)}</td></tr>`).join(''):
   '<tr><td colspan="3">No long-term task activity in this period</td></tr>';
 return header+controls+`
  ${state.periodLoading?'<p class="tiny" role="status">Refreshing the account report…</p>':''}
  ${state.periodError?`<p class="info-banner" role="alert">${escapeHTML(state.periodError)}</p>`:''}
  <p class="subtitle">Period: ${escapeHTML(report.startDay)} to ${escapeHTML(report.endDayExclusive)} (end exclusive),
   ${escapeHTML(report.timeZone)}. ${report.runningIncluded?'Active running time is included at report request time.':''}</p>
  <div class="report-cards">
   <div class="card metric"><div class="metric-label">Recorded focus time</div>
    <div class="metric-value">${formatElapsed(report.accountRecordedMs)}</div><div class="metric-note">Exact segment overlap</div></div>
   <div class="card metric"><div class="metric-label">Fixed plan</div>
    <div class="metric-value">${minsText(report.accountPlannedMinutes)}</div>
    <div class="metric-note">Scheduled intervals only, not flexible pool tasks</div></div>
   <div class="card metric"><div class="metric-label">Historical time estimate</div>
    <div class="metric-value">${formatElapsed(report.accountLegacyEstimatedMs)}</div>
    <div class="metric-note">Separate from recorded time; session-start attribution</div></div>
  </div>
  ${report.accountLegacyEstimatedMs?'<div class="info-banner">Older sessions lack detailed segment timestamps. Their remaining duration is estimated into the period of the session start and is not included in exact recorded totals.</div>':''}
  <div class="df-pie-section" aria-label="Time distribution charts">
   ${renderWorkspacePie('Recorded focus by workspace',
     report.workspaces.map(w=>({label:(w.name||'Deleted workspace')+(w.archived?' (archived)':''),
      value:w.recordedMs})), 'focus')}
   ${renderWorkspacePie('Planned minutes by workspace',
     report.workspaces.map(w=>({label:(w.name||'Deleted workspace')+(w.archived?' (archived)':''),
      value:w.plannedMinutes})), 'planned')}
  </div>
  <div class="section card"><div class="card-title"><h2>By workspace</h2></div>
   <div class="report-table-scroll"><table class="report-table"><thead><tr>
    <th>Workspace</th><th>Recorded</th><th>Fixed plan</th><th>Legacy estimate</th>
   </tr></thead><tbody>${wsHtml}<tr><th>Account total</th>
    <td>${formatElapsed(report.accountRecordedMs)}</td><td>${minsText(report.accountPlannedMinutes)}</td>
    <td>${formatElapsed(report.accountLegacyEstimatedMs)}</td></tr></tbody></table></div>
  </div>
  ${insightsPanel()}
  <div class="section card"><div class="card-title"><h2>Long-term task progress</h2></div>
   <p class="tiny">Includes current descendants once per long-term task. Nested long-term totals may overlap; never add them together as account totals. Deleted-task time remains in workspace/account history.</p>
   <div class="report-table-scroll"><table class="report-table"><thead><tr>
    <th>Task</th><th>Recorded</th><th>Fixed plan</th></tr></thead>
    <tbody>${taskHtml}</tbody></table></div>
  </div>`;
}
function reportsPage(){if(isCloudTime)return signedInReportsPage();const periods=[['day','Daily'],['week','Weekly'],['month','Monthly']];const series=state.reportPeriod==='day'?[3,4,2,6,5,4,2]:state.reportPeriod==='week'?[4,6,3,7,5,2,1]:[2,5,4,6,5,7,4];const labels=state.reportPeriod==='day'?['8','10','12','14','16','18','20']:state.reportPeriod==='week'?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:['W1','W2','W3','W4','W5','W6','W7'];
 const rows=isCloudTime?
  Object.entries(state.timeRollups?.workspaces||{}).map(([id,ms])=>{
   const w=workspaces.find(x=>serverWorkspaceId(x.id)===id);
   const name=w?escapeHTML(w.name):'Archived workspace ('+escapeHTML(id.slice(0,8))+')';
   const live=state.timeSession?.workspaceIdAtStart===id?activeTimeDeltaMs():0;
   return `<tr><td>${name}</td><td>${formatElapsed(ms+live)}</td></tr>`;
  }).join('')||'<tr><td colspan="2">No recorded sessions yet</td></tr>':
  '<tr><td>General</td><td>3h 45m</td></tr><tr><td>Research</td><td>7h 15m</td></tr><tr><td>Development</td><td>5h 20m</td></tr>';
 const total=isCloudTime?(state.timeLoaded?formatElapsed(accountTimeMs()):'—'):'16h 20m';
 const finished=isCloudTime?String(state.tasks.filter(t=>t.status==='done').length):'12';
 const note=isCloudTime?'All-time saved Neon sessions, including time from deleted tasks. Current active time is included.':'Illustrative account preview';
 return `${titleHead('Your progress','Reports','Activity across every workspace, with individual summaries as well.')}<div class="info-banner">${icon('spark')} ${isCloudTime?'Focused time and workspace totals are live from Neon. Charts and period-specific analysis arrive in M7.':'Preview numbers are illustrative. Real time-series reports arrive in M7.'}</div>${weeklyReportsPanel()}<div class="filters" style="margin-bottom:16px">${periods.map(([v,l])=>`<button class="filter ${state.reportPeriod===v?'active':''}" data-action="report-period" data-value="${v}">${l}</button>`).join('')}</div><div class="report-cards"><div class="card metric"><div class="metric-label">Focused time</div><div class="metric-value" data-current-account-time>${total}</div><div class="metric-note">${isCloudTime?'All-time across all workspaces':'Illustrative focus time'}</div></div><div class="card metric"><div class="metric-label">Tasks finished</div><div class="metric-value">${finished}</div><div class="metric-note">${isCloudTime?'Completed tasks currently visible':'Preview count'}</div></div><div class="card metric"><div class="metric-label">On-time rate</div><div class="metric-value">${isCloudTime?'—':'87%'}</div><div class="metric-note">Detailed metrics arrive in M7</div></div><div class="card metric"><div class="metric-label">Planned / actual</div><div class="metric-value">${isCloudTime?'—':'92%'}</div><div class="metric-note">Detailed metrics arrive in M7</div></div></div><div class="section dash-grid"><div class="card"><div class="card-title"><h2>Recorded activity</h2><span class="pill gray">Hours</span></div>${isCloudTime?'<p class="tiny">Daily, weekly and monthly time-series charts are planned for M7. The totals shown here are all-time.</p>':`<div class="report-chart">${series.map((v,i)=>`<div class="chart-col"><div class="chart-bar" style="height:${Math.round(v/8*100)}%"></div><small>${labels[i]}</small></div>`).join('')}</div>`}</div><div class="card"><div class="card-title"><h2>By workspace</h2><span class="tiny">Time tracked</span></div><table class="report-table"><tbody>${rows}<tr><td><strong>Total</strong></td><td>${total}</td></tr></tbody></table><p class="banner-note">${note} Parent task rollups are not added together when calculating the account total.</p></div></div>`}
function calendarPage(){
 const [from,to]=rangeForCalendar();
 const days=[];for(let d=from;d<=to;d=dayAdd(d,1))days.push(d);
 const title=state.calendarView==='month'
  ?niceDate(state.calendarAnchor,{month:'long',year:'numeric'})
  :state.calendarView==='week'?`${niceDate(from,{month:'short',day:'numeric'})} – ${niceDate(to,{month:'short',day:'numeric'})}`
  :niceDate(from,{weekday:'long',month:'short',day:'numeric',year:'numeric'});
 const header=titleHead('Saved schedule','Calendar','Review your scheduled work by day, week or month.',`<button class="btn secondary" data-action="nav" data-page="plan">${icon('calendar')} Plan your day</button>`);
 const controls=`<div class="calendar-controls">
  <div class="calendar-period-buttons" aria-label="Calendar period">${[['day','Day'],['week','Week'],['month','Month']].map(([kind,label])=>
   `<button type="button" class="filter ${state.calendarView===kind?'active':''}" aria-pressed="${state.calendarView===kind}" data-action="calendar-view" data-value="${kind}">${label}</button>`).join('')}</div>
  <div class="calendar-nav">
   <button type="button" class="btn secondary small" data-action="calendar-prev" aria-label="Previous ${state.calendarView}">${icon('back')}</button>
   <button type="button" class="btn secondary small" data-action="calendar-today">Today</button>
   <button type="button" class="btn secondary small" data-action="calendar-next" aria-label="Next ${state.calendarView}">${icon('arrow')}</button>
   <input class="field calendar-date" type="date" id="calendar-anchor" aria-label="Jump to date" value="${escapeHTML(state.calendarAnchor)}"/>
  </div>
 </div><h2 class="calendar-range-title">${escapeHTML(title)}</h2>`;
 const body=days.map(day=>{
  const items=state.scheduled.filter(slot=>slot.day===day)
   .sort((a,b)=>a.start.localeCompare(b.start));
  const planned=items.reduce((m,slot)=>m+parseClock(slot.end)-parseClock(slot.start),0);
  const out=state.calendarView==='month'&&day.slice(0,7)!==state.calendarAnchor.slice(0,7);
  const overflow=planned>state.capacity*60;
  return `<section class="calendar-day-card ${out?'calendar-outside':''} ${day===today()?'calendar-today':''}" aria-label="${day}">
   <button type="button" class="calendar-day-label" data-action="calendar-open-day" data-day="${day}" aria-label="Open plan for ${day}">
    <span>${niceDate(day,{weekday:'short',day:'numeric'})}</span>
    <small>${items.length} ${items.length===1?'block':'blocks'}</small>
   </button>
   ${items.map(slot=>{
     const task=findTask(slot.taskId);
     return `<button type="button" class="calendar-block" data-action="edit-interval" data-id="${escapeHTML(slot.id)}" aria-label="Edit ${escapeHTML(task?.title||'task')} on ${day}">
      <time>${slot.start}–${slot.end}</time><span>${escapeHTML(task?.title||'Archived task · reserved')}</span>
     </button>`;
   }).join('')}
   ${overflow?`<p class="calendar-over" role="status">${minsText(planned-state.capacity*60)} above your daily capacity</p>`:''}
  </section>`;
 }).join('');
 return header+controls+`${isCloud?`<div class="schedule-status" role="${state.scheduleError?'alert':'status'}" aria-live="polite">${state.scheduleLoading?'Loading saved calendar…':state.scheduleError?`<span>${escapeHTML(state.scheduleError)}</span><button class="btn secondary small" data-action="calendar-retry">Retry</button>`:'Calendar blocks saved in Neon · task times are in their recorded local time zone'}</div>`:''}
 <div class="calendar-grid ${state.calendarView==='day'?'calendar-single':''}">${body}</div>
 <p class="banner-note">${isCloud?'Timed blocks are saved in Neon. Edit a block by selecting it; capacity is a device-local warning, not a hard limit.':'This calendar is a local demo. Real cloud blocks require account login.'}</p>`;
}
function settingsPage(){
 const choices=[['minimal','Minimal','#e8eee9'],['midnight','Midnight','#303f40'],['nature','Nature','#a2bd95'],['pastel','Pastel','#d9c4df'],['editorial','Editorial','#e0c3a7'],['professional','Professional','#abc2db']];
 const accentChoices=[['default','Original','#438b76'],['ocean','Ocean','#437faa'],['lavender','Lavender','#8e74b9'],['rose','Rose','#b77684'],['amber','Amber','#a87b43'],['graphite','Graphite','#5b7280']];
 return `${titleHead('Make it yours','Appearance','Choose your mood. Keep the daily experience simple.')}
 <div class="card"><div class="card-title"><h2>Theme gallery</h2><span class="pill">${escapeHTML(state.theme)}</span></div>
 <div class="theme-grid">${choices.map(([name,label,bg])=>`<button class="theme-choice ${state.theme===name?'selected':''}" data-action="theme" data-id="${name}" aria-pressed="${state.theme===name}"><div class="theme-swatches" style="background:${bg}"><b></b><b style="height:37px"></b><b style="height:19px"></b></div><strong>${label}</strong></button>`).join('')}</div></div>
 <div class="card section"><div class="card-title"><h2>Accent colors</h2><span class="tiny">Optional · independent of theme</span></div><div class="accent-palette">${accentChoices.map(([id,label,color])=>`<button class="accent-option ${state.accent===id?'selected':''}" data-action="accent" data-id="${id}" aria-label="Accent ${label}" aria-pressed="${state.accent===id}" title="${label}"><span style="background:${color}">${state.accent===id?icon('check'):''}</span><small>${label}</small></button>`).join('')}</div></div>
 <div class="card section"><div class="card-title"><h2>Display preferences</h2></div><div class="field-wrap"><label class="form-label" for="density-select">Information density</label><select class="field" id="density-select"><option value="comfortable" ${state.density==='comfortable'?'selected':''}>Comfortable · more breathing room</option><option value="compact" ${state.density==='compact'?'selected':''}>Compact · more information</option></select></div><div class="field-wrap"><label class="form-label" for="cover-style-select">Cover presentation</label><select class="field" id="cover-style-select"><option value="standard" ${state.coverStyle==='standard'?'selected':''}>Standard · balanced</option><option value="immersive" ${state.coverStyle==='immersive'?'selected':''}>Immersive · larger imagery</option><option value="minimal" ${state.coverStyle==='minimal'?'selected':''}>Minimal · subtle header</option></select></div><p class="banner-note">Cover and avatar controls are available inside each task or workspace. Images stay on this device in the prototype; Neon uploads are a later milestone.</p></div>
 <div class="section card"><div class="card-title"><h2>Design demo</h2></div><p class="subtitle" style="margin:0 0 14px">${isCloud?'Workspaces, tasks, daily plans, reminders and new time sessions are saved in Neon. Older device-only timer records, quick notes, capacity and workspace photos remain local and are not imported automatically.':'This preview uses local sample data and has no account sync.'}</p><button class="btn secondary" data-action="reset">${icon('refresh')} Reset local previews</button></div>`
}
function taskDetail(){
 const t=findTask(state.taskId);if(!t){state.page='tasks';return tasksPage()}
 const children=state.tasks.filter(x=>x.parent===t.id);
 const parent=t.parent?findTask(t.parent):null;
 const audit=state.taskEvents.map(event=>`<div class="session-item"><div><strong>${escapeHTML(event.type.replaceAll('_',' '))}</strong><small>${new Date(event.createdAt).toLocaleString()}</small></div><span class="pill gray">Saved</span></div>`).join('');
 const auditHistory=isCloud?`<div class="section-head" style="margin-top:22px"><h3>Task changes in Neon</h3></div>${state.taskEventsBusy?'<p class="subtitle">Loading saved activity…</p>':audit||'<p class="tiny">No saved changes shown yet.</p>'}`:'';

 const sessions=state.sessions.filter(x=>x.taskId===t.id).slice().sort((a,b)=>b.endedAt-a.endedAt);
 const active=state.timer?.taskId===t.id;
 const ownTime=taskTimeMs(t),totalTime=taskTimeWithSubtasksMs(t);
 const history=sessions.length?`<div class="session-history">${sessions.map(entry=>`<div class="session-item"><div><strong>${new Date(entry.startedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</strong><small>${new Date(entry.startedAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}–${new Date(entry.endedAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})} · ${escapeHTML(entry.reason)}</small></div><time>${formatElapsed(entry.durationMs)}</time></div>`).join('')}</div>`:'<p class="subtitle">No completed time sessions for this task yet.</p>';
 return `<div style="margin-bottom:15px"><button class="btn ghost small" data-action="nav" data-page="tasks">${icon('back')} All tasks</button></div>${coverFrame('task',t.id,workspace(t.workspace).cover,t.long?'target':'list')}<div class="detail-options media-toolbar">${photoButton('task',t.id,'cover','Edit cover')}${photoButton('task',t.id,'avatar','Edit avatar')}</div>${titleHead(escapeHTML(workspace(t.workspace).name)+(t.long?' · Long-term task':' · Task'),escapeHTML(t.title),t.deadline?`Hard deadline: ${niceDate(t.deadline,{dateStyle:'medium'})}`:'No hard deadline',`<button class="btn secondary" data-action="modal-edit" data-id="${t.id}">${icon('edit')} Edit</button>${timeControls(t,true)}`)}<div class="metrics" style="margin-bottom:20px"><div class="card metric"><div class="metric-label">Estimated own work</div><div class="metric-value">${minsText(t.estimate)}</div><div class="metric-note">Estimates are independent for each task</div></div>
<div class="card metric"><div class="metric-label">Own remaining</div><div class="metric-value" data-own-remaining>${isCloudTime&&!state.timeLoaded?'—':formatElapsed(taskRemainingMs(t))}</div></div>
<div class="card metric"><div class="metric-label">Remaining incl. subtasks</div><div class="metric-value" data-subtree-remaining>${isCloudTime&&!state.timeLoaded?'—':formatElapsed(subtreeRemainingMs(t))}</div><div class="metric-note">Only unfinished tasks count; each subtask once</div></div><div class="card metric"><div class="metric-label">Recorded time</div><div class="metric-value" data-current-task-time>${isCloudTime&&!state.timeLoaded?'—':formatElapsed(totalTime)}</div><div class="metric-note" data-task-time-breakdown>Own ${formatElapsed(ownTime)} · Subtasks ${formatElapsed(Math.max(0,totalTime-ownTime))}</div></div><div class="card metric"><div class="metric-label">Subtasks</div><div class="metric-value">${state.tasks.filter(child=>child.id!==t.id&&isDescendantOf(child.id,t.id)).length}</div><div class="metric-note">All visible nested levels · ${children.length} direct</div></div></div><div class="card"><div class="tab-line"><button class="${state.taskTab==='overview'?'selected':''}" data-action="task-tab" data-value="overview">Overview</button><button class="${state.taskTab==='notes'?'selected':''}" data-action="task-tab" data-value="notes">Notes</button><button class="${state.taskTab==='history'?'selected':''}" data-action="task-tab" data-value="history">Activity${isCloudTime?'':` (${sessions.length})`}</button></div>${state.taskTab==='overview'?`<div class="actions"><span class="pill">${t.status==='done'?'Completed':'Open'}</span>${t.reminder?`<span class="pill gray">${icon('bell')} Reminder ${niceDate(t.reminder)} ${t.reminderTime||''}</span>`:''}</div><p style="margin:18px 0 20px">${escapeHTML(t.notes||'No description has been added yet.')}</p><h3>Subtasks</h3><div style="margin-top:15px">${children.length?children.map(c=>taskRow(c)).join(''):'<p class="tiny">No subtasks yet.</p>'}</div>`:state.taskTab==='notes'?`<h3>Quick task note</h3><p style="margin:8px 0 18px">${escapeHTML(t.notes||'No notes yet.')}</p><div class="info-banner">${icon('file')} ${isCloud?'<button type="button" class="btn small secondary" data-action="documents-task" data-id="'+escapeHTML(t.id)+'">Add or open documents</button> <span class="tiny">Documents are linked to this task and autosave while you write.</span>':'Sign in to create private task documents.'}</div>`:`<h3>Recorded sessions</h3><p class="subtitle">${isCloudTime?'Time is stored in Neon across signed-in devices. Recorded time above includes all nested subtasks, with each session counted once. A session-by-session timeline is scheduled for a later milestone.':'Preview sessions are local to this device. Pauses do not count.'}</p>${isCloudTime?`<p class="tiny">Own time: ${formatElapsed(ownTime)} · Subtasks: ${formatElapsed(Math.max(0,totalTime-ownTime))}</p>`:history}${auditHistory}`}</div><div class="detail-options">${t.status!=='open'?`<button class="btn small secondary" data-action="reopen-task" data-id="${t.id}">${icon('refresh')} Reopen</button>`:`
 <button class="btn small" data-action="finish-task" data-id="${t.id}">${icon('check')} Finish</button>
 <button class="btn small secondary" data-action="cancel-task" data-id="${t.id}">Cancel task</button>
 <button class="btn small secondary" data-action="add-subtask" data-id="${t.id}">${icon('plus')} Subtask</button>`}
 ${isCloud?`<button class="btn small secondary" data-action="modal-move-task" data-id="${escapeHTML(t.id)}">${icon('folder')} Move</button>
 <button class="btn small secondary" data-action="modal-archive-task" data-id="${escapeHTML(t.id)}">${icon('folder')} Archive</button>`:''}
 <button class="btn small secondary" data-action="modal-delete-task" data-id="${t.id}">${icon('trash')} Delete</button></div></div>`;
}
function renderModal(){if(!state.modal)return '';let body='',title='';const t=state.modalTask&&findTask(state.modalTask);if(['task','edit'].includes(state.modal)){title=t?'Edit task':'Add a task';const w=(t?.workspace)||(workspaces.some(x=>x.id===state.modalTask)?state.modalTask:'general');body=`<form id="task-form"><div class="field-wrap"><label class="form-label" for="title">Task title *</label><input class="field" id="title" name="title" required autofocus maxlength="160" value="${escapeHTML(t?.title||'')}" placeholder="What needs to get done?" /></div><div class="form-grid"><div class="field-wrap"><label class="form-label" for="workspace">Workspace</label><select class="field" id="workspace" name="workspace" ${t?'disabled':''}>${workspaces.map(x=>`<option value="${x.id}" ${w===x.id?'selected':''}>${escapeHTML(x.name)}</option>`).join('')}</select>${t?`<input type="hidden" name="workspace" value="${escapeHTML(w)}"><small class="form-hint">Use Move on task details to move task and subtasks.</small>`:''}</div><div class="field-wrap"><label class="form-label" for="estimate">Estimated minutes</label><input class="field" type="number" min="1" max="100000" id="estimate" name="estimate" value="${t?.estimate||30}" required /></div></div>
 <div class="form-grid"><div class="field-wrap"><label class="form-label" for="task-priority">Priority</label><select class="field" id="task-priority" name="priority">
 ${[['high','High'],['medium','Medium'],['low','Low']].map(([value,label])=>`<option value="${value}" ${(t?.priority||'medium')===value?'selected':''}>${label}</option>`).join('')}
 </select></div><div class="field-wrap"><label class="form-label" for="task-parent">Parent task</label><select class="field" id="task-parent" name="parent">
 <option value="">No parent</option>${state.tasks.filter(x=>x.workspace===w&&x.id!==t?.id&&x.status==='open').map(x=>`<option value="${escapeHTML(x.id)}" ${(t?.parent||state.subtaskParent)===x.id?'selected':''}>${escapeHTML(x.title)}</option>`).join('')}
 </select></div></div><div class="form-grid"><div class="field-wrap"><label class="form-label" for="deadline">Hard deadline</label><input class="field" type="date" name="deadline" id="deadline" value="${t?.deadline||''}"/><input class="field" type="time" style="margin-top:7px" name="deadlineTime" aria-label="Hard deadline time" value="${t?.deadlineTime||''}"/><p class="form-hint">A real completion requirement.</p></div><div class="field-wrap"><label class="form-label" for="reminder">Soft reminder</label><input class="field" type="date" name="reminder" id="reminder" value="${t?.reminder||''}"/><input class="field" type="time" style="margin-top:7px" name="reminderTime" aria-label="Soft reminder time" value="${t?.reminderTime||''}"/><p class="form-hint">Independent from the deadline.</p></div></div><div class="field-wrap"><label class="form-label" for="notes">Task note</label><textarea class="field" id="notes" name="notes" placeholder="Optional details">${escapeHTML(t?.notes||'')}</textarea></div><div class="field-wrap"><label class="form-label" for="task-tags">Tags (comma-separated, up to 8)</label><input class="field" id="task-tags" name="tags" maxlength="260" placeholder="Research, urgent" value="${escapeHTML((t?.tags||[]).join(', '))}" /></div>
 <div class="form-grid"><label class="task-check-label"><input type="checkbox" name="long" ${t?.long?'checked':''}/> Long-term task</label>
 <label class="task-check-label"><input type="checkbox" name="pinned" ${t?.pinned?'checked':''}/> Pin task</label></div><div class="modal-footer"><button type="button" class="btn secondary" data-action="close">Cancel</button><button type="submit" class="btn">${t?'Save changes':'Create task'}</button></div></form>`}
else if(state.modal==='archive-workspace'){
 const w=workspaces.find(item=>item.id===state.modalTask);
 title='Archive workspace?';
 const taskCount=w?state.tasks.filter(task=>task.workspace===w.id).length:0;
 const hasTimer=w&&state.timer&&state.tasks.some(task=>task.id===state.timer.taskId&&task.workspace===w.id);
 body='<p class="subtitle">Archive <strong>'+escapeHTML(w?.name||'this workspace')+'</strong> and hide its '+
  taskCount+' tasks from active views? Nothing is deleted. Restoring the workspace also restores its tasks.</p>'+
  (hasTimer?'<p class="form-hint">The running timer for this workspace will be stopped and saved locally.</p>':'')+
  '<div class="modal-footer"><button type="button" class="btn secondary" data-action="close">Cancel</button>'+
  '<button type="button" class="btn" data-action="confirm-archive-workspace">Archive workspace</button></div>';
}
else if(state.modal==='workspace-create'||state.modal==='workspace-edit'){
 const w=state.modal==='workspace-edit'?workspace(state.modalTask):null;
 title=w?'Edit workspace':'Create workspace';
 body=`<form id="workspace-form">
 <div class="field-wrap"><label class="form-label" for="wname">Workspace name *</label>
 <input class="field" id="wname" name="name" required maxlength="120" value="${escapeHTML(w?.name||'')}" placeholder="e.g. Research" /></div>
 <div class="field-wrap"><label class="form-label" for="wsubtitle">Description</label>
 <input class="field" id="wsubtitle" name="subtitle" maxlength="180" value="${escapeHTML(w?.subtitle||'')}" placeholder="A few words about this space" /></div>
 <div class="form-grid">
 <div class="field-wrap"><label class="form-label" for="wcolor">Accent color</label><input class="field" id="wcolor" type="color" name="color" value="${w?.color||'#85a99d'}" /></div>
 <div class="field-wrap"><label class="form-label" for="wcover">Cover style</label><select class="field" name="cover" id="wcover">
 ${['general','research','dev','custom'].map(v=>`<option value="${v}" ${(w?.cover||'general')===v?'selected':''}>${v==='dev'?'Development':v==='general'?'Simple':v==='research'?'Research':'Custom'}</option>`).join('')}
 </select></div></div>
 <div class="modal-footer"><button type="button" class="btn secondary" data-action="close">Cancel</button>
 <button type="submit" class="btn">${w?'Save workspace':'Create workspace'}</button></div></form>`;
}
else if(state.modal==='quiet-hours'){
 title='Quiet hours';
 body=`<form id="quiet-hours-form">
  <p class="subtitle">Delay browser push for task deadlines, task reminders and note reminders during these hours. The in-app inbox still shows the original due time.</p>
  <p class="tiny">Hours follow your account's notification time zone. Both fields empty disables quiet hours. Overnight times are supported.</p>
  <div class="form-grid">
    <div class="field-wrap"><label class="form-label" for="quiet-start">From</label>
      <input class="field" type="time" name="quietStart" id="quiet-start" value="${escapeHTML(state.quietStart||'')}" ${state.quietLoading?'disabled':''}/></div>
    <div class="field-wrap"><label class="form-label" for="quiet-end">Until</label>
      <input class="field" type="time" name="quietEnd" id="quiet-end" value="${escapeHTML(state.quietEnd||'')}" ${state.quietLoading?'disabled':''}/></div>
  </div>
  ${state.quietLoading?'<p class="tiny" role="status">Loading preferences…</p>':''}
  ${state.quietError?`<p class="tiny" role="alert">${escapeHTML(state.quietError)}</p>`:''}
  <div class="modal-footer">
    <button type="button" class="btn secondary" data-action="close">Cancel</button>
    <button type="submit" class="btn" ${state.quietBusy||state.quietLoading?'disabled':''}>Save quiet hours</button>
  </div>
 </form>`;
}
else if(state.modal==='note'||state.modal==='note-edit'){
 const n=state.modal==='note-edit'?state.notes.find(x=>x.id===state.modalTask):null;
 const selected=n?.workspace||(workspaces.some(w=>w.id===state.modalTask)?state.modalTask:'general');
 title=n?'Edit quick note':'Capture a quick note';
 body=`<form id="note-form" data-note-context="${escapeHTML(state.modal)}:${escapeHTML(state.modalTask||'')}">
  <div class="field-wrap"><label class="form-label" for="ntitle">Title (optional)</label>
   <input class="field" name="title" id="ntitle" maxlength="120"
    value="${escapeHTML(n?.title||'')}" placeholder="First sentence becomes the title" autofocus/></div>
  <div class="field-wrap"><label class="form-label" for="ncontent">Your note</label>
   <textarea class="field" id="ncontent" name="content" maxlength="8000" rows="6"
    placeholder="A quick thought, idea or reminder…">${escapeHTML(n?.content||'')}</textarea></div>
  <div class="form-grid">
   <div class="field-wrap"><label class="form-label" for="nworkspace">Workspace</label>
    <select class="field" name="workspace" id="nworkspace">
     ${workspaces.map(w=>`<option value="${escapeHTML(w.id)}"
       ${selected===w.id?'selected':''}>${escapeHTML(w.name)}</option>`).join('')}
    </select></div>
   <div class="field-wrap"><label class="form-label" for="ncolor">Color</label>
    <select class="field" name="color" id="ncolor">
     ${[['cream','Cream'],['lilac','Lilac'],['green','Green'],['blue','Blue']]
       .map(([value,label])=>`<option value="${value}"
         ${(n?.color||'cream')===value?'selected':''}>${label}</option>`).join('')}
    </select></div>
  </div>
  <div class="field-wrap"><label><input type="checkbox" name="pinned" ${n?.pinned?'checked':''}/>
   Pin this note</label></div>
  <div class="form-grid">
   <div class="field-wrap"><label class="form-label" for="nreminder">Reminder date (optional)</label>
    <input class="field" type="date" id="nreminder" name="reminder"
     value="${escapeHTML(n?.reminder||'')}"/></div>
   <div class="field-wrap"><label class="form-label" for="nremindertime">Reminder time (optional)</label>
    <input class="field" type="time" id="nremindertime" name="reminderTime"
     value="${escapeHTML(n?.reminderTime||'')}"/></div>
  </div>
  <small class="form-hint">${isCloud?'Your note reminder will appear in the account inbox when due. Browser push is optional and requires permission.':'Local demo notes do not send notifications.'}</small>
  ${state.noteError?`<p class="tiny" role="alert">${escapeHTML(state.noteError)}</p>`:''}
  <p class="tiny df-note-autosave-status" id="note-autosave-status" role="status" aria-live="polite">
   ${escapeHTML(noteAutoStatusMessage)}
  </p>
  <div class="modal-footer"><button type="button" class="btn secondary" data-action="close">Close</button>
   <button type="submit" class="btn" ${state.noteBusy?'disabled':''}>Save now</button></div>
 </form>`;
}
else if(state.modal==='note-convert'){
 const n=state.notes.find(x=>x.id===state.modalTask);
 title='Convert note to task';
 body=n?`<form id="note-convert-form">
  <p>Convert “<strong>${escapeHTML(n.title)}</strong>” to an ordinary task
   in ${escapeHTML(workspace(n.workspace).name)}. The note is kept.</p>
  <div class="field-wrap"><label class="form-label" for="converted-estimate">Estimated minutes</label>
   <input class="field" type="number" id="converted-estimate" name="estimate"
    value="30" min="1" max="100000" required/></div>
  ${state.noteError?`<p class="tiny" role="alert">${escapeHTML(state.noteError)}</p>`:''}
  <div class="modal-footer"><button class="btn secondary" type="button" data-action="close">Cancel</button>
   <button class="btn" type="submit" ${state.noteBusy?'disabled':''}>Create task</button></div>
 </form>`:'<p>Note no longer available.</p>';
}
else if(state.modal==='create'){title='What would you like to add?';body=`<div style="display:grid;gap:10px"><button class="btn secondary" style="justify-content:flex-start" data-action="modal-task">${icon('list')} Task or long-term task</button><button class="btn secondary" style="justify-content:flex-start" data-action="modal-note">${icon('note')} Quick note</button><button class="btn secondary" style="justify-content:flex-start" data-action="nav" data-page="plan">${icon('calendar')} Plan the day</button></div>`}
else if(state.modal==='plan-add'){title='Choose a task for your day';const ids=new Set([...poolForDay(state.planDay),...(isCloud?[]:state.scheduled.filter(x=>x.day===state.planDay).map(x=>x.taskId))]);body=`<div style="display:grid;gap:9px;max-height:50vh;overflow:auto">${openTasks().filter(t=>!ids.has(t.id)).map(t=>`<button class="btn secondary" style="justify-content:space-between;text-align:left;white-space:normal" data-action="pool-add" data-id="${t.id}"><span>${escapeHTML(t.title)}<br><small style="opacity:.6">${escapeHTML(workspace(t.workspace).name)} · ${minsText(t.estimate)}</small></span>${icon('plus')}</button>`).join('')||'<p class="tiny">Every open task is already selected. Create a new task to add more.</p>'}</div>`}
else if(state.modal==='schedule'){
 const current=state.scheduleEditId?state.scheduled.find(slot=>slot.id===state.scheduleEditId):null;
 const eligible=openTasks().filter(task=>!current||task.id===current.taskId||task.status==='open');
 const localZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 const zone=current?.timeZone||localZone;
 const day=current?.day||state.planDay;
 title=current?'Edit timed interval':'Schedule a time interval';
 body=`<form id="schedule-form">
 <div class="field-wrap"><label class="form-label" for="schedule-task">Task</label>
 <select class="field" name="task" id="schedule-task" required>
 ${eligible.map(task=>`<option value="${escapeHTML(task.id)}" ${(current?.taskId||state.modalTask)===task.id?'selected':''}>${escapeHTML(task.title)} · ${escapeHTML(workspace(task.workspace).name)}</option>`).join('')}
 </select></div>
 <div class="field-wrap"><label class="form-label" for="schedule-day">Planning date</label>
 <input class="field" name="day" id="schedule-day" type="date" min="2000-01-01" max="2100-12-31" value="${day}" required/></div>
 <div class="form-grid">
 <div class="field-wrap"><label class="form-label" for="start">Start</label>
 <input class="field" name="start" id="start" type="time" value="${current?.start||'09:00'}" required/></div>
 <div class="field-wrap"><label class="form-label" for="end">End</label>
 <input class="field" name="end" id="end" type="time" value="${current?.end||'10:00'}" required/></div>
 </div>
 <input type="hidden" name="timeZone" value="${escapeHTML(zone)}"/>
 <p class="form-hint">Time zone: ${escapeHTML(zone)}. A task may have multiple intervals on different dates. Intervals cannot overlap or cross midnight; split overnight work into two days. Scheduling never changes task deadlines or reminders.</p>
 <div class="schedule-form-error" role="alert" aria-live="polite">${state.scheduleError?escapeHTML(state.scheduleError):''}</div>
 <div class="modal-footer"><button type="button" class="btn secondary" data-action="close">Cancel</button>
 <button class="btn" type="submit" ${state.scheduleBusy?'disabled':''}>${current?'Save interval':'Schedule interval'}</button></div>
 </form>`;
}
else if(state.modal==='media'){
 const m=state.mediaTarget||{kind:'task',id:'',slot:'cover'};
 const label=m.kind==='workspace'?workspace(m.id).name:findTask(m.id)?.title||'Task';
 const current=photoFor(m.kind,m.id,m.slot);
 title=`${m.slot==='cover'?'Cover':'Profile'} image · ${label}`;
 body=`<div class="media-modal"><div class="media-preview ${m.slot==='avatar'?'avatar-preview':''} ${current?'has-photo':''}"${photoStyle(m.kind,m.id,m.slot)}>${current?'':icon('image')}</div><p class="form-hint">JPEG, PNG or WebP · up to 5 MB. ${isCloud&&m.kind==='task'?'Task images are resized and saved privately in Neon (180 KB limit).':'Images are resized and saved on this device only.'}</p><label class="btn media-file-label" for="media-file">${icon('upload')} Choose an image</label><input id="media-file" type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden" aria-label="Upload ${m.slot} image" />${m.slot==='cover'?`<div class="field-wrap"><label class="form-label" for="media-position">Vertical photo position</label><input class="media-position" type="range" id="media-position" min="0" max="100" value="${Number(state.mediaPos[mediaKey(m.kind,m.id,m.slot)]??50)}" /></div>`:''}<div class="modal-footer">${current?`<button class="btn danger" data-action="remove-image">Remove image</button>`:''}<button class="btn secondary" data-action="close">Close</button></div></div>`;
}
else if(state.modal==='delete-task'){title='Move task to Trash?';body=`<p class="subtitle">Move <strong>${escapeHTML(t?.title||'the task')}</strong> to recoverable Trash? This removes it from your active task lists and local day plan, not permanently from your account.</p><div class="modal-footer"><button class="btn secondary" data-action="close">Keep task</button><button class="btn danger" data-action="confirm-delete-task">Confirm removal</button></div>`}
else if(state.modal==='archive-task-confirm'){
 title='Archive task?';
 const task=findTask(state.modalTask);
 const children=state.tasks.filter(x=>x.parent===task?.id);
 body=`<p class="subtitle">Archive <strong>${escapeHTML(task?.title||'this task')}</strong>${children.length?' and its subtasks':''}? The tasks remain in your account and can be restored from Task Archive.</p>
 <div class="modal-footer"><button type="button" class="btn secondary" data-action="close">Cancel</button><button type="button" class="btn" data-action="confirm-archive-task">Archive task</button></div>`;
}
else if(state.modal==='move-task'){
 const task=findTask(state.modalTask);
 title='Move task and subtasks';
 body=`<form id="move-task-form"><p class="subtitle">Move <strong>${escapeHTML(task?.title||'task')}</strong> and its nested subtasks together. This preserves saved history.</p>
 <div class="field-wrap"><label class="form-label" for="move-workspace">Destination workspace</label>
 <select class="field" id="move-workspace" name="workspace">${workspaces.map(w=>`<option value="${escapeHTML(w.id)}" ${task?.workspace===w.id?'selected':''}>${escapeHTML(w.name)}</option>`).join('')}</select></div>
 <div class="field-wrap"><label class="form-label" for="move-parent">New parent (optional)</label>
 <select class="field" id="move-parent" name="parent"><option value="">Top-level task</option></select>
 <p class="form-hint">Only tasks in the destination workspace can be parents. Invalid or circular moves are blocked by Neon.</p></div>
 <div class="modal-footer"><button type="button" class="btn secondary" data-action="close">Cancel</button>
 <button type="submit" class="btn">Move task</button></div></form>`;
}
else if(state.modal==='permanent-task'){
 const row=state.trashed.find(x=>x.id===state.modalTask);
 title='Permanently delete task?';
 body=`<form id="permanent-task-form"><p class="subtitle">Permanently delete <strong>${escapeHTML(row?.title||'this task')}</strong>? This cannot be undone. Nested tasks must be removed first. The audit record may remain.</p>
 <div class="field-wrap"><label for="permanent-confirm" class="form-label">Type DELETE to confirm</label><input id="permanent-confirm" class="field" name="confirm" autocomplete="off" placeholder="DELETE" required /></div>
 <div class="modal-footer"><button type="button" class="btn secondary" data-action="close">Keep task</button>
 <button type="submit" class="btn danger">Permanently delete</button></div></form>`;
}
else if(state.modal==='delete-note'){title='Delete this note?';body=`<p class="subtitle">${isCloud?'The note will be removed from your account list (recoverable later).':'The selected note will be removed from this browser\'s demo data.'} This action requires confirmation.</p>${state.noteError?`<p role="alert" class="tiny">${escapeHTML(state.noteError)}</p>`:''}<div class="modal-footer"><button class="btn secondary" data-action="close">Cancel</button><button class="btn danger" data-action="confirm-delete-note">Delete note</button></div>`}
else if(state.modal==='reset'){title='Reset the design preview?';body=`<p class="subtitle">${isCloud?'This clears browser-local preferences, workspace photos and older device-only timer history. It does NOT delete your saved Neon tasks, schedules, reminders or time sessions.':'This clears local demo changes and restores sample data. No online data is involved.'}</p><div class="modal-footer"><button class="btn secondary" data-action="close">Cancel</button><button class="btn danger" data-action="confirm-reset">Reset sample data</button></div>`}
return `<div class="modal-backdrop" data-backdrop="true"><section class="modal ${['note','note-edit'].includes(state.modal)?'modal-note-editor':''}" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}"><div class="modal-head"><h2>${escapeHTML(title)}</h2><button class="icon-btn" data-action="close" aria-label="Close dialog">${icon('close')}</button></div>${body}</section></div>`}
function parseClock(s){const [h,m]=s.split(':').map(Number);return h*60+m}
function profilePage(){
 const subtitle=isCloud?'Your Dayframe account':'This is a local, unsynchronized preview.';
 return `${titleHead('My account','Profile','Account details and session controls in one place.')}
 <section class="card profile-panel" aria-label="Profile and account">
  <div class="profile-identity"><div class="profile-avatar profile-avatar-large" aria-hidden="true">${escapeHTML(accountInitials)}</div>
  <div><div class="eyebrow">${isCloud?'Signed in':'Local preview'}</div><h2>${escapeHTML(accountName)}</h2>
  ${accountEmail?`<p class="profile-email">${escapeHTML(accountEmail)}</p>`:''}</div></div>
  <div class="profile-data-note"><strong>${subtitle}</strong><p>${isCloud?'Workspaces, tasks, daily plans, timed blocks, reminders and new time sessions are saved in Neon across signed-in devices. Capacity, workspace photos and older device-only timer history remain local. Optional browser push has been tested in one browser; other devices still need verification.':'Changes in this preview stay in this browser and are not attached to an account.'}</p></div>
  <div class="profile-actions">
  ${isCloud&&typeof account.onRefresh==='function'?`<button type="button" class="btn secondary" data-action="account-refresh">${icon('refresh')} Refresh saved data</button>`:''}
  <button type="button" class="btn secondary" data-action="account-sign-out">${icon('back')} ${isCloud?'Sign out':'Return to sign in'}</button>
  </div>
 </section>`;
}
let documentPageCleanup=null;
let documentPageMounted=false;
let documentPageSerial=0;
let documentPageDirty=false;
let noteFormDirty=false;
let noteAutoController=null;
let noteAutoStatusKind='saved';
let noteAutoStatusMessage='Changes save automatically while you write.';
function noteFormFields(form){
 const d=new FormData(form);
 return {
  workspace:serverWorkspaceId(String(d.get('workspace')||'general')),
  title:String(d.get('title')||''),
  content:String(d.get('content')||''),
  color:String(d.get('color')||'cream'),
  pinned:d.has('pinned'),
  reminder:String(d.get('reminder')||'')||null,
  reminderTime:String(d.get('reminderTime')||'')||null
 };
}
function updateNoteStatus(kind,message){
 noteAutoStatusKind=kind;noteAutoStatusMessage=message;
 if(kind==='saved')noteFormDirty=false;
 const node=document.querySelector('#note-autosave-status');
 if(node){node.textContent=message;node.dataset.sync=kind;}
}
function beginNoteAutosave(){
 if(!isCloud||!['note','note-edit'].includes(state.modal))return;
 noteAutoController?.dispose();noteAutoController=null;
 const form=document.querySelector('#note-form');
 if(!form)return;
 const original=state.modal==='note-edit'?state.notes.find(n=>n.id===state.modalTask):null;
 noteAutoStatusKind='saved';noteAutoStatusMessage='Changes save automatically while you write.';
 const controller=createQuickNoteAutosaver({
  scope:storageKey,id:original?.id||null,revision:original?.revision||0,
  initial:noteFormFields(form),
  api:{
   create:(id,body)=>cloudApi.createQuickNote({...body,id}),
   update:(id,revision,body)=>cloudApi.updateQuickNote(id,{...body,revision}),
   list:()=>cloudApi.listQuickNotes()
  },
  onSaved(note){
   if(disposed)return;
   upsertQuickNote(note);
   if(state.modal==='note'&&noteAutoController===controller){
    state.modal='note-edit';state.modalTask=note.id;
    const current=document.querySelector('#note-form');
    if(current)current.dataset.noteContext='note-edit:'+note.id;
   }
  },
  onStatus(info){
   if(disposed)return;
   state.noteBusy=info.kind==='saving';
   updateNoteStatus(info.kind,info.message);
  }
 });
 noteAutoController=controller;
 if(controller.recovered){
  const restored=controller.initialFields;
  for(const [name,value] of Object.entries(restored)){
   const input=form.elements.namedItem(name);
   if(!input)continue;
   if(input instanceof HTMLInputElement&&input.type==='checkbox')
    input.checked=Boolean(value);
   else if(input instanceof HTMLInputElement||input instanceof HTMLTextAreaElement||
    input instanceof HTMLSelectElement)
    input.value=name==='workspace'?localWorkspaceId(String(value)):String(value??'');
  }
  noteFormDirty=true;
  controller.resume();
 }
}
function render(){
 // Legacy background refreshes must not erase an in-progress Quick Note.
 // Snapshot input values, focus and caret before layout() replaces its HTML.
 const noteContext=String(state.modal||'')+':'+String(state.modalTask||'');
 const oldForm=document.querySelector('#note-form');
 const savedNoteFields=oldForm?.dataset.noteContext===noteContext ?
  Array.from(oldForm.elements).filter(el=>
   el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||
   el instanceof HTMLSelectElement).map(el=>({
    name:el.name,value:el.value,
    checked:el instanceof HTMLInputElement?el.checked:null,
    focused:document.activeElement===el,
    start:el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement?
     (()=>{try{return el.selectionStart}catch{return null}})():null,
    end:el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement?
     (()=>{try{return el.selectionEnd}catch{return null}})():null
   })) : null;
 // Preserve the editor root on unrelated legacy render calls.
 if(state.page==='documents'&&documentPageMounted)return;
 if(documentPageCleanup){
  documentPageCleanup();documentPageCleanup=null;
  documentPageMounted=false;documentPageDirty=false;
  window.dispatchEvent(new CustomEvent('dayframe:draft-state',{detail:{dirty:false}}));
 }
 const currentDocumentSerial=++documentPageSerial;
 const view=state.page==='task-archive'?archivedTasksPage():state.page==='workspace-archive'?archivedWorkspacesPage():state.page==='profile'?profilePage():state.page==='home'?home():state.page==='tasks'?tasksPage():state.page==='trash'?trashPage():state.page==='plan'?plan():state.page==='workspaces'?workspacesPage():state.page==='workspace'?workspacePage():state.page==='notes'?notesPage():state.page==='documents'?
  (isCloud?'<div id="dayframe-document-root" role="region" aria-label="Private documents"><p role="status">Opening document library…</p></div>':
  '<div class="card"><h2>Documents require sign-in</h2><p>Private documents are not saved in the local preview.</p></div>'):
  state.page==='reports'?reportsPage():state.page==='calendar'?calendarPage():state.page==='detail'?taskDetail():settingsPage();
 const timeWarning=isCloudTime&&state.timeError?
  `<div class="info-banner" role="alert">Server timer unavailable: ${escapeHTML(state.timeError)} <button type="button" class="btn small secondary" data-action="time-retry">Retry timer</button></div>`
  :isCloudTime&&!state.timeLoaded?'<div class="info-banner" role="status">Restoring your saved timer from Neon…</div>':'';
 layout(timeWarning+view);
 if(savedNoteFields){
  const currentForm=document.querySelector('#note-form');
  if(currentForm?.dataset.noteContext===noteContext){
   for(const saved of savedNoteFields){
    const current=Array.from(currentForm.elements).find(el=>el.name===saved.name);
    if(!current)continue;
    current.value=saved.value;
    if(saved.checked!==null&&current instanceof HTMLInputElement)
     current.checked=saved.checked;
    if(saved.focused){
     current.focus({preventScroll:true});
     if(saved.start!==null&&saved.end!==null&&
      (current instanceof HTMLInputElement||current instanceof HTMLTextAreaElement)){
      try{current.setSelectionRange(saved.start,saved.end)}catch{/* non-text inputs */}
     }
    }
   }
  }
 }
 if(isCloud&&state.page==='documents'){
  const root=$('#dayframe-document-root');
  void import('../components/DocumentPage').then(({mountDayframeDocuments})=>{
   if(disposed||state.page!=='documents'||currentDocumentSerial!==documentPageSerial||!root)return;
   documentPageCleanup=mountDayframeDocuments(root,{
    workspaces:workspaces.map(w=>({id:serverWorkspaceId(w.id),name:w.name})),
    initialWorkspaceId:state.documentWorkspaceId,
    initialTaskId:state.documentTaskId,
    initialTaskName:findTask(state.documentTaskId)?.title||null,
    draftScope:storageKey
   },dirty=>{
    documentPageDirty=dirty;
    window.dispatchEvent(new CustomEvent('dayframe:draft-state',{detail:{dirty}}));
   });
   documentPageMounted=true;
  }).catch(error=>{
   if(disposed||currentDocumentSerial!==documentPageSerial||!root)return;
   root.textContent='The document editor is unavailable. Check editor dependencies and refresh.';
   console.error('Document editor initialization failed',error instanceof Error?error.name:'Unknown');
  });
 }
}
function navigate(page){
 if(state.page==='documents'&&page!=='documents'&&documentPageDirty&&
   !window.confirm('Discard unsaved document edits?'))return;
 state.modal=null;state.page=page;state.search='';
 window.scrollTo({top:0,behavior:'instant'});render();
 if(isCloud&&page==='home')void loadCloudAlerts();
 if(isCloud&&['notes','workspace'].includes(page))void loadCloudNotes();
 if(isCloudTime&&page==='workspace')void loadCloudWeek();
 if(isCloudTime&&page==='reports')void loadCloudPeriod();
 if(isCloud&&page==='plan')void loadCloudSchedule(state.planDay,state.planDay);
 if(isCloud&&page==='calendar'){const [from,to]=rangeForCalendar();void loadCloudSchedule(from,to);}
 if(page==='task-archive'&&isCloud){
  state.taskArchiveBusy=true;render();
  cloudApi.listArchivedTasks().then(rows=>{state.archivedTasks=rows.map(localTask);})
   .catch(saveError).finally(()=>{state.taskArchiveBusy=false;if(state.page==='task-archive')render();});
 }
 if(page==='workspace-archive'&&isCloud){
  state.archiveBusy=true;render();
  cloudApi.listArchivedWorkspaces().then(rows=>{state.archivedWorkspaces=rows.map(localWorkspace);})
  .catch(saveError).finally(()=>{state.archiveBusy=false;if(state.page==='workspace-archive')render();});
 }
 if(page==='trash'&&isCloud){
  state.trashBusy=true;render();
  cloudApi.listTrash().then(rows=>{state.trashed=rows.map(localTask);})
  .catch(saveError).finally(()=>{state.trashBusy=false;render();});
 }
}
function closeModal(){
 if(['note','note-edit'].includes(state.modal)){
  if(isCloud&&noteFormDirty&&noteAutoStatusKind==='error'&&
   !window.confirm('This note could not be backed up on this device. Copy the text before closing. Close anyway?'))return;
  if(isCloud&&noteFormDirty)
   state.noteError='Your unsynced Quick Note draft remains on this device. Reopen the note to continue syncing.';
  noteAutoController?.dispose();noteAutoController=null;
  state.noteBusy=false;
 }
 state.modal=null;state.modalTask=null;noteFormDirty=false;render();
}

function applyCloudTimeSnapshot(session){
 if(!isCloudTime||disposed)return;
 state.timeSession=session&&session.state!=='stopped'?session:null;
 if(session?.serverNow){
  const now=Date.parse(session.serverNow);
  if(Number.isFinite(now)){state.timeServerAt=now;state.timeMonotonicAt=performance.now();}
 }
 if(!state.timeSession||!session.taskId){
  state.timer=null;return;
 }
 state.timer={
  taskId:session.taskId,sessionStartedAt:Date.parse(session.startedAt),
  startedAt:Date.parse(session.segmentStartedAt||session.startedAt),
  elapsed:session.accumulatedMs,running:session.state==='running'
 };
}
async function loadCloudWeek(preserveError=false){
 if(!isCloudTime||disposed||state.weekLoading||state.weekSaving)return;
 state.weekLoading=true;if(!preserveError)state.weekError='';
 try{
  const week=await cloudApi.getWeeklyTime();
  if(!disposed)state.timeWeek=week;
 }catch(err){
  if(!disposed)state.weekError=err instanceof Error?err.message:'Weekly data unavailable';
 }finally{
  state.weekLoading=false;
  if(!disposed&&(state.page==='workspace'||state.page==='reports'))render();
 }
}
let insightsRequest=0;
async function loadCloudInsights(){
 if(!isCloudTime||disposed||state.insightsLoading)return;
 const request=++insightsRequest;
 state.insights=null;state.insightsKey='';state.insightsError='';state.insightsLoading=true;
 if(state.page==='reports')render();
 try{
  const results=await cloudApi.getTimeInsights(state.reportPeriod,state.reportAnchor);
  if(!disposed&&request===insightsRequest){
   state.insights=results;state.insightsKey=state.reportPeriod+'|'+state.reportAnchor;
  }
 }catch(error){
  if(!disposed&&request===insightsRequest)
   state.insightsError=error instanceof Error?error.message:'Could not load completion insights';
 }finally{
  if(!disposed&&request===insightsRequest){
   state.insightsLoading=false;if(state.page==='reports')render();
  }
 }
}
let periodReportRequest=0;
async function loadCloudPeriod(){
 if(!isCloudTime||disposed)return;
 const request=++periodReportRequest;
 ++insightsRequest;
 state.insights=null;state.insightsKey='';state.insightsError='';state.insightsLoading=false;
 state.periodLoading=true;state.periodError='';state.periodReport=null;
 if(state.page==='reports')render();
 try{
  const report=await cloudApi.getTimePeriod(state.reportPeriod,state.reportAnchor);
  if(disposed||periodReportRequest!==request)return;
  state.periodReport=report;
 }catch(err){
  if(!disposed&&periodReportRequest===request)
   state.periodError=err instanceof Error?err.message:'Could not load period report';
 }finally{
  if(!disposed&&periodReportRequest===request){
   state.periodLoading=false;
   if(state.page==='reports')render();
  }
 }
}
async function loadCloudTime(){
 if(!isCloudTime||disposed||state.timeLoading||state.timeBusy)return;
 state.timeLoading=true;
 try{
  const data=await cloudApi.getTimeState();
  if(disposed)return;
  applyCloudTimeSnapshot(data.session);
  state.timeTaskTotals=data.taskTotals;
  state.timeRollups=data.rollups;
  state.timeLoaded=true;
  state.timeError='';
 }catch(err){
  if(!disposed){state.timeError=err instanceof Error?err.message:'Could not load the saved timer';}
 }finally{
  state.timeLoading=false;
  if(!disposed)render();
 }
}
async function updateCloudTimer(action,id){
 if(!isCloudTime||disposed||state.timeBusy||state.timeLoading||!state.timeLoaded)return;
 const current=state.timeSession;
 let operation=action,sessionId=current?.id,revision=current?.revision,taskId,previousId;
 if(action==='start'){
  const task=findTask(id);
  if(!task||task.status!=='open')return;
  if(current?.taskId===id){
   if(current.state==='paused')operation='resume';
   else return;
  }else if(current){
   const previous=findTask(current.taskId);
   if(!window.confirm(`Stop and save the session for "${previous?.title||current.taskTitle||'your current task'}" before starting "${task.title}"?`))return;
   operation='switch';
   previousId=current.id;
   taskId=id;
   sessionId=crypto.randomUUID();
   revision=current.revision;
  }else{
   operation='start';
   sessionId=crypto.randomUUID();
   taskId=id;
   revision=0;
  }
 }
 if(!current&&['pause','resume','stop'].includes(operation))return;
 state.timeBusy=true;state.timeError='';render();
 try{
  const changed=await cloudApi.changeTimeSession(operation,sessionId,revision,taskId,previousId);
  if(!disposed)applyCloudTimeSnapshot(changed);
 }catch(err){
  if(!disposed){
   state.timeError=err instanceof Error?err.message:'Could not update the timer';
   saveError(err);
  }
 }finally{
  state.timeBusy=false;
  if(!disposed){await loadCloudTime();
   if(state.page==='workspace'||state.page==='reports')void loadCloudWeek();}
 }
}
function recordAndStop(reason='stopped'){
  if(isCloudTime){void loadCloudTime();return;}
  if(!state.timer)return;
  const entry=finishSession(state.timer,Date.now(),reason,newId());
  const task=findTask(state.timer.taskId);
  if(task){task.spentMs=recordedMs(task)+entry.durationMs;task.spent=Math.floor(task.spentMs/60000)}
  state.sessions.push(entry);
  state.timer=null;
}
async function saveCloudTask(task,changes,allowOpenChildren=false){
  const current={...task,...changes};
  const row=await cloudApi.updateTask(task.id,{...remoteTask(current),allowOpenChildren});
  const priorMs=task.spentMs||0,priorSpent=task.spent||0;
  Object.assign(task,localTask(row),{spentMs:priorMs,spent:priorSpent});
}
async function finishTask(id){
  const task=findTask(id);if(!task||task.status!=='open')return;
  const descendants=subtreeIds(id);const openChildren=state.tasks.filter(t=>t.id!==id&&descendants.has(t.id)&&t.status==='open');
  const allowOpenChildren=openChildren.length>0;
  if(allowOpenChildren&&!window.confirm('This task has '+openChildren.length+' open subtasks. Finish the parent and leave those subtasks open?'))return;
  if(isCloud){
    if(state.cloudBusy)return;
    state.cloudBusy=true;
    try{await saveCloudTask(task,{status:'done'},allowOpenChildren);}
    catch(err){saveError(err);return;}
    finally{state.cloudBusy=false;}
  }
  if(state.timer?.taskId===id)recordAndStop('completed');
  task.status='done';persist();render();
}
async function toggleTask(id){
  const task=findTask(id);if(!task)return;
  if(task.status==='done'||task.status==='cancelled'){
    if(isCloud){
      if(state.cloudBusy)return;
      state.cloudBusy=true;
      try{await saveCloudTask(task,{status:'open'});}
      catch(err){saveError(err);return;}
      finally{state.cloudBusy=false;}
    }
    task.status='open';persist();render();return;
  }
  await finishTask(id);
}
async function cancelTask(id){
 const task=findTask(id);if(!task||task.status!=='open')return;
 if(!window.confirm('Cancel "'+task.title+'"? The task remains saved and can be reopened.'))return;
 if(isCloud){
  if(state.cloudBusy)return;state.cloudBusy=true;
  try{await saveCloudTask(task,{status:'cancelled'});}
  catch(err){saveError(err);return;}finally{state.cloudBusy=false;}
 }
 if(state.timer?.taskId===id)recordAndStop('cancelled');
 task.status='cancelled';persist();render();
}
function updateTimer(action,id){
  if(isCloudTime){void updateCloudTimer(action,id);return;}
  if(action==='start'){
    const task=findTask(id);
    if(!task||task.status!=='open')return;
    if(state.timer?.taskId===id){
      if(!state.timer.running)state.timer=resumeTimer(state.timer,Date.now());
      persist();render();return;
    }
    if(state.timer){
      const previous=findTask(state.timer.taskId);
      if(!window.confirm(`Stop and save the session for "${previous?.title||'your current task'}" before starting "${task.title}"?`))return;
      recordAndStop('switched');
    }
    state.timer=startTimer(id,Date.now());
  } else if(action==='pause'&&state.timer?.running){state.timer=pauseTimer(state.timer,Date.now());}
  else if(action==='resume'&&state.timer&&!state.timer.running){state.timer=resumeTimer(state.timer,Date.now());}
  else if(action==='stop'&&state.timer){recordAndStop('stopped');}
  persist();render();
}
trackListener('click',async e=>{if(e.target.dataset.backdrop){
 // Accidental outside clicks during note writing must never close the draft.
 if(!['note','note-edit'].includes(state.modal))closeModal();
 return;
}const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action,id=b.dataset.id;switch(a){case'nav':
 if(b.dataset.page==='documents'){state.documentWorkspaceId=null;state.documentTaskId=null;}
 navigate(b.dataset.page);break;
case'pin-workspace':{
 if(!isCloud||state.cloudBusy)break;
 const w=workspaces.find(x=>x.id===id);
 if(!w)break;
 state.cloudBusy=true;render();
 try{
  const changed=await cloudApi.setWorkspacePinned(serverWorkspaceId(w.id),w.revision,!w.pinned);
  if(disposed)break;
  Object.assign(w,localWorkspace(changed));
 }catch(err){
  if(!disposed)saveError(err);
 }finally{state.cloudBusy=false;if(!disposed)render();}
 break;
}
case'documents-workspace':
 if(isCloud){state.documentWorkspaceId=serverWorkspaceId(id);state.documentTaskId=null;navigate('documents');}
 break;
case'documents-task':{
 if(isCloud){const task=findTask(id);if(task){
  state.documentWorkspaceId=serverWorkspaceId(task.workspace);state.documentTaskId=task.id;
  navigate('documents');
 }}break;
}
case'refresh-alerts':void loadCloudAlerts();break;
case'time-retry':void loadCloudTime();break;
case'refresh-week':void loadCloudWeek();break;
 case'refresh-period':if(isCloudTime)void loadCloudPeriod();break;
 case'load-insights':if(isCloudTime)void loadCloudInsights();break;
case'export-insights-csv':{
  const insights=state.insightsKey===state.reportPeriod+'|'+state.reportAnchor?
    state.insights:null;
  if(!isCloudTime||!insights||state.insightsLoading||state.periodLoading)break;
  try{
   const csv=timeInsightsCsv(insights);
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   try{
    const link=document.createElement('a');
    link.href=url;link.download='dayframe-insights-'+insights.period+'-'+insights.startDay+'.csv';
    document.body.appendChild(link);link.click();link.remove();
   }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(error){
   state.insightsError=error instanceof Error?error.message:'Could not export insights';
   render();
  }
  break;
 }

 case'export-period-csv':{
  if(!isCloudTime||!state.periodReport||state.periodLoading)break;
  const report=state.periodReport;
  const contents=periodReportCsv(report);
  const blob=new Blob([contents],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{
   const link=document.createElement('a');
   link.href=url;
   link.download='dayframe-'+report.period+'-'+report.startDay+'.csv';
   document.body.appendChild(link);link.click();link.remove();
  }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  break;
 }
case'enable-push':void enableBrowserPush();break;
case'disable-push':void disableBrowserPush();break;
case'use-device-zone':void setCurrentNotificationZone();break;
case'quiet-hours':void openQuietHours();break;
case'alert-ack':void changeCloudAlert(Number(b.dataset.index),'acknowledge');break;
case'alert-snooze':void changeCloudAlert(Number(b.dataset.index),'snooze');break;
case'account-refresh':if(typeof account.onRefresh==='function'&&
  (!documentPageDirty||window.confirm('Discard unsaved document changes and refresh your account?')))
  account.onRefresh();break;
case'account-sign-out':{
 if(state.accountBusy||typeof account.onSignOut!=='function')break;
 if(documentPageDirty&&!window.confirm('Discard unsaved document changes and sign out?'))break;
 state.accountBusy=true;b.disabled=true;const original=b.innerHTML;b.textContent='Signing out…';
 try{await account.onSignOut();}
 catch(err){saveError(err);state.accountBusy=false;b.disabled=false;b.innerHTML=original;}
 break;
}case'create':state.modal='create';render();break;case'modal-workspace':state.modal='workspace-create';state.modalTask=null;render();break;case'modal-workspace-edit':state.modal='workspace-edit';state.modalTask=id;render();break;
case'archive-workspace':{
 if(!isCloud||!workspaces.some(w=>w.id===id&&w.kind==='custom'))break;
 state.modal='archive-workspace';state.modalTask=id;render();break;
}case'modal-task':state.modal='task';state.modalTask=id||null;state.subtaskParent=null;render();break;
case'add-subtask':{const parent=findTask(id);if(!parent||parent.status!=='open')break;state.modal='task';state.modalTask=parent.workspace;state.subtaskParent=parent.id;render();break;}case'modal-edit':state.modal='edit';state.modalTask=id;render();break;case'modal-note':
 noteFormDirty=false;state.noteError='';state.notePendingCreate=null;state.modal='note';state.modalTask=id||null;
 render();beginNoteAutosave();break;
case'edit-note':{
 if(!state.notes.some(n=>n.id===id)||state.noteBusy)break;
 noteFormDirty=false;state.noteError='';state.notePendingCreate=null;state.modal='note-edit';state.modalTask=id;
 render();beginNoteAutosave();break;
}
case'convert-note':{
 const n=state.notes.find(x=>x.id===id);
 if(!n||n.convertedAt||state.noteBusy)break;
 state.noteError='';state.modal='note-convert';state.modalTask=id;render();break;
}
case'refresh-notes':if(isCloud)void loadCloudNotes();break;
case'show-active-notes':state.noteMode='active';state.noteError='';render();
 if(isCloud&&!state.noteLoaded)void loadCloudNotes();break;
case'show-note-trash':if(!isCloud)break;
 state.noteMode='trash';state.noteTrashError='';render();void loadCloudTrashedNotes();break;
case'refresh-note-trash':if(isCloud)void loadCloudTrashedNotes();break;
case'restore-note':{
 if(!isCloud||state.noteBusy)break;
 const note=state.noteTrash.find(n=>n.id===id);
 if(!note)break;
 state.noteBusy=true;state.noteTrashError='';render();
 try{
  const restored=await cloudApi.restoreQuickNote(note.id,note.revision);
  if(disposed)break;
  state.noteTrash=state.noteTrash.filter(n=>n.id!==id);
  upsertQuickNote(restored);
 }catch(err){
  if(!disposed)state.noteTrashError=err instanceof Error?err.message:'Could not restore note';
 }finally{
  state.noteBusy=false;
  if(!disposed)render();
 }
 break;
}
case'toggle-note-pin':{
 const n=state.notes.find(x=>x.id===id);
 if(!n||state.noteBusy)break;
 if(!isCloud){
  n.pinned=!n.pinned;persist();render();break;
 }
 state.noteBusy=true;state.noteError='';render();
 let conflict=false;
 try{
  const result=await cloudApi.updateQuickNote(n.id,{
   ...remoteQuickNote(n),pinned:!n.pinned,revision:n.revision
  });
  if(!disposed)upsertQuickNote(result);
 }catch(err){
  conflict=true;
  if(!disposed)state.noteError=err instanceof Error?err.message:'Could not update note';
 }finally{
  state.noteBusy=false;if(!disposed){render();if(conflict)void loadCloudNotes(true);}
 }
 break;
}case'modal-plan-add':state.modal='plan-add';render();break;case'modal-schedule':state.modal='schedule';state.modalTask=id||null;state.scheduleEditId=null;state.scheduleError='';render();break;
case'edit-interval':{
 const slot=state.scheduled.find(x=>x.id===id);
 if(!slot||state.scheduleBusy)break;
 state.scheduleEditId=slot.id;state.modalTask=null;state.scheduleError='';state.modal='schedule';render();break;
}
case'schedule-retry':{
 if(isCloud)void loadCloudSchedule(state.planDay,state.planDay);break;
}
case'calendar-retry':{
 if(isCloud){const [from,to]=rangeForCalendar();void loadCloudSchedule(from,to);}break;
}
case'calendar-view':{
 state.calendarView=b.dataset.value;render();
 if(isCloud){const [from,to]=rangeForCalendar();void loadCloudSchedule(from,to);}break;
}
case'calendar-prev':case'calendar-next':case'calendar-today':{
 const step=a==='calendar-prev'?-1:1;
 if(a==='calendar-today')state.calendarAnchor=today();
 else if(state.calendarView==='month'){
  const d=new Date(state.calendarAnchor+'T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth()+step,1);
  state.calendarAnchor=d.toISOString().slice(0,10);
 }else state.calendarAnchor=dayAdd(state.calendarAnchor,state.calendarView==='week'?step*7:step);
 render();if(isCloud){const [from,to]=rangeForCalendar();void loadCloudSchedule(from,to);}break;
}
case'calendar-open-day':{
 const day=b.dataset.day;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))break;
 state.planDay=day;navigate('plan');if(isCloud)void loadCloudPool(day);break;
}case'close':closeModal();break;case'filter':state.filter=b.dataset.value;render();break;case'workspace':state.viewWorkspace=id;state.page='workspace';render();if(isCloudTime)void loadCloudWeek();if(isCloud)void loadCloudNotes();break;case'detail':state.taskId=id;state.taskTab='overview';state.page='detail';render();if(isCloud)void loadTaskMedia(id);break;case'task-tab':{
 state.taskTab=b.dataset.value;render();
 if(state.taskTab==='history'&&isCloud){
  state.taskEventsBusy=true;state.taskEvents=[];render();
  cloudApi.taskEvents(state.taskId).then(rows=>{if(state.taskTab==='history')state.taskEvents=rows;})
   .catch(saveError).finally(()=>{state.taskEventsBusy=false;if(state.taskTab==='history')render();});
 }
 break;
}case'toggle-task':await toggleTask(id);break;case'reopen-task':{const task=findTask(id);if(task&&task.status!=='open')await toggleTask(id);break;}case'cancel-task':await cancelTask(id);break;case'finish-task':await finishTask(id);break;case'start':updateTimer('start',id);break;case'pause':updateTimer('pause');break;case'resume':updateTimer('resume');break;case'stop':updateTimer('stop');break;case'pool-add':{
 const task=findTask(id);if(!task||task.status!=='open')break;
 const saved=await changeDailyPool(ids=>ids.includes(id)?ids:[...ids,id]);
 if(saved){state.modal=null;render();}break;
}
case'pool-remove':await changeDailyPool(ids=>ids.filter(x=>x!==id));break;
case'pool-up':case'pool-down':{
 await changeDailyPool(ids=>{
  const i=ids.indexOf(id),j=i+(a==='pool-up'?-1:1);
  if(i>=0&&j>=0&&j<ids.length)[ids[i],ids[j]]=[ids[j],ids[i]];
  return ids;
 });break;
}
case'pool-retry':if(isCloud)await loadCloudPool(state.planDay);break;
case'unschedule':{
 const interval=state.scheduled.find(x=>x.id===id);
 if(!interval||state.scheduleBusy)break;
 if(!window.confirm('Remove this timed block? The task and its deadlines will remain unchanged.'))break;
 if(isCloud){
  const saved=await changeTimedSchedule(async()=>{
   await cloudApi.deleteTimedInterval(interval.id,interval.revision);
   return {id:interval.id,removed:true};
  });
  if(!saved)break;
 }else{
  if(!state.pool.includes(interval.taskId))state.pool.push(interval.taskId);
  state.scheduled=state.scheduled.filter(x=>x.id!==id);
  persist();
 }
 render();break;
}case'report-period':if(['day','week','month'].includes(b.dataset.value)){
  state.reportPeriod=b.dataset.value;render();if(isCloudTime)void loadCloudPeriod();
 }break;case'theme':state.theme=id;persist();render();break;case'accent':state.accent=id;persist();render();break;case'edit-image':state.mediaTarget={kind:b.dataset.kind,id,slot:b.dataset.slot};state.modal='media';render();break;case'remove-image':{
 const m=state.mediaTarget;if(!m)break;
 if(isCloud&&m.kind==='task'){
  try{await cloudApi.deleteTaskMedia(m.id,m.slot);}
  catch(err){saveError(err);break;}
 }
 delete state.media[mediaKey(m.kind,m.id,m.slot)];
 delete state.mediaPos[mediaKey(m.kind,m.id,m.slot)];
 state.modal=null;persist();render();break;
}case'modal-delete-task':state.modal='delete-task';state.modalTask=id;render();break;
case'modal-archive-task':if(isCloud&&findTask(id)){state.modal='archive-task-confirm';state.modalTask=id;render();}break;
case'modal-move-task':if(isCloud&&findTask(id)){state.modal='move-task';state.modalTask=id;render();setTimeout(()=>{const select=document.querySelector('#move-workspace');if(select)select.dispatchEvent(new Event('change',{bubbles:true}));},0);}break;
case'modal-permanent-task':if(isCloud&&state.trashed.some(t=>t.id===id)){state.modal='permanent-task';state.modalTask=id;render();}break;case'confirm-archive-workspace':{
 if(!isCloud||state.cloudBusy)break;
 const w=workspaces.find(item=>item.id===state.modalTask);
 if(!w||w.kind!=='custom')break;
 state.cloudBusy=true;
 try{await cloudApi.archiveWorkspace(w.serverId,w.revision);}
 catch(err){saveError(err);break;}
 finally{state.cloudBusy=false;}
 const ids=new Set(state.tasks.filter(t=>t.workspace===w.id).map(t=>t.id));
 if(state.timer&&ids.has(state.timer.taskId))recordAndStop('workspace_archived');
 state.tasks=state.tasks.filter(t=>t.workspace!==w.id);
 const index=workspaces.indexOf(w);if(index>=0)workspaces.splice(index,1);
 state.modal=null;state.modalTask=null;state.page='workspaces';
 persist();render();break;
}
case'confirm-archive-task':{
 if(!isCloud||state.cloudBusy)break;
 const task=findTask(state.modalTask);if(!task)break;
 const ids=subtreeIds(task.id);state.cloudBusy=true;
 try{await cloudApi.archiveTask(task.id,task.revision);}
 catch(err){saveError(err);break;}finally{state.cloudBusy=false;}
 if(state.timer&&ids.has(state.timer.taskId))recordAndStop('task_archived');
 state.tasks=state.tasks.filter(t=>!ids.has(t.id));
 state.modal=null;state.modalTask=null;state.page='tasks';persist();render();break;
}
case'unarchive-task':{
 if(!isCloud||state.cloudBusy)break;
 const task=state.archivedTasks.find(t=>t.id===id);if(!task)break;
 state.cloudBusy=true;
 try{
  await cloudApi.unarchiveTask(id,task.revision);
  if(typeof account.onRefresh==='function')account.onRefresh();
  else location.reload();
 }catch(err){saveError(err);}
 finally{state.cloudBusy=false;}
 break;
}
case'confirm-delete-task':{
 const tid=state.modalTask,affected=subtreeIds(tid);
 if(isCloud){
  if(state.cloudBusy)return;
  state.cloudBusy=true;
  try{const task=findTask(tid);if(!task)throw new Error('Task no longer exists. Refresh.');await cloudApi.trashTask(tid,task.revision);}
  catch(err){saveError(err);return;}
  finally{state.cloudBusy=false;}
 }
 if(state.timer&&affected.has(state.timer.taskId))recordAndStop('stopped');
 state.tasks=state.tasks.filter(t=>!affected.has(t.id));
 for(const day of Object.keys(state.pools))state.pools[day]=state.pools[day].filter(x=>!affected.has(x));
 state.scheduled=state.scheduled.filter(s=>!affected.has(s.taskId));
 if(!isCloud)state.sessions=state.sessions.filter(x=>!affected.has(x.taskId));
 state.modal=null;state.modalTask=null;state.page='tasks';persist();render();break;
}
case'restore-workspace':{
 if(!isCloud||state.cloudBusy)break;
 const w=state.archivedWorkspaces.find(item=>item.id===id);
 if(!w||w.kind!=='custom')break;
 state.cloudBusy=true;b.disabled=true;
 try{
  await cloudApi.restoreWorkspace(w.serverId,w.revision);
  state.archivedWorkspaces=state.archivedWorkspaces.filter(item=>item.id!==w.id);
  if(typeof account.onRefresh==='function')account.onRefresh();
  else window.location.reload();
 }catch(err){saveError(err);}
 finally{state.cloudBusy=false;b.disabled=false;}
 break;
}
case'restore-task':{
 if(!isCloud||state.cloudBusy)return;
 state.cloudBusy=true;
 try{
  const item=state.trashed.find(t=>t.id===id);
  if(!item)throw new Error('This task is not in the loaded Trash. Refresh.');
  await cloudApi.restoreTask(id,item.revision);
  if(typeof account.onRefresh==='function')account.onRefresh();
  else location.reload();
 }catch(err){saveError(err);return;}
 finally{state.cloudBusy=false;}
 persist();render();break;
}case'delete-note':{
 if(state.noteBusy)break;
 state.noteError='';state.modal='delete-note';state.modalTask=id;render();break;
}
case'confirm-delete-note':{
 if(state.noteBusy)break;
 const n=state.notes.find(x=>x.id===state.modalTask);
 if(!n){state.modal=null;render();break;}
 if(isCloud){
  state.noteBusy=true;state.noteError='';render();
  try{
   await cloudApi.deleteQuickNote(n.id,n.revision);
   if(!disposed){state.notes=state.notes.filter(x=>x.id!==n.id);state.modal=null;}
  }catch(err){
   if(!disposed)state.noteError=err instanceof Error?err.message:'Note could not be deleted';
  }finally{state.noteBusy=false;if(!disposed)render();}
 }else{
  state.notes=state.notes.filter(x=>x.id!==n.id);state.modal=null;persist();render();
 }
 break;
}case'reset':state.modal='reset';render();break;case'confirm-reset':localStorage.removeItem(STORAGE);location.reload();break;default:break}});
trackListener('submit',async e=>{e.preventDefault();const form=e.target;const data=new FormData(form);
if(form.id==='weekly-goal-form'){
 if(!isCloudTime||state.weekSaving||state.weekLoading)return;
 const w=workspace(state.viewWorkspace),row=weekWorkspace(w);
 if(!row){state.weekError='Reload this week before saving a target.';render();return;}
 const hours=Number(data.get('hours'));
 const targetMinutes=hours*60;
 if(!Number.isFinite(hours)||hours<0||hours>168||!Number.isInteger(hours*4)||
  !Number.isInteger(targetMinutes)){
  state.weekError='Enter whole quarter-hours between 0 and 168 hours.';
  render();return;
 }
 state.weekSaving=true;state.weekError='';render();
 let failed=false;
 try{
  await cloudApi.saveWeeklyTarget(serverWorkspaceId(w.id),targetMinutes,row.revision);
 }catch(err){
  failed=true;
  if(!disposed)state.weekError=err instanceof Error?err.message:'Could not save goal';
 }finally{
  state.weekSaving=false;
  if(!disposed)void loadCloudWeek(failed);
 }
 return;
}
if(form.id==='task-form'){
 if(state.cloudBusy)return;
 const existing=state.modal==='edit'&&findTask(state.modalTask);
 const entry={title:String(data.get('title')||'').trim(),workspace:String(data.get('workspace')||'general'),
 estimate:Number(data.get('estimate'))||30,deadline:String(data.get('deadline')||'')||null,
 deadlineTime:String(data.get('deadlineTime')||'')||null,
 reminder:String(data.get('reminder')||'')||null,
 reminderTime:String(data.get('reminderTime')||'')||null,long:data.has('long'),
 priority:String(data.get('priority')||'medium'),parent:String(data.get('parent')||'')||null,
 pinned:data.has('pinned'),tags:String(data.get('tags')||'').split(',').map(x=>x.trim()).filter(Boolean),
 notes:String(data.get('notes')||'')};
 if(!entry.title)return;
 if(entry.tags.length>8||entry.tags.some(t=>t.length>30)||new Set(entry.tags.map(t=>t.toLocaleLowerCase())).size!==entry.tags.length){alert('Use up to eight distinct tags, each 30 characters or fewer.');return;}
 if(isCloud){
  state.cloudBusy=true;
  const saveButton=form.querySelector('button[type="submit"]');
  if(saveButton)saveButton.disabled=true;
  try{
   if(existing){
    const row=await cloudApi.updateTask(existing.id,remoteTask({...existing,...entry}));
    const time=existing.spentMs||0,spent=existing.spent||0;
    Object.assign(existing,localTask(row),{spentMs:time,spent});
   }else{
    const id=crypto.randomUUID();
    const row=await cloudApi.createTask(remoteTask({id,spent:0,status:'open',priority:'medium',parent:null,...entry}));
    state.tasks.unshift(localTask(row));
   }
  }catch(err){saveError(err);return;}
  finally{state.cloudBusy=false;if(saveButton)saveButton.disabled=false;}
 }else if(existing)Object.assign(existing,entry);
 else state.tasks.unshift({id:newId(),spent:0,status:'open',priority:'medium',parent:null,...entry});
 state.modal=null;state.modalTask=null;state.subtaskParent=null;persist();render();
}
if(form.id==='move-task-form'){
 if(!isCloud||state.cloudBusy)return;
 const task=findTask(state.modalTask);if(!task)return;
 const dest=String(data.get('workspace')||'');
 const parent=String(data.get('parent')||'')||null;
 state.cloudBusy=true;
 try{
  await cloudApi.moveTask(task.id,{workspace:serverWorkspaceId(dest),parent,revision:task.revision});
  if(typeof account.onRefresh==='function')account.onRefresh();
  else location.reload();
 }catch(err){saveError(err);}
 finally{state.cloudBusy=false;}
 return;
}
if(form.id==='permanent-task-form'){
 if(!isCloud||state.cloudBusy)return;
 const task=state.trashed.find(t=>t.id===state.modalTask);if(!task)return;
 const confirmation=String(data.get('confirm')||'');
 if(confirmation!=='DELETE'){alert('Type DELETE exactly to confirm.');return;}
 state.cloudBusy=true;
 try{
  await cloudApi.permanentlyDeleteTask(task.id,task.revision,confirmation);
  state.trashed=state.trashed.filter(x=>x.id!==task.id);
  state.modal=null;state.modalTask=null;render();
 }catch(err){saveError(err);}
 finally{state.cloudBusy=false;}
 return;
}
if(form.id==='workspace-form'){
 if(!isCloud||state.cloudBusy)return;
 const existing=state.modal==='workspace-edit'?workspaces.find(w=>w.id===state.modalTask):null;
 if(existing&&existing.kind==='general')return;
 const entry={
  name:String(data.get('name')||'').trim(),subtitle:String(data.get('subtitle')||'').trim(),
  color:String(data.get('color')||'#85a99d'),cover:String(data.get('cover')||'general')
 };
 if(!entry.name)return;
 state.cloudBusy=true;
 const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
 try{
  if(existing){
   const updated=await cloudApi.updateWorkspace(existing.serverId,{...entry,revision:existing.revision});
   Object.assign(existing,localWorkspace(updated));
  }else{
   const created=await cloudApi.createWorkspace(entry);
   const w=localWorkspace(created);
   workspaces.push(w);
   state.viewWorkspace=w.id;
   state.page='workspace';
  }
 }catch(err){saveError(err);return;}
 finally{state.cloudBusy=false;if(button)button.disabled=false;}
 state.modal=null;state.modalTask=null;persist();render();
}
if(form.id==='quiet-hours-form'){
 if(!isCloud||state.quietBusy||state.quietLoading)return;
 const start=String(data.get('quietStart')||'')||null;
 const end=String(data.get('quietEnd')||'')||null;
 if((start===null)!==(end===null)||(start!==null&&start===end)){
  state.quietError='Set both times to different values, or clear both to disable quiet hours.';
  state.quietStart=start;state.quietEnd=end;render();return;
 }
 state.quietBusy=true;state.quietStart=start;state.quietEnd=end;state.quietError='';
 try{
  await cloudApi.setNotificationQuietHours(start,end,Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');
  if(disposed)return;
  state.modal=null;state.pushMessage=start?'Quiet hours saved for account notifications.':'Quiet hours disabled.';
  await loadCloudAlerts();if(!disposed)render();
 }catch(error){
  if(!disposed){state.quietError=error instanceof Error?error.message:'Could not save quiet hours';render();}
 }finally{state.quietBusy=false;}
 return;
}
if(form.id==='note-form'){
 if(isCloud){
  if(!noteAutoController)beginNoteAutosave();
  const controller=noteAutoController;
  if(!controller)return;
  const synced=await controller.flush(true);
  if(synced&&controller.isSaved()&&!disposed){
   controller.dispose();
   if(noteAutoController===controller)noteAutoController=null;
   noteFormDirty=false;state.noteBusy=false;state.noteError='';
   state.modal=null;state.modalTask=null;render();
  }
 }else{
  const raw={
   workspace:String(data.get('workspace')||'general'),
   title:String(data.get('title')||''),
   content:String(data.get('content')||''),
   color:String(data.get('color')||'cream'),
   pinned:data.has('pinned'),
   reminder:String(data.get('reminder')||'')||null,
   reminderTime:String(data.get('reminderTime')||'')||null
  };
  const entry={...raw,title:effectiveNoteTitle(raw)};
  const existing=state.modal==='note-edit'?state.notes.find(n=>n.id===state.modalTask):null;
  if(existing)Object.assign(existing,entry);
  else state.notes.unshift({id:newId(),...entry});
  noteFormDirty=false;state.modal=null;state.modalTask=null;persist();render();
 }
 return;
}
if(form.id==='note-convert-form'){
 if(state.noteBusy)return;
 const n=state.notes.find(x=>x.id===state.modalTask);
 if(!n||n.convertedAt)return;
 const estimate=Number(data.get('estimate'));
 if(!Number.isSafeInteger(estimate)||estimate<1||estimate>100000)return;
 state.noteBusy=true;state.noteError='';
 const submit=form.querySelector('button[type="submit"]');
 if(submit)submit.disabled=true;
 const onFail=message=>{
  state.noteError=message;
  let node=form.querySelector('[role="alert"]');
  if(!node){node=document.createElement('p');node.className='tiny';
   node.setAttribute('role','alert');form.insertBefore(node,form.querySelector('.modal-footer'));}
  node.textContent=message;
 };
 try{
  if(isCloud){
   const pending=state.notePendingConversion;
   // The note UUID is also the deterministic converted-task UUID, so an uncertain
   // response remains retryable after a page reload without storing identifiers.
   const taskId=pending?.noteId===n.id?pending.taskId:n.id;
   state.notePendingConversion={noteId:n.id,taskId};
   const result=await cloudApi.convertQuickNote(n.id,n.revision,taskId,estimate);
   if(disposed)return;
   upsertQuickNote(result.note);
   const task=localTask(result.task);
   const pos=state.tasks.findIndex(x=>x.id===task.id);
   if(pos<0)state.tasks.unshift(task);else state.tasks[pos]=task;
   state.notePendingConversion=null;
  }else{
   const taskId=newId();
   state.tasks.unshift({id:taskId,title:n.title,notes:n.content,
    workspace:n.workspace,estimate,spent:0,status:'open',priority:'medium',
    long:false,parent:null,deadline:null,reminder:null,pinned:false,tags:[]});
   n.convertedTaskId=taskId;n.convertedAt=new Date().toISOString();
   persist();
  }
  state.modal=null;state.modalTask=null;render();
 }catch(err){
  if(!disposed)onFail(err instanceof Error?err.message:'Could not convert note');
 }finally{
  state.noteBusy=false;if(submit)submit.disabled=false;
 }
 return;
}

if(form.id==='schedule-form'){
 const start=String(data.get('start')||''),end=String(data.get('end')||'');
 const day=String(data.get('day')||''),taskId=String(data.get('task')||'');
 const zone=String(data.get('timeZone')||'UTC');
 const current=state.scheduleEditId?state.scheduled.find(slot=>slot.id===state.scheduleEditId):null;
 const failForm=message=>{const element=document.querySelector('.schedule-form-error');if(element)element.textContent=message;};
 if(!findTask(taskId)||!/^\d{4}-\d{2}-\d{2}$/.test(day)){failForm('Select an active task and a valid date.');return;}
 if(!/^\d\d:\d\d$/.test(start)||!/^\d\d:\d\d$/.test(end)||parseClock(end)<=parseClock(start)){
  failForm('End time must be later than start time. Create two blocks for an overnight task.');return;
 }
 if(state.scheduled.some(slot=>slot.id!==current?.id&&slot.day===day&&slot.start<end&&start<slot.end)){
  failForm('That interval overlaps another scheduled block. Choose a free time.');return;
 }
 const minutes=state.scheduled.filter(slot=>slot.id!==current?.id&&slot.day===day)
  .reduce((total,slot)=>total+parseClock(slot.end)-parseClock(slot.start),0)+parseClock(end)-parseClock(start);
 if(minutes>state.capacity*60&&!window.confirm('Scheduled blocks exceed your local daily capacity of '+state.capacity+' hours. Save anyway?'))return;
 if(isCloud){
  if(state.scheduleBusy)return;
  const payload={id:current?.id||crypto.randomUUID(),taskId,day,start,end,timeZone:zone,revision:current?.revision||0};
  const saved=await changeTimedSchedule(()=>cloudApi.saveTimedInterval(payload));
  if(!saved)return;
 }else{
  if(current)Object.assign(current,{taskId,day,start,end,revision:(current.revision||1)+1,timeZone:zone});
  else state.scheduled.push({id:newId(),taskId,day,start,end,revision:1,timeZone:zone});
  if(remainingUnscheduled(findTask(taskId),day)>0){
   if(day===state.planDay&&!state.pool.includes(taskId))state.pool.push(taskId);
  }
  persist();
 }
 state.modal=null;state.modalTask=null;state.scheduleEditId=null;
 render();
}
});
trackListener('input',e=>{if(e.target.id==='media-position'){const preview=document.querySelector('.media-preview');if(preview)preview.style.backgroundPosition=`center ${e.target.value}%`;return;}if(e.target.id==='task-search'){state.search=e.target.value;const pos=e.target.selectionStart;render();const input=$('#task-search');input?.focus();input?.setSelectionRange(pos,pos);return;}
if(e.target.id==='note-search'){
 state.noteSearch=e.target.value;const pos=e.target.selectionStart;
 render();const input=$('#note-search');input?.focus();input?.setSelectionRange(pos,pos);
}
});
trackListener('change',async e=>{
 if(e.target.id==='report-anchor'&&isCloudTime){
  const value=e.target.value;
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='2000-01-01'&&value<='2100-12-31'){
   state.reportAnchor=value;void loadCloudPeriod();
  }
  return;
 }
 if(e.target.id==='media-file'){
 const file=e.target.files?.[0],m=state.mediaTarget;
 if(!m||!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){alert('Choose a JPEG, PNG or WebP image under 5 MB.');return;}
 try{
  const image=await createImageBitmap(file);
  const maxW=m.slot==='avatar'?400:(isCloud&&m.kind==='task'?1100:1400);
  const maxH=m.slot==='avatar'?400:(isCloud&&m.kind==='task'?720:900);
  let scale=Math.min(1,maxW/image.width,maxH/image.height);
  const canvas=document.createElement('canvas');
  const remote=isCloud&&m.kind==='task';
  let encoded='';
  for(let attempt=0;attempt<(remote?9:1);attempt++){
   canvas.width=Math.max(1,Math.round(image.width*scale));
   canvas.height=Math.max(1,Math.round(image.height*scale));
   canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
   encoded=canvas.toDataURL('image/webp',Math.max(.35,.74-attempt*.05));
   if(!remote||encoded.split(',')[1].length*.75<=175000)break;
   scale*=.79;
  }
  image.close?.();
  if(remote){
   if(encoded.split(',')[1].length*.75>180000){alert('Image remains too large after compression. Choose a smaller picture.');return;}
   await cloudApi.saveTaskMedia(m.id,m.slot,encoded,Number(state.mediaPos[mediaKey(m.kind,m.id,m.slot)]??50));
  }else if(encoded.length>950000){alert('Image is too large after compression. Try a smaller picture.');return;}
  const key=mediaKey(m.kind,m.id,m.slot),previous=state.media[key];
  state.media[key]=encoded;
  if(!persist()){
   if(previous)state.media[key]=previous;else delete state.media[key];
   if(!remote){alert('Local preview storage is full. Try a smaller picture.');return;}
  }
  state.modal=null;render();
 }catch(err){saveError(err);}
 return;
}if(e.target.id==='density-select'){state.density=e.target.value;persist();render();return;}if(e.target.id==='cover-style-select'){state.coverStyle=e.target.value;persist();render();return;}if(e.target.id==='media-position'){
 const m=state.mediaTarget;if(m){
  const position=Number(e.target.value);
  if(isCloud&&m.kind==='task'){
   try{await cloudApi.setTaskMediaFocal(m.id,m.slot,position);}catch(err){saveError(err);return;}
  }
  state.mediaPos[mediaKey(m.kind,m.id,m.slot)]=position;persist();render();
 }return;}if(e.target.id==='task-sort'){state.taskSort=e.target.value;persist();render();return;}if(e.target.id==='move-workspace'){
 const select=document.querySelector('#move-parent');
 const task=findTask(state.modalTask);if(!select||!task)return;
 const dest=e.target.value;
 const ids=subtreeIds(task.id);
 select.innerHTML='<option value="">Top-level task</option>'+
  state.tasks.filter(t=>t.workspace===dest&&t.status==='open'&&!ids.has(t.id))
   .map(t=>'<option value="'+escapeHTML(t.id)+'">'+escapeHTML(t.title)+'</option>').join('');
 return;
}if(e.target.id==='note-filter'){state.noteFilter=e.target.value;render();return;}
if(e.target.id==='workspace-filter'){state.workspaceFilter=e.target.value;render()}if(e.target.id==='plan-day'){
 state.planDay=e.target.value;render();
 if(isCloud){void loadCloudPool(state.planDay);void loadCloudSchedule(state.planDay,state.planDay);}
}
if(e.target.id==='calendar-anchor'){
 state.calendarAnchor=e.target.value;render();
 if(isCloud){const [from,to]=rangeForCalendar();void loadCloudSchedule(from,to);}
}if(e.target.id==='capacity'){state.capacity=Number(e.target.value);persist();render()}});
trackListener('input',e=>{
 const form=e.target?.closest?.('#note-form');
 if(form){noteFormDirty=true;if(isCloud)noteAutoController?.change(noteFormFields(form));}
});
trackListener('change',e=>{
 const form=e.target?.closest?.('#note-form');
 if(form){noteFormDirty=true;if(isCloud)noteAutoController?.change(noteFormFields(form));}
});
trackListener('keydown',e=>{
 // Slash/formatting commands may use Escape. Explicit Close is required
 // while writing, so a stray key never discards a quick-note draft.
 if(e.key==='Escape'&&state.modal&&
  !['note','note-edit'].includes(state.modal))closeModal();
});
const timerHandle = setInterval(()=>{
  document.querySelectorAll('[data-timer-display]').forEach(el=>el.textContent=formatTimer());
  const detailMetric=document.querySelector('.page-detail .metric-value[data-current-task-time]');
  if(detailMetric){
   const t=findTask(state.taskId);
   if(t){
    const own=taskTimeMs(t),all=taskTimeWithSubtasksMs(t);
    detailMetric.textContent=formatElapsed(all);
    const breakdown=document.querySelector('[data-task-time-breakdown]');
    if(breakdown)breakdown.textContent='Own '+formatElapsed(own)+' · Subtasks '+formatElapsed(Math.max(0,all-own));
   }
  }
  const ownRemain=document.querySelector('[data-own-remaining]');
  if(ownRemain&&state.page==='detail'){
   const t=findTask(state.taskId);
   if(t){
    ownRemain.textContent=formatElapsed(taskRemainingMs(t));
    const nested=document.querySelector('[data-subtree-remaining]');
    if(nested)nested.textContent=formatElapsed(subtreeRemainingMs(t));
   }
  }
  const workspaceMetric=document.querySelector('[data-current-workspace-time]');
  if(workspaceMetric&&state.page==='workspace')
   workspaceMetric.textContent=formatElapsed(workspaceTimeMs(workspace(state.viewWorkspace)));
  const accountMetric=document.querySelector('[data-current-account-time]');
  if(accountMetric&&state.page==='reports')
   accountMetric.textContent=formatElapsed(accountTimeMs());
},250);
const onStorage=(event)=>{
  if(isCloud||event.key!==STORAGE||!event.newValue)return;
  try{
    const newer=JSON.parse(event.newValue);
    state.tasks=Array.isArray(newer.tasks)?newer.tasks:state.tasks;
    state.sessions=Array.isArray(newer.sessions)?newer.sessions:state.sessions;
    state.timer=restoreTimer(newer.timer,new Set(state.tasks.filter(t=>t.status!=='done').map(t=>t.id)));
    render();
  }catch(err){console.warn('Could not synchronize demo timer tab',err)}
};
window.addEventListener('storage',onStorage);
render();
if(isCloud)void loadCloudNotes();
if(isCloud)void loadCloudPool(today());
if(isCloud)void loadCloudAlerts();
if(isCloudTime)void loadCloudTime();
const onTimeFocus=()=>{
 // Background refresh must not erase an in-progress weekly-goal edit.
 if(isCloudTime&&!document.hidden&& !document.querySelector('#weekly-goal-form input:focus')){
  void loadCloudTime();
  if(state.page==='workspace'||state.page==='reports')void loadCloudWeek();
 }
};
window.addEventListener('focus',onTimeFocus);
document.addEventListener('visibilitychange',onTimeFocus);
const timeRefreshHandle=isCloudTime?setInterval(onTimeFocus,45000):null;
if(isCloud&&alertsBackendEnabled&&'serviceWorker' in navigator&&'Notification' in window&&Notification.permission==='granted'){
 navigator.serviceWorker.getRegistration(new URL('./',document.baseURI).pathname)
  .then(reg=>reg?.pushManager.getSubscription())
  .then(async sub=>{
   if(!sub)return false;
   const registered=await cloudApi.isPushRegistered(sub.endpoint);
   if(!registered){
    // This browser may now belong to another Dayframe account. Disconnect
    // the old device subscription rather than receiving its generic alerts.
    await sub.unsubscribe();
   }
   return registered;
  })
  .then(registered=>{if(!disposed&&registered){state.pushEnabled=true;if(state.page==='home')render();}})
  .catch(()=>{});
}
if(isCloud)void loadCloudSchedule(today(),today());

  return () => {
    disposed=true;
    documentPageSerial++;
    if(documentPageCleanup){documentPageCleanup();documentPageCleanup=null;documentPageMounted=false;}
    clearInterval(timerHandle);
    if(timeRefreshHandle!==null)clearInterval(timeRefreshHandle);
    window.removeEventListener('focus',onTimeFocus);
    document.removeEventListener('visibilitychange',onTimeFocus);
    window.removeEventListener('storage',onStorage);
    for (const [eventName, handler] of listeners) document.removeEventListener(eventName, handler);
    const mount = document.getElementById('app');
    noteAutoController?.dispose();noteAutoController=null;
    if (mount) mount.replaceChildren();
  };
}
