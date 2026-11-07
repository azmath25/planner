// M7.3 isolated audit insights UI adapter; no Neon API calls.
import fs from 'node:fs';
import './build-m72-harness.mjs';
const source=fs.readFileSync('tests/.harness/m72-app.js','utf8');
const index=source.lastIndexOf('mountApp();');
if(index<0)throw Error('Missing account fixture mount');
const adapter=`
mockDb.insightsCalls=[];
cloudApi.getTimeInsights=async(period,anchor)=>{
 mockDb.insightsCalls.push({period,anchor});
 return {
  period,timeZone:'Asia/Baku',startDay:'2026-11-02',endDayExclusive:'2026-11-09',
  deadline:{completedEvents:3,withDeadline:2,withoutDeadline:1,onTime:1,late:1},
  estimate:{measuredTasks:2,excludedLegacyTasks:1,estimatedMinutes:60,recordedMs:2700000},
  history:[{eventId:'123',taskId:ROOT,title:'Write chapter',
   completedAt:'2026-11-07T11:00:00Z',deadline:'2026-11-07',
   deadlineTime:'16:00',onTime:true}]
 };
};
`;
fs.writeFileSync('tests/.harness/m73-app.js',source.slice(0,index)+adapter+source.slice(index));
fs.copyFileSync('tests/.harness/m72.css','tests/.harness/m73.css');
