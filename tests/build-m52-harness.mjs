import fs from 'node:fs';
import './build-m51-harness.mjs';
// Test actual signed-in M5.2 UI using deterministic account-owned sessions.
const source=fs.readFileSync('tests/.harness/m51-app.js','utf8');
const index=source.lastIndexOf('mountApp();');
if(index<0)throw Error('Missing app mount');
const adapter=`
const ROLL_CHILD='66666666-6666-4666-8666-666666666666';
const ROLL_GRAND='99999999-9999-4999-8999-999999999999';
mockDb.tasks.push({...mockDb.tasks[0],id:ROLL_CHILD,title:'Nested subtask',parent:ROOT});
mockDb.tasks.push({...mockDb.tasks[0],id:ROLL_GRAND,title:'Grandchild task',parent:ROLL_CHILD});
for(const [id,taskId,accumulatedMs] of [
 ['88888888-8888-4888-8888-888888888881',ROOT,120000],
 ['88888888-8888-4888-8888-888888888882',ROLL_CHILD,60000],
 ['88888888-8888-4888-8888-888888888883',ROLL_GRAND,30000]
]){
 mockDb.sessionRecords.set(id,{id,taskId,taskTitle:'Previous work',
  workspaceIdAtStart:GENERAL,state:'stopped',
  startedAt:'2026-11-07T10:00:00Z',segmentStartedAt:null,
  accumulatedMs,revision:2,endedAt:'2026-11-07T10:03:00Z',
  endReason:'stopped'});
}
cloudApi.getTimeState=async()=>{
 const taskTotals={},workspaceTotals={},rollups={},active=mockDb.activeTimeId?
  mockDb.sessionRecords.get(mockDb.activeTimeId):null;
 let accountTotalMs=0,deletedTaskMs=0;
 for(const session of mockDb.sessionRecords.values()){
  const duration=session.accumulatedMs;
  accountTotalMs+=duration;
  workspaceTotals[session.workspaceIdAtStart]=(workspaceTotals[session.workspaceIdAtStart]||0)+duration;
  if(!session.taskId){deletedTaskMs+=duration;continue;}
  taskTotals[session.taskId]=(taskTotals[session.taskId]||0)+duration;
  const visited=new Set();
  let leaf=session.taskId;
  while(leaf&&!visited.has(leaf)){
   visited.add(leaf);
   rollups[leaf]=(rollups[leaf]||0)+duration;
   leaf=mockDb.tasks.find(t=>t.id===leaf)?.parent||null;
  }
 }
 const ancestorIds=[];
 if(active?.taskId){
  const visited=new Set();let id=active.taskId;
  while(id&&!visited.has(id)){visited.add(id);ancestorIds.push(id);
   id=mockDb.tasks.find(t=>t.id===id)?.parent||null;}
 }
 return {
  session:active?{...active,serverNow:new Date().toISOString()}:null,
  taskTotals,
  rollups:{
   tasks:Object.fromEntries(Object.entries(rollups).map(([id,totalMs])=>[id,{directMs:taskTotals[id]||0,totalMs}])),
   workspaces:workspaceTotals,accountTotalMs,deletedTaskMs,activeAncestorIds:ancestorIds
  }
 };
};
`;
fs.writeFileSync('tests/.harness/m52-app.js',source.slice(0,index)+adapter+source.slice(index));
fs.copyFileSync('tests/.harness/m51.css','tests/.harness/m52.css');
