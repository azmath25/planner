import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,DAY_POOL_GET_SQL,DAY_POOL_PUT_SQL} from '../src/index.mjs';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const DAY='2026-11-07';
function harness(){
 const pools=new Map(),queries=[];
 const query=async(sql,args)=>{
  queries.push({sql,args});
  const key=args[0]+':'+args[1];
  if(sql===DAY_POOL_GET_SQL){
   const pool=pools.get(key);
   return {rows:[{revision:pool?.revision??0,taskIds:pool?.taskIds||[]}]};
  }
  if(sql===DAY_POOL_PUT_SQL){
   const pool=pools.get(key)||{revision:0,taskIds:[]};
   if(pool.revision!==args[2])throw Object.assign(new Error('stale'),{code:'40001'});
   const next={revision:pool.revision+1,taskIds:[...args[3]]};
   pools.set(key,next);
   return {rows:[{revision:next.revision}]};
  }
  throw Error('Unexpected SQL path');
 };
 const verifyToken=async token=>{if(!['alice','bob'].includes(token))throw Error('Unauthorized');return token;};
 const handler=createHandler({verifyToken,query});
 const request=(path,method='GET',identity='alice',body,headers={})=>
  handler.fetch(new Request('https://example.invalid'+path,{
   method,
   headers:{...(identity?{authorization:'Bearer '+identity}:{}),
    ...(body===undefined?{}:{'content-type':'application/json'}),...headers},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  }));
 return {request,queries,pools};
}
test('M4.1 daily pools are separated by verified user and calendar date',async()=>{
 const {request,queries}=harness();
 for(const token of ['alice','bob']){
  const res=await request('/v1/daily-pool/'+DAY,'GET',token);
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{day:DAY,revision:0,taskIds:[]});
 }
 const first=await request('/v1/daily-pool/'+DAY,'PUT','alice',{revision:0,taskIds:[A,B],owner_user_id:'bob'});
 assert.equal(first.status,200);assert.equal((await first.json()).revision,1);
 const next=await request('/v1/daily-pool/'+DAY,'GET','alice');
 assert.deepEqual((await next.json()).taskIds,[A,B]);
 assert.deepEqual((await (await request('/v1/daily-pool/'+DAY,'GET','bob')).json()).taskIds,[]);
 assert.deepEqual((await (await request('/v1/daily-pool/2026-11-08','GET','alice')).json()).taskIds,[]);
 const mutation=queries.find(x=>x.sql===DAY_POOL_PUT_SQL);
 assert.deepEqual(mutation.args,['alice',DAY,0,[A,B]]);
 assert.match(DAY_POOL_PUT_SQL,/replace_daily_pool/);
 assert.match(DAY_POOL_GET_SQL,/t.owner_user_id=\$1/);
 assert.match(DAY_POOL_GET_SQL,/w.owner_user_id=\$1/);
});
test('M4.1 concurrent stale edits cannot silently overwrite saved order',async()=>{
 const {request}=harness();
 const pair=await Promise.all([
  request('/v1/daily-pool/'+DAY,'PUT','alice',{revision:0,taskIds:[A,B]}),
  request('/v1/daily-pool/'+DAY,'PUT','alice',{revision:0,taskIds:[B,A]})
 ]);
 assert.deepEqual(pair.map(x=>x.status).sort(),[200,409]);
 const saved=await (await request('/v1/daily-pool/'+DAY,'GET','alice')).json();
 assert.equal(saved.revision,1);
 assert.ok([[A,B],[B,A]].some(order=>JSON.stringify(order)===JSON.stringify(saved.taskIds)));
 assert.equal((await request('/v1/daily-pool/'+DAY,'PUT','alice',{revision:0,taskIds:[]})).status,409);
 assert.equal((await request('/v1/daily-pool/'+DAY,'PUT','alice',{revision:1,taskIds:[C,A]})).status,200);
 assert.deepEqual((await (await request('/v1/daily-pool/'+DAY,'GET','alice')).json()).taskIds,[C,A]);
});
test('M4.1 server rejects malformed date, duplicates, non-UUID, excessive and wrong revisions',async()=>{
 const {request,queries}=harness();
 const url='/v1/daily-pool/'+DAY;
 const invalid=[
  {revision:0,taskIds:[A,A]},
  {revision:0,taskIds:[A,A.toUpperCase()]},
  {revision:-1,taskIds:[A]},
  {revision:1.25,taskIds:[]},
  {revision:0,taskIds:['bad']},
  {revision:0,taskIds:[] .concat(Array.from({length:101},(_,i)=>A))},
  {revision:0,taskIds:null}
 ];
 for(const body of invalid){
  const res=await request(url,'PUT','alice',body);
  assert.equal(res.status,400,JSON.stringify(body));
 }
 assert.equal((await request('/v1/daily-pool/2026-02-30','GET','alice')).status,400);
 assert.equal((await request('/v1/daily-pool/1899-12-31','GET','alice')).status,400);
 assert.equal((await request('/v1/daily-pool/2101-01-01','GET','alice')).status,400);
 assert.equal((await request(url,'POST','alice',{revision:0,taskIds:[]})).status,405);
 assert.equal(queries.length,0);
});
test('M4.1 all reads and writes require verified JWT, despite spoofed headers',async()=>{
 const {request,queries}=harness();
 for(const path of ['/v1/daily-pool/'+DAY]){
  for(const method of ['GET','PUT']){
   const body=method==='PUT'?{revision:0,taskIds:[A]}:undefined;
   assert.equal((await request(path,method,null,body,{'x-user-id':'alice'})).status,401);
   assert.equal((await request(path,method,'forged',body)).status,401);
  }
 }
 assert.equal(queries.length,0);
});
test('M4.1 CORS limits pool writes to Dayframe GitHub Pages origin',async()=>{
 const {request}=harness();
 const url='/v1/daily-pool/'+DAY;
 const ok=await request(url,'OPTIONS',null,undefined,{origin:'https://azmath25.github.io'});
 assert.equal(ok.status,204);
 assert.equal(ok.headers.get('access-control-allow-origin'),'https://azmath25.github.io');
 assert.match(ok.headers.get('access-control-allow-methods'),/PUT/);
 const denied=await request(url,'OPTIONS',null,undefined,{origin:'https://evil.invalid'});
 assert.equal(denied.status,403);
});
