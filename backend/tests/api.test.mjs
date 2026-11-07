import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,BOOTSTRAP_SQL,LIST_SQL} from '../src/index.mjs';

const ALICE='11111111-1111-4111-8111-111111111111';
const BOB='22222222-2222-4222-8222-222222222222';
const WS='33333333-3333-4333-8333-333333333333';
const TASK='44444444-4444-4444-8444-444444444444';
const task={id:TASK,workspace:WS,title:'Write chapter',notes:'',status:'open',priority:'medium',estimate:30,long:false,deadline:null,deadlineTime:null,reminder:null,reminderTime:null,parent:null,revision:1};
const general={id:WS,kind:'general',name:'General',subtitle:'',cover:'general',color:'#85a99d',revision:1};
function make({rejectSql=false}={}){
  const queries=[];
  const query=async(sql,args)=>{
    queries.push({sql,args});
    if(rejectSql)throw Error('database password must not appear');
    if(sql===LIST_SQL)return {rows:[{...general,id:args[0]=== 'alice'?WS:BOB}]};
    if(sql===BOOTSTRAP_SQL)return {rows:[]};
    if(sql.includes('FROM dayframe.tasks')&&sql.includes('LIMIT'))return {rows:[{...task,id:args[0]==='alice'?TASK:BOB}]};
    if(sql.startsWith('INSERT INTO dayframe.tasks'))return {rows:[{...task,id:args[1],workspace:args[2],title:args[3]}]};
    if(sql.startsWith('UPDATE dayframe.tasks t'))return {rows:[{...task,id:args[1],workspace:args[2],title:args[3],revision:args[14]+1}]};
    if(sql.startsWith('UPDATE dayframe.tasks SET deleted_at'))return {rows:[{id:args[1]}]};
    if(sql.startsWith('UPDATE dayframe.tasks SET deleted_at=NULL'))return {rows:[task]};
    if(sql.startsWith('INSERT INTO dayframe.workspaces'))return {rows:[{...general,kind:'custom',name:args[1]}]};
    if(sql.startsWith('UPDATE dayframe.workspaces'))return {rows:[{...general,kind:'custom',name:args[2],revision:args[6]+1}]};
    return {rows:[]};
  };
  const verifyToken=async value=>{if(!['alice','bob'].includes(value))throw Error('invalid token');return value;};
  const handler=createHandler({verifyToken,query});
  const req=(path,method='GET',token=null,body=null,extraHeaders={})=>
    handler.fetch(new Request('https://api.invalid'+path,{
      method,
      headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{}),...extraHeaders},
      ...(body?{body:JSON.stringify(body)}:{})
    }));
  return {req,queries};
}
test('health does not access private data',async()=>{
  const {req,queries}=make();const r=await req('/health');
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal((await r.json()).stage,'persistent-workspaces-tasks');assert.equal(queries.length,0);
});
test('missing, forged and spoofed identities are denied before DB access',async()=>{
  const {req,queries}=make();
  for(const path of ['/v1/me','/v1/workspaces','/v1/tasks','/v1/tasks/trash','/v1/tasks/'+TASK]){
    for(const token of [null,'forged'])assert.equal((await req(path,'GET',token)).status,401);
  }
  assert.equal((await req('/v1/tasks','GET',null,null,{'x-user-id':'alice'})).status,401);
  assert.equal(queries.length,0);
});
test('authenticated workspace bootstrap/list are always user scoped',async()=>{
  const {req,queries}=make();
  assert.equal((await req('/v1/me?owner_user_id=bob','GET','alice')).status,200);
  assert.equal((await req('/v1/workspaces','GET','bob',null,{'x-user-id':'alice'})).status,200);
  assert.deepEqual(queries.map(q=>q.args),[['alice'],['alice'],['bob'],['bob']]);
});
test('task list pagination binds verified identity, not query owner',async()=>{
  const {req,queries}=make();const r=await req('/v1/tasks?owner_user_id=bob&offset=7&limit=25','GET','alice');
  assert.equal(r.status,200);const body=await r.json();assert.equal(body.tasks[0].id,TASK);
  const q=queries.find(x=>x.sql.includes('FROM dayframe.tasks'));
  assert.deepEqual(q.args,['alice',26,7]);
  assert.equal((await req('/v1/tasks?offset=-1','GET','alice')).status,400);
});
test('create task requires UUID, legitimate workspace and valid form; no owner spoof',async()=>{
  const {req,queries}=make();
  const r=await req('/v1/tasks','POST','alice',{...task,owner_user_id:'bob'});
  assert.equal(r.status,201);assert.equal((await r.json()).task.title,'Write chapter');
  const q=queries.find(x=>x.sql.startsWith('INSERT INTO dayframe.tasks'));
  assert.equal(q.args[0],'alice');assert.equal(q.args[2],WS);
  assert.ok(q.sql.includes('w.owner_user_id=$1'));
  assert.equal((await req('/v1/tasks','POST','alice',{...task,id:'evil'})).status,400);
  assert.equal((await req('/v1/tasks','POST','alice',{...task,deadline:'2026-02-31'})).status,400);
  assert.equal((await req('/v1/tasks','POST','alice',{...task,workspace:'general'})).status,400);
  assert.equal((await req('/v1/tasks','POST','alice',{...task,estimate:0})).status,400);
});
test('task patch uses owner and optimistic revision; task deletion is reversible',async()=>{
  const {req,queries}=make();
  const patch=await req('/v1/tasks/'+TASK,'PATCH','alice',{...task,title:'Revised'});
  assert.equal(patch.status,200);assert.equal((await patch.json()).task.revision,2);
  const q=queries.find(x=>x.sql.startsWith('UPDATE dayframe.tasks t'));
  assert.equal(q.args[0],'alice');assert.equal(q.args[1],TASK);assert.equal(q.args[14],1);
  assert.ok(q.sql.includes('t.revision=$15'));
  assert.equal((await req('/v1/tasks/'+TASK,'DELETE','alice')).status,200);
  assert.equal((await req('/v1/tasks/'+TASK+'/restore','POST','alice')).status,200);
});
test('custom workspace creation and guarded rename',async()=>{
  const {req,queries}=make();
  assert.equal((await req('/v1/workspaces','POST','alice',{name:'Projects',subtitle:'My tasks',color:'#336699',cover:'custom'})).status,201);
  assert.equal((await req('/v1/workspaces/'+WS,'PATCH','alice',{name:'Updated',subtitle:'',color:'#336699',cover:'custom',revision:1})).status,200);
  assert.ok(queries.find(x=>x.sql.startsWith('UPDATE dayframe.workspaces')).sql.includes("kind='custom'"));
});
test('CORS restricted to the exact GitHub Pages origin',async()=>{
 const {req}=make();
 const ok=await req('/v1/tasks','OPTIONS',null,null,{origin:'https://azmath25.github.io'});
 assert.equal(ok.status,204);assert.equal(ok.headers.get('access-control-allow-origin'),'https://azmath25.github.io');
 assert.equal((await req('/v1/tasks','OPTIONS',null,null,{origin:'https://untrusted.example'})).status,403);
});
test('DB failures hide SQL and credentials',async()=>{
 const {req}=make({rejectSql:true});
 const r=await req('/v1/workspaces','GET','alice');
 assert.equal(r.status,503);assert.equal(JSON.stringify(await r.json()).includes('password'),false);
});
