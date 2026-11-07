import test from 'node:test';
import assert from 'node:assert/strict';

const BASE='https://br-shiny-king-b9np2anx-dayframeapi.compute.c-7.eu-central-1.aws.neon.tech';
const DAY='/v1/daily-pool/2026-11-07';
const req=async(path,method='GET',headers={},body)=>fetch(BASE+path,{
 method,headers:{...headers,...(body===undefined?{}:{'content-type':'application/json'})},
 ...(body===undefined?{}:{body:JSON.stringify(body)}),
 signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'manual'
});

test('active M4.1 Neon API responds to health',async()=>{
 const r=await req('/health');
 assert.equal(r.status,200);
 assert.equal((await r.json()).service,'dayframe');
});

test('deployed day-pool GET and PUT reject anonymous or forged tokens',async()=>{
 for(const [method,body] of [['GET',undefined],['PUT',{revision:0,taskIds:[]}]])
  for(const token of [null,'forged.jwt.value']){
   const headers=token?{authorization:'Bearer '+token}:{};
   const r=await req(DAY,method,headers,body);
   assert.equal(r.status,401,method+' must reject '+(token?'forged':'anonymous')+' identity');
   assert.equal(r.headers.get('access-control-allow-origin'),null);
  }
});

test('Neon day-pool preflight permits PUT only from trusted Pages origin',async()=>{
 const allowed=await req(DAY,'OPTIONS',{
  origin:'https://azmath25.github.io',
  'access-control-request-method':'PUT',
  'access-control-request-headers':'authorization,content-type'
 });
 assert.equal(allowed.status,204);
 assert.equal(allowed.headers.get('access-control-allow-origin'),'https://azmath25.github.io');
 assert.match(allowed.headers.get('access-control-allow-methods')||'',/\bPUT\b/);
 const blocked=await req(DAY,'OPTIONS',{origin:'https://not-dayframe.example'});
 assert.equal(blocked.status,403);
 assert.equal(blocked.headers.get('access-control-allow-origin'),null);
});
