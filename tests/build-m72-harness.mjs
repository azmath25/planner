// M7.2 isolated Reports browser adapter. Reuses M7.1 account fixture.
import fs from 'node:fs';
import './build-m71-harness.mjs';
const source=fs.readFileSync('tests/.harness/m71-app.js','utf8');
const index=source.lastIndexOf('mountApp();');
if(index<0)throw Error('Missing prior account mount');
const adapter=`
mockDb.periodCalls=[];
cloudApi.getTimePeriod=async(period,anchor)=>{
 mockDb.periodCalls.push({period,anchor});
 const workspace=mockDb.workspaces[0].id;
 const task=mockDb.tasks[0].id;
 const startDay=period==='day'?anchor:
  period==='month'?anchor.slice(0,7)+'-01':'2026-11-02';
 const endDayExclusive=period==='day'?'2026-11-08':
  period==='month'?'2026-12-01':'2026-11-09';
 return {
  period,timeZone:'Asia/Baku',startDay,endDayExclusive,
  accountRecordedMs:3600000,accountLegacyEstimatedMs:600000,
  accountPlannedMinutes:120,runningIncluded:false,
  workspaces:[{workspaceId:workspace,name:'General',archived:false,
   recordedMs:3600000,legacyEstimatedMs:600000,plannedMinutes:120}],
  longTermTasks:[{taskId:task,workspaceId:workspace,title:'Write chapter',
   status:'open',recordedMs:3600000,plannedMinutes:120}]
 };
};
`;
fs.writeFileSync('tests/.harness/m72-app.js',source.slice(0,index)+adapter+source.slice(index));
fs.copyFileSync('tests/.harness/m71.css','tests/.harness/m72.css');
