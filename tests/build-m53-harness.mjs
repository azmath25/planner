// M5.3 UI harness: reuses the M5.2 nested time + direct-task mock,
// then injects account-owned recurring weekly targets and weekly history.
import fs from 'node:fs';
import './build-m52-harness.mjs';
const source=fs.readFileSync('tests/.harness/m52-app.js','utf8');
const index=source.lastIndexOf('mountApp();');
if(index<0)throw Error('Missing app mount');
const adapter=`
mockDb.weekTargets=new Map([
 [GENERAL,{targetMinutes:120,revision:1}],
 [PROJECT,{targetMinutes:0,revision:0}]
]);
cloudApi.getWeeklyTime=async()=>{
 const entries=mockDb.workspaces.map(w=>{
  const goal=mockDb.weekTargets.get(w.id)||{targetMinutes:0,revision:0};
  return {
   workspaceId:w.id,name:w.name,archived:Boolean(w.archivedAt),
   targetMinutes:goal.targetMinutes,revision:goal.revision,
   actualMs:w.id===GENERAL?210000:0,legacyEstimatedMs:0,
   plannedMinutes:w.id===GENERAL?90:0
  };
 });
 return {timeZone:'Asia/Baku',weekStart:'2026-11-02',weekEnd:'2026-11-09',
  workspaces:entries,accountActualMs:210000,accountLegacyEstimatedMs:0,
  accountPlannedMinutes:90};
};
cloudApi.saveWeeklyTarget=async (workspaceId,targetMinutes,revision)=>{
 const prior=mockDb.weekTargets.get(workspaceId)||{targetMinutes:0,revision:0};
 if(prior.revision!==revision)
  throw Object.assign(Error('Workspace or target changed. Refresh weekly goals.'),{status:409});
 const updated={targetMinutes,revision:revision+1};
 mockDb.weekTargets.set(workspaceId,updated);
 return {workspaceId,...updated};
};
`;
fs.writeFileSync('tests/.harness/m53-app.js',source.slice(0,index)+adapter+source.slice(index));
fs.copyFileSync('tests/.harness/m52.css','tests/.harness/m53.css');
