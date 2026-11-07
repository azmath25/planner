import fs from 'node:fs';
import './build-m42-harness.mjs';
const source=fs.readFileSync('tests/.harness/m42-app.js','utf8');
const index=source.lastIndexOf('mountApp();');
if(index<0)throw Error('M4.2 mount not found');
const adapter=`
const localToday=new Date().toISOString().slice(0,10);
mockDb.tasks[0].reminder=localToday;
mockDb.tasks[0].reminderTime='09:00';
mockDb.alerts=[
 {taskId:ROOT,title:'Write chapter',kind:'reminder',day:localToday,time:'09:00',
  dueAt:new Date().toISOString(),revision:null,acknowledgedAt:null,snoozedUntil:null},
 {taskId:ROOT,title:'Write chapter',kind:'deadline',day:localToday,time:'19:00',
  dueAt:new Date().toISOString(),revision:null,acknowledgedAt:null,snoozedUntil:null}
];
cloudApi.listAlerts=async()=>mockDb.alerts.filter(a=>!a.acknowledgedAt&&!a.snoozedUntil).map(a=>({...a}));
cloudApi.changeAlert=async(a,action,until)=>{
 const old=mockDb.alerts.find(x=>x.taskId===a.taskId&&x.kind===a.kind&&x.day===a.day&&x.time===a.time);
 if(!old||old.revision!==a.revision)throw Object.assign(Error('Stale alert'),{status:409});
 old.revision=(old.revision||0)+1;
 if(action==='acknowledge')old.acknowledgedAt=new Date().toISOString();
 else if(action==='snooze')old.snoozedUntil=until;
 else{old.snoozedUntil=null;old.acknowledgedAt=null;}
 return old.revision;
};
`;
fs.writeFileSync('tests/.harness/m43-app.js',source.slice(0,index)+adapter+source.slice(index));
fs.copyFileSync('tests/.harness/m42.css','tests/.harness/m43.css');
