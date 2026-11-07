// M7.1 account-home harness. Reuse isolated M6.1 signed-in browser fixture.
import fs from 'node:fs';
import './build-m61-harness.mjs';
const source=fs.readFileSync('tests/.harness/m61-app.js','utf8');
const index=source.lastIndexOf('mountApp();');
if(index<0)throw Error('Expected account preview mount');
const adapter=`
mockDb.pinCalls=[];
for(const item of mockDb.workspaces)item.pinned=false;
mockDb.tasks[0].pinned=true;
cloudApi.setWorkspacePinned=async (id,revision,pinned)=>{
 mockDb.pinCalls.push({id,revision,pinned});
 const workspace=mockDb.workspaces.find(w=>w.id===id);
 if(!workspace||workspace.revision!==revision)
  throw Object.assign(Error('Workspace changed'),{status:409});
 workspace.pinned=pinned;workspace.revision++;
 return {...workspace};
};
`;
fs.writeFileSync('tests/.harness/m71-app.js',source.slice(0,index)+adapter+source.slice(index));
fs.copyFileSync('tests/.harness/m61.css','tests/.harness/m71.css');
