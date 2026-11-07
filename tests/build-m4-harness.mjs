import fs from 'node:fs';
import './build-m3-harness.mjs';
// Inject a versioned, account-aware day-pool fake before the first app mount.
// Its independent Map survives remounts, just like the real Neon database.
const filename='tests/.harness/m3-app.js';
const source=fs.readFileSync(filename,'utf8');
const index=source.lastIndexOf('mountApp();');
if(index<0)throw Error('Legacy test bootstrap not found');
const poolApi=`
mockDb.pools=new Map();
cloudApi.loadDailyPool=async day=>{
 const pool=mockDb.pools.get(day)||{revision:0,taskIds:[]};
 return {day,revision:pool.revision,taskIds:[...pool.taskIds]};
};
cloudApi.saveDailyPool=async(day,revision,taskIds)=>{
 const pool=mockDb.pools.get(day)||{revision:0,taskIds:[]};
 if(revision!==pool.revision)throw Object.assign(Error('Stale daily pool'),{status:409});
 if(new Set(taskIds).size!==taskIds.length||taskIds.length>100||
  taskIds.some(id=>!mockDb.tasks.some(t=>t.id===id&&t.status==='open'&&!t.deletedAt&&!t.archivedAt)))throw Object.assign(Error('Invalid selection'),{status:409});
 const saved={revision:pool.revision+1,taskIds:[...taskIds]};
 mockDb.pools.set(day,saved);
 return {day,...saved};
};
`;
fs.writeFileSync('tests/.harness/m4-app.js',source.slice(0,index)+poolApi+source.slice(index));
fs.copyFileSync('tests/.harness/m3.css','tests/.harness/m4.css');
