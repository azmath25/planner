import fs from 'node:fs';
import './build-m42-harness.mjs';
// Exercise the actual signed-in UI and its M5.1 branch with an in-memory
// deterministic substitute for authenticated Neon Function responses.
let source=fs.readFileSync('tests/.harness/m42-app.js','utf8');
const old=/const timeBackendEnabled\s*=\s*false;/;
if(!old.test(source))throw Error('M5.1 feature gate not found in compiled UI');
source=source.replace(old,'const timeBackendEnabled = true;');
const index=source.lastIndexOf('mountApp();');
if(index<0)throw Error('Cloud test mount missing');
const adapter=`
mockDb.tasks.push({...mockDb.tasks[0],id:'55555555-5555-4555-8555-555555555555',title:'Second task for switching',parent:null});
mockDb.sessionRecords=new Map();
mockDb.activeTimeId=null;
function sessionState(row){
 return {...row,serverNow:new Date().toISOString()};
}
cloudApi.getTimeState=async()=>{
 const totals={};
 for(const entry of mockDb.sessionRecords.values()){
  if(entry.taskId)totals[entry.taskId]=(totals[entry.taskId]||0)+entry.accumulatedMs;
 }
 return {session:mockDb.activeTimeId?sessionState(mockDb.sessionRecords.get(mockDb.activeTimeId)):null,taskTotals:totals};
};
cloudApi.changeTimeSession=async(action,sessionId,revision,taskId,previousId)=>{
 const current=mockDb.activeTimeId?mockDb.sessionRecords.get(mockDb.activeTimeId):null;
 const now=Date.now(),when=new Date(now).toISOString();
 if(action==='start'||action==='switch'){
  const existing=mockDb.sessionRecords.get(sessionId);
  if(existing){
   if(existing.taskId!==taskId)throw Object.assign(Error('Session collision'),{status:409});
   return sessionState(existing);
  }
  if(!mockDb.tasks.some(t=>t.id===taskId&&t.status==='open'))throw Object.assign(Error('Task unavailable'),{status:409});
  if(action==='start'&&current)throw Object.assign(Error('Another active timer'),{status:409});
  if(action==='switch'){
   if(!current||current.id!==previousId||current.revision!==revision)throw Object.assign(Error('Stale timer'),{status:409});
   if(current.state==='running')current.accumulatedMs+=Math.max(0,now-Date.parse(current.segmentStartedAt));
   Object.assign(current,{state:'stopped',segmentStartedAt:null,endReason:'switched',endedAt:when,revision:revision+1});
  }
  const record={id:sessionId,taskId,taskTitle:mockDb.tasks.find(t=>t.id===taskId).title,
   workspaceIdAtStart:mockDb.workspaces[0].id,state:'running',startedAt:when,segmentStartedAt:when,
   accumulatedMs:0,revision:1,endedAt:null,endReason:null};
  mockDb.sessionRecords.set(sessionId,record);mockDb.activeTimeId=sessionId;
  return sessionState(record);
 }
 if(!current||current.id!==sessionId||current.revision!==revision)throw Object.assign(Error('Stale timer'),{status:409});
 if(action==='pause'&&current.state!=='running')throw Object.assign(Error('Not running'),{status:409});
 if(action==='resume'&&current.state!=='paused')throw Object.assign(Error('Not paused'),{status:409});
 if(current.state==='running'&&(action==='stop'||action==='pause'))
  current.accumulatedMs+=Math.max(0,now-Date.parse(current.segmentStartedAt));
 if(action==='pause')Object.assign(current,{state:'paused',segmentStartedAt:null});
 if(action==='resume')Object.assign(current,{state:'running',segmentStartedAt:when});
 if(action==='stop'){
  Object.assign(current,{state:'stopped',segmentStartedAt:null,endedAt:when,endReason:'stopped'});
  mockDb.activeTimeId=null;
 }
 current.revision++;
 return sessionState(current);
};
`;
fs.writeFileSync('tests/.harness/m51-app.js',source.slice(0,index)+adapter+source.slice(index));
fs.copyFileSync('tests/.harness/m42.css','tests/.harness/m51.css');
