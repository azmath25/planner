import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 createHandler,DOCUMENT_ARCHIVED_SQL,DOCUMENT_ARCHIVE_SET_SQL,
 DOCUMENT_UNARCHIVE_SQL,DOCUMENT_LIST_SQL,DOCUMENT_SEARCH_SQL,DOCUMENT_DETAIL_SQL
} from '../src/index.mjs';

const ID='d1111111-1111-4111-8111-111111111111';
const WS='b2222222-2222-4222-8222-222222222222';
const now='2026-11-09T00:00:00Z';
const archived={id:ID,workspace:WS,parentId:null,taskId:null,title:'Archived page',
 revision:2,deletedAt:null,archivedAt:now,createdAt:now,updatedAt:now};
function setup(query){
 const calls=[];
 const handler=createHandler({
  verifyToken:async token=>{if(!['alice','bob'].includes(token))throw Error('Invalid token');return token;},
  query:async(sql,args)=>{calls.push({sql,args});return query(sql,args);}
 });
 const request=(path,method='GET',token='alice',body)=>handler.fetch(new Request(
  'https://invalid.example'+path,{method,headers:{
   ...(token?{authorization:'Bearer '+token}:{}),
   ...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  }));
 return {request,calls};
}

test('Archive and unarchive require owner identity and observed revisions',async()=>{
 const {request,calls}=setup((sql,args)=>{
  if(sql===DOCUMENT_ARCHIVE_SET_SQL)return {rows:args[0]==='alice'?[archived]:[]};
  if(sql===DOCUMENT_UNARCHIVE_SQL)return {rows:args[0]==='alice'?[{...archived,revision:3,archivedAt:null}]:[]};
  throw Error('Unexpected SQL');
 });
 assert.equal((await request('/v1/documents/'+ID+'/archive','POST',null,{revision:1})).status,401);
 assert.equal((await request('/v1/documents/'+ID+'/archive','GET')).status,405);
 assert.equal((await request('/v1/documents/'+ID+'/archive','POST','alice',{revision:0})).status,400);
 const res=await request('/v1/documents/'+ID+'/archive','POST','alice',{revision:1});
 assert.equal(res.status,200);
 assert.equal((await res.json()).document.archivedAt,now);
 assert.deepEqual(calls[0],{sql:DOCUMENT_ARCHIVE_SET_SQL,args:['alice',ID,1]});
 const restored=await request('/v1/documents/'+ID+'/unarchive','POST','alice',{revision:2});
 assert.equal(restored.status,200);
 assert.equal((await restored.json()).document.archivedAt,null);
 assert.deepEqual(calls[1],{sql:DOCUMENT_UNARCHIVE_SQL,args:['alice',ID,2]});
});
test('Archive listing is paginated, owner scoped and not deleted-document listing',async()=>{
 const {request,calls}=setup((sql,args)=>{
  assert.equal(sql,DOCUMENT_ARCHIVED_SQL);
  return {rows:args[0]==='alice'?[archived]:[]};
 });
 assert.equal((await request('/v1/documents/archive','GET',null)).status,401);
 assert.equal((await request('/v1/documents/archive','POST','alice',{revision:2})).status,405);
 const alice=await request('/v1/documents/archive?limit=2&offset=0');
 assert.equal(alice.status,200);
 assert.equal((await alice.json()).documents.length,1);
 assert.deepEqual(calls[0],{sql:DOCUMENT_ARCHIVED_SQL,args:['alice',3,0]});
 const bob=await request('/v1/documents/archive','GET','bob');
 assert.equal(bob.status,200);
 assert.equal((await bob.json()).documents.length,0);
 assert.equal((await request('/v1/documents/archive?limit=1000')).status,400);
});
test('Archive SQL preserves leaf-only, owner-bound and parent recovery semantics',()=>{
 assert.match(DOCUMENT_ARCHIVE_SET_SQL,/d.owner_user_id=\$1/);
 assert.match(DOCUMENT_ARCHIVE_SET_SQL,/d.revision=\$3/);
 assert.match(DOCUMENT_ARCHIVE_SET_SQL,/NOT EXISTS\(SELECT 1 FROM dayframe.documents child/);
 assert.match(DOCUMENT_ARCHIVE_SET_SQL,/child.archived_at IS NULL/);
 assert.match(DOCUMENT_UNARCHIVE_SQL,/d.owner_user_id=\$1/);
 assert.match(DOCUMENT_UNARCHIVE_SQL,/parent.archived_at IS NULL/);
 assert.match(DOCUMENT_LIST_SQL,/d.archived_at IS NULL/);
 assert.match(DOCUMENT_SEARCH_SQL,/d.archived_at IS NULL/);
 assert.match(DOCUMENT_DETAIL_SQL,/d.archived_at IS NULL/);
 assert.match(DOCUMENT_ARCHIVED_SQL,/d.archived_at IS NOT NULL/);
 const migration=readFileSync(new URL('../db/migrations/0023_document_archive.sql',import.meta.url),'utf8');
 assert.match(migration,/ADD COLUMN IF NOT EXISTS archived_at/);
 assert.match(migration,/documents_archive_parent_guard/);
});
test('Archive restores fail safely on changed revision or foreign ownership',async()=>{
 const {request}=setup(()=>({rows:[]}));
 for(const route of ['archive','unarchive']){
  const response=await request('/v1/documents/'+ID+'/'+route,'POST','bob',{revision:7});
  assert.equal(response.status,409);
  assert.doesNotMatch(await response.text(),/DATABASE_URL|SELECT|password/);
 }
});
