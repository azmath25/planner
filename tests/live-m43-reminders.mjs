import test from 'node:test';
import assert from 'node:assert/strict';
const BASE='https://br-shiny-king-b9np2anx-dayframeapi.compute.c-7.eu-central-1.aws.neon.tech';
const WORKER='https://br-shiny-king-b9np2anx-dayframedue.compute.c-7.eu-central-1.aws.neon.tech';
const ID='44444444-4444-4444-8444-444444444444';
const req=(url,method='GET',headers={},body)=>fetch(url,{
 method,headers:{...headers,...(body===undefined?{}:{'content-type':'application/json'})},
 ...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',
 signal:AbortSignal.timeout(20000),cache:'no-store'
});
test('M4.3 deployed API healthy and unauthorized for all new routes',async()=>{
 const health=await req(BASE+'/health');assert.equal(health.status,200);
 const routes=[
 [BASE+'/v1/alerts?timeZone=Asia%2FBaku','GET'],
 [BASE+'/v1/notification-preferences','GET'],
 [BASE+'/v1/notification-preferences','PUT',{timeZone:'Asia/Baku'}],
 [BASE+'/v1/push-subscription','PUT',{endpoint:'https://fcm.googleapis.com/fcm/send/foobar'}],
 [BASE+'/v1/push-subscription','DELETE',{endpoint:'https://fcm.googleapis.com/fcm/send/foobar'}],
 [BASE+'/v1/alerts/'+ID+'/reminder','POST',{day:'2026-11-07',time:'09:00',revision:0,action:'acknowledge'}]
 ];
 for(const [url,method,body] of routes){
  for(const auth of [undefined,'Bearer bogus.jwt.token']){
   const res=await req(url,method,auth?{Authorization:auth}:{},body);
   assert.equal(res.status,401,method+' '+url+' with '+(auth?'bogus':'no')+' credentials');
  }
 }
});
test('M4.3 new routes have restricted browser CORS',async()=>{
 for(const path of ['/v1/alerts','/v1/notification-preferences','/v1/push-subscription']){
  const good=await req(BASE+path,'OPTIONS',{origin:'https://azmath25.github.io'});
  assert.equal(good.status,204);
  assert.equal(good.headers.get('access-control-allow-origin'),'https://azmath25.github.io');
  const blocked=await req(BASE+path,'OPTIONS',{origin:'https://attacker.example'});
  assert.equal(blocked.status,403);
  assert.equal(blocked.headers.get('access-control-allow-origin'),null);
 }
});
test('M4.3 worker rejects non-trigger public invocations',async()=>{
 const noHeader=await req(WORKER+'/dispatch','POST',{}, {version:1});
 assert.equal(noHeader.status,403);
 const get=await req(WORKER+'/dispatch');
 assert.equal(get.status,404);
});
