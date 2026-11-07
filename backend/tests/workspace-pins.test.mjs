import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,WORKSPACE_PIN_SQL} from '../src/index.mjs';

const id='a1111111-1111-4111-8111-111111111111';
const row={
 id,kind:'custom',name:'Research',subtitle:'',color:'#85a99d',
 cover:'research',pinned:true,revision:3,
 createdAt:'2026-11-07T00:00:00.000Z',archivedAt:null
};
function api(run){
 const calls=[];
 const handler=createHandler({
  verifyToken:async token=>{
   if(token==='alice'||token==='bob')return token;
   throw Error('Unauthorized');
  },
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql!==WORKSPACE_PIN_SQL)throw Error('Unexpected SQL');
   return run(args);
  }
 });
 const request=(method,body,token='alice')=>handler.fetch(new Request(
  'https://invalid.example/v1/workspaces/'+id+'/pin',{
   method,headers:{...(token?{authorization:'Bearer '+token}:{}),
    ...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  }));
 return {request,calls};
}
test('M7.1 workspaces pins are owner-derived, validated and revision fenced',async()=>{
 const {request,calls}=api(args=>({rows:args[0]==='alice'?[row]:[]}));
 const changed=await request('PUT',{revision:2,pinned:true,owner_user_id:'bob'});
 assert.equal(changed.status,200);
 assert.equal((await changed.json()).workspace.pinned,true);
 assert.deepEqual(calls[0],{sql:WORKSPACE_PIN_SQL,args:['alice',id,2,true]});
 assert.equal((await request('PUT',{revision:2,pinned:true},'bob')).status,409);
 assert.equal((await request('PUT',{revision:2,pinned:true},null)).status,401);
 for(const invalid of [
  {revision:0,pinned:true},{revision:2,pinned:'yes'},
  {revision:2},{revision:2,pinned:1}
 ])assert.equal((await request('PUT',invalid)).status,400);
 assert.equal((await request('GET')).status,405);
 assert.match(WORKSPACE_PIN_SQL,/owner_user_id=\$1/);
 assert.match(WORKSPACE_PIN_SQL,/revision=\$3/);
 assert.match(WORKSPACE_PIN_SQL,/archived_at IS NULL/);
});
test('M7.1 stale workspace pin yields conflict rather than changing local state',async()=>{
 const {request}=api(()=>({rows:[]}));
 const response=await request('PUT',{revision:1,pinned:false});
 assert.equal(response.status,409);
 assert.match((await response.json()).error,/changed|archived|unavailable/);
});
