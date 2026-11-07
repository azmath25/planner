import fs from 'node:fs';
import './build-m4-harness.mjs';
// The page uses the actual Dayframe UI and a small deterministic fake of the
// account-scoped interval API. No real accounts or database values are mutated.
const source=fs.readFileSync('tests/.harness/m4-app.js','utf8');
const index=source.lastIndexOf('mountApp();');
if(index<0)throw Error('M4 fake mount not found');
const adapter=`
mockDb.intervals=new Map();
cloudApi.listTimedIntervals=async(from,to)=>[...mockDb.intervals.values()]
  .filter(item=>item.day>=from&&item.day<=to)
  .sort((a,b)=>a.day.localeCompare(b.day)||a.start.localeCompare(b.start))
  .map(item=>({...item}));
cloudApi.saveTimedInterval=async item=>{
 const old=mockDb.intervals.get(item.id);
 if(old && item.revision!==old.revision)throw Object.assign(Error('Schedule changed on another device'),{status:409});
 if(!old && item.revision!==0)throw Object.assign(Error('Missing timed block'),{status:409});
 if([...mockDb.intervals.values()].some(other=>other.id!==item.id&&other.day===item.day&&
  other.start<item.end&&item.start<other.end))throw Object.assign(Error('This time overlaps another scheduled block. Choose a free interval.'),{status:409});
 if(!mockDb.tasks.some(task=>task.id===item.taskId&&task.status==='open'))throw Object.assign(Error('Task not open'),{status:409});
 const saved={...item,revision:old?old.revision+1:1};
 mockDb.intervals.set(item.id,saved);return {...saved};
};
cloudApi.deleteTimedInterval=async(id,revision)=>{
 const old=mockDb.intervals.get(id);
 if(!old||old.revision!==revision)throw Object.assign(Error('Schedule changed on another device'),{status:409});
 mockDb.intervals.delete(id);
};
`;
fs.writeFileSync('tests/.harness/m42-app.js',source.slice(0,index)+adapter+source.slice(index));
fs.copyFileSync('tests/.harness/m4.css','tests/.harness/m42.css');
