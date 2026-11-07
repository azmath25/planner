import test from 'node:test';
import assert from 'node:assert/strict';
const ROOT='https://br-shiny-king-b9np2anx-dayframeapi.compute.c-7.eu-central-1.aws.neon.tech';
async function request(path,init={}){
 const resp=await fetch(ROOT+path,{redirect:'manual',signal:AbortSignal.timeout(45000),...init});
 return {status:resp.status,headers:resp.headers,text:await resp.text()};
}
test('deployed Neon Function responds with current M2.3 stage',async()=>{
 const r=await request('/health');
 assert.equal(r.status,200);
 const data=JSON.parse(r.text);
 assert.equal(data.service,'dayframe');
 assert.equal(data.stage,'persistent-workspaces-tasks');
});
test('anonymous and forged credentials cannot access user data',async()=>{
 for(const path of ['/v1/me','/v1/workspaces','/v1/tasks','/v1/tasks/trash']){
  assert.equal((await request(path)).status,401,path);
  assert.equal((await request(path,{headers:{Authorization:'Bearer deliberately-forged'}})).status,401,path);
 }
});

test('archived workspace routes reject anonymous or forged tokens',async()=>{
 const workspaceId='33333333-3333-4333-8333-333333333333';
 const endpoints=[
  ['/v1/workspaces/archived','GET'],
  ['/v1/workspaces/'+workspaceId+'/archive','POST'],
  ['/v1/workspaces/'+workspaceId+'/restore','POST'],
 ];
 for(const [path,method] of endpoints){
  const init={method,...(method==='POST'?{headers:{'content-type':'application/json'},body:JSON.stringify({revision:1})}:{})};
  assert.equal((await request(path,init)).status,401,path);
  assert.equal((await request(path,{...init,headers:{...init.headers,Authorization:'Bearer forged.jwt.value'}})).status,401,path);
 }
});
test('allowed origin preflight and untrusted origin',async()=>{
 const ok=await request('/v1/tasks',{method:'OPTIONS',headers:{Origin:'https://azmath25.github.io','Access-Control-Request-Method':'POST'}});
 assert.equal(ok.status,204);
 assert.equal(ok.headers.get('access-control-allow-origin'),'https://azmath25.github.io');
 const denied=await request('/v1/tasks',{method:'OPTIONS',headers:{Origin:'https://not-dayframe.example'}});
 assert.equal(denied.status,403);
 assert.equal(denied.headers.get('access-control-allow-origin'),null);
});
