import test from 'node:test';
import assert from 'node:assert/strict';
// No actual user account, keys, or writes are required for this security smoke.
const BASE='https://br-shiny-king-b9np2anx-dayframeapi.compute.c-7.eu-central-1.aws.neon.tech';
const WS='11111111-1111-4111-8111-111111111111';
const call=(path,method='GET',headers={},body)=>fetch(BASE+path,{
 method,headers:{...headers,...(body?{'content-type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{}),
 cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(25000)
});
test('M5.3 deployed API rejects anonymous and forged-JWT weekly data access',async()=>{
 const health=await call('/health');assert.equal(health.status,200);
 for(const authorization of [null,'Bearer false.jwt.token']){
  const headers=authorization?{authorization}:{};
  const weekly=await call('/v1/time-week','GET',headers);
  assert.equal(weekly.status,401);
  const save=await call('/v1/time-week/targets/'+WS,'PUT',headers,
   {targetMinutes:300,revision:0,owner_user_id:'someone-else'});
  assert.equal(save.status,401);
  const text=await save.text();
  assert.doesNotMatch(text,/postgres|SELECT|DATABASE_URL|password|secret/i);
 }
});
test('M5.3 weekly routes permit intended Pages origin only',async()=>{
 for(const route of ['/v1/time-week','/v1/time-week/targets/'+WS]){
  const okay=await call(route,'OPTIONS',{
   origin:'https://azmath25.github.io',
   'access-control-request-method':route.includes('targets')?'PUT':'GET',
   'access-control-request-headers':'authorization,content-type'
  });
  assert.equal(okay.status,204);
  assert.equal(okay.headers.get('access-control-allow-origin'),'https://azmath25.github.io');
  const denied=await call(route,'OPTIONS',{origin:'https://bad-origin.example'});
  assert.equal(denied.status,403);
 }
});
