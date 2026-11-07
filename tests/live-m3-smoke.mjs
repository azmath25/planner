import test from 'node:test';
import assert from 'node:assert/strict';

const api='https://br-shiny-king-b9np2anx-dayframeapi.compute.c-7.eu-central-1.aws.neon.tech';
const id='44444444-4444-4444-8444-444444444444';
const paths=[
 ['/v1/tasks','GET'],
 ['/v1/tasks/archived','GET'],
 ['/v1/tasks/'+id+'/events','GET'],
 ['/v1/tasks/'+id+'/archive','POST'],
 ['/v1/tasks/'+id+'/unarchive','POST'],
 ['/v1/tasks/'+id+'/move','POST'],
 ['/v1/tasks/'+id+'/permanent','DELETE'],
 ['/v1/tasks/'+id+'/media','GET'],
 ['/v1/tasks/'+id+'/media/cover','PUT']
];

async function send(path,{method='GET',headers={},body}={}){
 const res=await fetch(api+path,{
  method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(12000),redirect:'manual',cache:'no-store'
 });
 return res;
}

test('deployed API health endpoint is alive and non-sensitive',async()=>{
 const res=await send('/health');
 assert.equal(res.status,200);
 assert.equal((await res.json()).service,'dayframe');
 assert.equal(res.headers.get('cache-control'),'no-store');
});

test('every M3 task route denies anonymous and fabricated identity',async()=>{
 for(const [path,method] of paths){
  for(const token of [null,'fabricated.jwt.token']){
   const headers=token?{authorization:'Bearer '+token}:{};
   if(['PUT','POST','DELETE'].includes(method))headers['content-type']='application/json';
   const res=await send(path,{method,headers,body:method==='GET'?undefined:{}});
   assert.equal(res.status,401,method+' '+path+' should deny '+(token?'forged':'anonymous')+' identity');
   assert.equal(res.headers.get('access-control-allow-origin'),null);
  }
 }
});

test('CORS permits authenticated photo PUT only from trusted Pages origin',async()=>{
 const allowed=await send('/v1/tasks/'+id+'/media/cover',{
  method:'OPTIONS',
  headers:{origin:'https://azmath25.github.io','access-control-request-method':'PUT',
   'access-control-request-headers':'authorization,content-type'}
 });
 assert.equal(allowed.status,204);
 assert.equal(allowed.headers.get('access-control-allow-origin'),'https://azmath25.github.io');
 assert.match(allowed.headers.get('access-control-allow-methods')||'',/\bPUT\b/);
 const denied=await send('/v1/tasks/'+id+'/media/cover',{
  method:'OPTIONS',
  headers:{origin:'https://unauthorized.example','access-control-request-method':'PUT'}
 });
 assert.equal(denied.status,403);
 assert.equal(denied.headers.get('access-control-allow-origin'),null);
});
