// Build an isolated real-DOM test harness; no Neon credentials or user data.
import fs from 'node:fs';
import ts from 'typescript';
const transpile=(path)=>ts.transpileModule(fs.readFileSync(path,'utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText.replace(/^import [^\n]+\n/gm,'').replace(/^export \{\};?$/gm,'').replace(/\bexport /g,'');
const timer=transpile('web/src/domain/timeTracking.ts');
const legacy=transpile('web/src/legacy/legacy.ts');
const mock=`
const GENERAL='11111111-1111-4111-8111-111111111111';
const PROJECT='33333333-3333-4333-8333-333333333333';
const TASK='44444444-4444-4444-8444-444444444444';
const mockDb={
 workspaces:[
  {id:GENERAL,kind:'general',name:'General',subtitle:'Permanent',color:'#85a99d',cover:'general',revision:1,archivedAt:null},
  {id:PROJECT,kind:'custom',name:'Test Project',subtitle:'Saved work',color:'#85a99d',cover:'research',revision:1,archivedAt:null}
 ],
 tasks:[{id:TASK,workspace:PROJECT,title:'Example workspace task',notes:'Kept on archive',
  status:'open',priority:'medium',estimate:30,long:false,parent:null,
  deadline:null,deadlineTime:null,reminder:null,reminderTime:null,revision:1}],
};
window.__mockDb=mockDb;
window.__refreshCount=0;
const cloudApi={
 async listArchivedWorkspaces(){return mockDb.workspaces.filter(w=>w.archivedAt);},
 async archiveWorkspace(id,revision){
  const w=mockDb.workspaces.find(w=>w.id===id&&w.revision===revision&&w.kind==='custom'&&!w.archivedAt);
  if(!w)throw Error('Workspace protected or changed');
  w.archivedAt='2026-11-07T12:00:00Z';w.revision++;return {...w};
 },
 async restoreWorkspace(id,revision){
  const w=mockDb.workspaces.find(w=>w.id===id&&w.revision===revision&&w.kind==='custom'&&w.archivedAt);
  if(!w)throw Error('Workspace protected or changed');
  w.archivedAt=null;w.revision++;return {...w};
 }
};
`;
const bootstrap=`
const account={name:'QA User',email:'qa@example.invalid',onRefresh:()=>{window.__refreshCount++;mountApp();}};
let dispose;
function mountApp(){
 if(dispose)dispose();
 dispose=mountLegacyDayframe('dayframe.test.archive',{
  workspaces:mockDb.workspaces.filter(w=>!w.archivedAt).map(w=>({...w})),
  tasks:mockDb.tasks.filter(t=>mockDb.workspaces.some(w=>w.id===t.workspace&&!w.archivedAt)).map(t=>({...t}))
 },account);
}
mountApp();
`;
fs.mkdirSync('tests/.harness',{recursive:true});
fs.writeFileSync('tests/.harness/archive-app.js',timer+'\n'+mock+'\n'+legacy+'\n'+bootstrap);
fs.copyFileSync('web/src/styles.css','tests/.harness/archive.css');
