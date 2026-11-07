import test from 'node:test';
import assert from 'node:assert/strict';
const BASE='https://br-shiny-king-b9np2anx-dayframeapi.compute.c-7.eu-central-1.aws.neon.tech';
const ID='44444444-4444-4444-8444-444444444444';
const request=(path,method='GET',headers={},body)=>fetch(BASE+path,{
 method,headers:{...headers,...(body===undefined?{}:{'content-type':'application/json'})},
 ...(body===undefined?{}:{body:JSON.stringify(body)}),
 redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)
});
test('deployed Dayframe API health',async()=>{
 const res=await request('/health');
 assert.equal(res.status,200);
 assert.equal((await res.json()).service,'dayframe');
});
test('M4.2 schedule routes deny anonymous and fabricated JWTs',async()=>{
 const paths=[
 ['/v1/timed-intervals?from=2026-11-07&to=2026-11-13','GET',undefined],
 ['/v1/timed-intervals/'+ID,'PUT',{taskId:ID,day:'2026-11-07',start:'09:00',end:'10:00',timeZone:'Asia/Baku',revision:0}],
 ['/v1/timed-intervals/'+ID,'DELETE',{revision:1}]
 ];
 for(const [path,method,body] of paths){
  for(const token of [null,'fabricated.jwt.token']){
   const headers=token?{authorization:'Bearer '+token}:{};
   const res=await request(path,method,headers,body);
   assert.equal(res.status,401,method+' '+path+' '+(token?'fabricated':'anonymous'));
   assert.equal(res.headers.get('access-control-allow-origin'),null);
  }
 }
});
test('timed interval preflight only permits approved GitHub Pages origin',async()=>{
 const path='/v1/timed-intervals/'+ID;
 for(const method of ['PUT','DELETE']){
  const res=await request(path,'OPTIONS',{
   origin:'https://azmath25.github.io',
   'access-control-request-method':method,
   'access-control-request-headers':'authorization,content-type'
  });
  assert.equal(res.status,204);
  assert.equal(res.headers.get('access-control-allow-origin'),'https://azmath25.github.io');
  assert.ok(res.headers.get('access-control-allow-methods')?.includes(method));
 }
 const blocked=await request(path,'OPTIONS',{origin:'https://untrusted.example'});
 assert.equal(blocked.status,403);
 assert.equal(blocked.headers.get('access-control-allow-origin'),null);
});
