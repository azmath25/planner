import test from 'node:test';
import assert from 'node:assert/strict';
const BASE='https://br-shiny-king-b9np2anx-dayframeapi.compute.c-7.eu-central-1.aws.neon.tech';
const ID='77777777-7777-4777-8777-777777777777';
const TASK='99999999-9999-4999-8999-999999999999';
const req=(path,method='GET',headers={},body)=>fetch(BASE+path,{
 method,headers:{...headers,...(body===undefined?{}:{'content-type':'application/json'})},
 ...(body===undefined?{}:{body:JSON.stringify(body)}),
 signal:AbortSignal.timeout(25000),redirect:'manual',cache:'no-store'
});
test('M5.1 deployed API responds and rejects unauthorized recovery',async()=>{
 const health=await req('/health');assert.equal(health.status,200);
 assert.equal((await health.json()).service,'dayframe');
 for(const auth of [null,'Bearer fake.jwt.token']){
  const headers=auth?{authorization:auth}:{};
  const result=await req('/v1/time-session','GET',headers);
  assert.equal(result.status,401,'Timer recovery must deny '+(auth?'forged':'anonymous')+' identity');
  assert.equal(result.headers.get('access-control-allow-origin'),null);
  for(const body of [
   {action:'start',sessionId:ID,taskId:TASK,revision:0},
   {action:'pause',sessionId:ID,revision:1},
   {action:'switch',sessionId:ID,taskId:TASK,previousId:TASK,revision:1}
  ]){
   const result=await req('/v1/time-session','POST',headers,body);
   assert.equal(result.status,401,'Unauthenticated timer change must be forbidden');
  }
 }
});
test('M5.1 timer endpoint only permits published GitHub Pages browser origin',async()=>{
 for(const method of ['GET','POST']){
  const okay=await req('/v1/time-session','OPTIONS',{
   origin:'https://azmath25.github.io',
   'access-control-request-method':method,
   'access-control-request-headers':'authorization,content-type'
  });
  assert.equal(okay.status,204);
  assert.equal(okay.headers.get('access-control-allow-origin'),'https://azmath25.github.io');
  const forbidden=await req('/v1/time-session','OPTIONS',{origin:'https://untrusted.example'});
  assert.equal(forbidden.status,403);
  assert.equal(forbidden.headers.get('access-control-allow-origin'),null);
 }
});
