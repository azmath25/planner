import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler, BOOTSTRAP_SQL, LIST_SQL} from '../src/index.mjs';
function make() {
  const queries=[];
  const verifyToken=async token=>{if(!['alice','bob'].includes(token))throw Error('signature invalid'); return token;};
  const query=async(sql,args)=>{queries.push([sql,args]);return sql===LIST_SQL?{rows:[{id:args[0]+'-general',name:'General',kind:'general'}]}:{rows:[]}};
  const handler=createHandler({verifyToken,query});
  const req=(path,method='GET',headers={})=>handler.fetch(new Request('https://api.invalid'+path,{method,headers}));
  return {req,queries};
}
test('health no cache and no database operations',async()=>{
  const {req,queries}=make();const r=await req('/health');
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(queries.length,0);
});
test('unauthenticated, forged and malformed tokens denied before database access',async()=>{
  const {req,queries}=make();
  for(const path of ['/v1/me','/v1/workspaces','/v1/tasks'])for(const headers of [{},{authorization:'Bearer forged'},{'x-user-id':'alice'},{authorization:'Basic alice'}])assert.equal((await req(path,'GET',headers)).status,401);
  assert.equal(queries.length,0);
});
test('ownership derived only from verified subject; query and header spoofing ignored',async()=>{
  const {req,queries}=make();
  const a=await req('/v1/me?owner_user_id=bob','GET',{authorization:'Bearer alice'});
  assert.equal(a.status,200);assert.equal((await a.json()).generalWorkspace.id,'alice-general');
  const b=await req('/v1/workspaces','GET',{authorization:'Bearer bob','x-user-id':'alice'});
  assert.equal(b.status,200);assert.deepEqual((await b.json()).workspaces.map(w=>w.id),['bob-general']);
  assert.deepEqual(queries.map(q=>q[1]),[['alice'],['alice'],['bob'],['bob']]);
  assert.equal(queries[0][0],BOOTSTRAP_SQL);
});
test('CORS only trusts exact website origin',async()=>{
  const {req}=make();
  const valid=await req('/v1/me','OPTIONS',{origin:'https://azmath25.github.io'});
  assert.equal(valid.status,204);assert.equal(valid.headers.get('access-control-allow-origin'),'https://azmath25.github.io');
  assert.equal((await req('/v1/me','OPTIONS',{origin:'https://other.example'})).status,403);
  const denied=await req('/v1/me','GET',{origin:'https://azmath25.github.io'});
  assert.equal(denied.status,401);assert.equal(denied.headers.get('access-control-allow-origin'),'https://azmath25.github.io');
});
test('disabled writes and not-yet-implemented routes stay blocked',async()=>{
  const {req,queries}=make();
  assert.equal((await req('/v1/me','POST',{authorization:'Bearer alice'})).status,405);
  assert.equal((await req('/v1/workspaces','DELETE',{authorization:'Bearer alice'})).status,405);
  assert.equal((await req('/v1/tasks','GET',{authorization:'Bearer alice'})).status,404);
  assert.equal((await req('/unknown')).status,404);assert.equal(queries.length,0);
});
test('database errors fail closed without exposing secrets',async()=>{
  const handler=createHandler({verifyToken:async()=> 'alice',query:async()=>{throw Error('password=hidden')}});
  const r=await handler.fetch(new Request('https://api.invalid/v1/me',{headers:{authorization:'Bearer alice'}}));
  assert.equal(r.status,503);assert.equal(JSON.stringify(await r.json()).includes('password'),false);
});
