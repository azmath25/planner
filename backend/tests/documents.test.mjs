import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createHandler,DOCUMENT_LIST_SQL,DOCUMENT_DETAIL_SQL,DOCUMENT_INSERT_SQL,
 DOCUMENT_UPDATE_SQL,DOCUMENT_DELETE_SQL,DOCUMENT_TRASH_SQL,DOCUMENT_RESTORE_SQL,DOCUMENT_SEARCH_SQL
} from '../src/index.mjs';
import {validateDocumentBlocks,canonicalDocumentJSON} from '../src/document-blocks.mjs';
const ID='d1111111-1111-4111-8111-111111111111';
const WS='b2222222-2222-4222-8222-222222222222';
const OTHER='c3333333-3333-4333-8333-333333333333';
const blocks=[{id:'p1',type:'paragraph',props:{},content:[
 {type:'text',text:'Private text only',styles:{bold:true}}],children:[]}];
const input={id:ID,workspace:WS,taskId:null,parentId:null,title:'Planning document',blocks};
const item={...input,revision:1,createdAt:'2026-11-07T00:00:00Z',
 updatedAt:'2026-11-07T00:00:00Z',deletedAt:null};
function setup(run){
 const calls=[];
 const handler=createHandler({
  verifyToken:async token=>{if(!['alice','bob'].includes(token))throw Error('Invalid token');return token;},
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(run)return run(sql,args);
   if(sql===DOCUMENT_LIST_SQL)return {rows:args[0]==='alice'?[item]:[]};
   if(sql===DOCUMENT_DETAIL_SQL)return {rows:args[0]==='alice'?[item]:[]};
   if(sql===DOCUMENT_INSERT_SQL)return {rows:[item]};
   if(sql===DOCUMENT_UPDATE_SQL)return {rows:[{...item,revision:2}]};
   if(sql===DOCUMENT_DELETE_SQL)return {rows:[{id:ID}]};
   if(sql===DOCUMENT_TRASH_SQL)return {rows:[{...item,deletedAt:'2026-11-08T00:00:00Z'}]};
   if(sql===DOCUMENT_RESTORE_SQL)return {rows:[{...item,revision:3}]};
   throw Error('Unexpected query');
  }
 });
 const request=(path,method='GET',token='alice',body)=>handler.fetch(new Request(
  'https://invalid.example'+path,{method,
   headers:{...(token?{authorization:'Bearer '+token}:{}),
    ...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  }));
 return {request,calls};
}
test('M6.2a private documents require JWT and scope all list/detail SQL',async()=>{
 const {request,calls}=setup();
 assert.equal((await request('/v1/documents','GET',null)).status,401);
 assert.equal((await request('/v1/documents','GET','forged')).status,401);
 assert.equal((await request('/v1/documents/'+ID,'GET','bob')).status,404);
 const res=await request('/v1/documents?workspace='+WS+'&limit=10');
 assert.equal(res.status,200);
 assert.equal((await res.json()).documents[0].title,'Planning document');
 assert.deepEqual(calls.at(-1),{sql:DOCUMENT_LIST_SQL,args:['alice',WS,null,11,0]});
 assert.match(DOCUMENT_LIST_SQL,/d.owner_user_id=\$1/);
 assert.match(DOCUMENT_DETAIL_SQL,/d.owner_user_id=\$1/);
});
test('M6.2a create uses JWT owner and caller UUID; update/delete are revision-fenced',async()=>{
 const {request,calls}=setup();
 const create=await request('/v1/documents','POST','alice',{...input,owner_user_id:'bob'});
 assert.equal(create.status,201);
 assert.deepEqual(calls[0],{sql:DOCUMENT_INSERT_SQL,args:[
  'alice',ID,WS,null,null,'Planning document',JSON.stringify(blocks)]});
 const upd=await request('/v1/documents/'+ID,'PATCH','alice',{...input,revision:1});
 assert.equal(upd.status,200);
 assert.equal(calls[1].sql,DOCUMENT_UPDATE_SQL);
 assert.equal(calls[1].args[7],1);
 const del=await request('/v1/documents/'+ID,'DELETE','alice',{revision:2});
 assert.equal(del.status,200);
 assert.deepEqual(calls[2],{sql:DOCUMENT_DELETE_SQL,args:['alice',ID,2]});
});
test('M6.2a unsupported embeds, links, HTML props and huge blocks are rejected',async()=>{
 const {request,calls}=setup();
 for(const bad of [
  [{type:'image',id:'p1',props:{url:'https://example.com/anything'},content:[],children:[]}],
  [{type:'paragraph',props:{dangerouslySetInnerHTML:'<script>'},content:[],children:[]}],
  [{type:'paragraph',props:{},content:[{type:'link',href:'javascript:alert(1)',content:[]}],children:[]}],
  Array(251).fill({type:'paragraph',props:{},content:[],children:[]}),
  [{type:'paragraph',props:{},content:[{type:'text',text:'X'.repeat(10001),styles:{}}],children:[]}]
 ]){
  assert.throws(()=>validateDocumentBlocks(bad),/Unsupported document blocks/);
  assert.equal((await request('/v1/documents','POST','alice',{...input,blocks:bad})).status,400);
 }
 assert.equal(calls.length,0);
 assert.equal(canonicalDocumentJSON({b:2,a:[{d:4,c:3}]}),
  canonicalDocumentJSON({a:[{c:3,d:4}],b:2}));
});
test('M6.2a exact uncertain POST can reconcile existing document but changed payload conflicts',async()=>{
 const {request,calls}=setup(async(sql)=>{
  if(sql===DOCUMENT_INSERT_SQL)return {rows:[]};
  if(sql===DOCUMENT_DETAIL_SQL)return {rows:[item]};
  throw Error('Unexpected query');
 });
 assert.equal((await request('/v1/documents','POST','alice',input)).status,200);
 assert.equal((await request('/v1/documents','POST','alice',{...input,title:'Changed'})).status,409);
 assert.equal(calls.length,4);
});
test('M6.2a stale updates, leaf-only soft delete and account-scoped restore return safe conflicts',async()=>{
 const {request}=setup(async(sql)=>{
  if(sql===DOCUMENT_UPDATE_SQL||sql===DOCUMENT_DELETE_SQL||sql===DOCUMENT_RESTORE_SQL)return {rows:[]};
  throw Error('Unexpected query');
 });
 const update=await request('/v1/documents/'+ID,'PATCH','bob',{...input,revision:1});
 assert.equal(update.status,409);
 assert.equal((await request('/v1/documents/'+ID,'DELETE','bob',{revision:1})).status,409);
 assert.equal((await request('/v1/documents/'+ID+'/restore','POST','bob',{revision:1})).status,409);
 assert.doesNotMatch(await update.text(),/SELECT|relation|password|DATABASE_URL/);
});

test('M6.3b authenticated search uses literal text and returns metadata only',async()=>{
 const {request,calls}=setup(async(sql,args)=>{
  if(sql===DOCUMENT_SEARCH_SQL)return {rows:args[0]==='alice'?[
   {id:ID,workspace:WS,taskId:null,parentId:null,title:'Planning document',
    revision:1,deletedAt:null,updatedAt:item.updatedAt,createdAt:item.createdAt}
  ]:[]};
  throw Error('Unexpected query');
 });
 const missing=await request('/v1/documents/search?q=private');
 assert.equal(missing.status,200);
 const data=await missing.json();
 assert.equal(data.documents.length,1);
 assert.equal(data.documents[0].blocks,undefined,'search must not return document bodies');
 assert.deepEqual(calls[0],{sql:DOCUMENT_SEARCH_SQL,args:['alice',null,null,'private',51,0]});
 const owner=await request('/v1/documents/search?q=private','GET','bob');
 assert.equal(owner.status,200);assert.equal((await owner.json()).documents.length,0);
 assert.equal((await request('/v1/documents/search?q=private','GET',null)).status,401);
 assert.match(DOCUMENT_SEARCH_SQL,/d.owner_user_id=\$1/);
 assert.match(DOCUMENT_SEARCH_SQL,/strpos\(lower\(d.blocks::text\),lower\(\$4\)\)/);
 assert.doesNotMatch(DOCUMENT_SEARCH_SQL,/ILIKE/);
 for(const query of ['a','x'.repeat(121),'%00']){
  const r=await request('/v1/documents/search?q='+encodeURIComponent(query));
  assert.equal(r.status,400);
 }
 assert.equal((await request('/v1/documents/search?q=math&limit=1000')).status,400);
});
test('M6.3b JSON export is owner-only, private, no-store and bounded to a single document',async()=>{
 const {request,calls}=setup();
 const unauth=await request('/v1/documents/'+ID+'/export','GET',null);
 assert.equal(unauth.status,401);
 const foreign=await request('/v1/documents/'+ID+'/export','GET','bob');
 assert.equal(foreign.status,404);
 const response=await request('/v1/documents/'+ID+'/export','GET','alice');
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type')||'',/application\/json/);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.match(response.headers.get('content-disposition')||'',/attachment/);
 assert.equal(response.headers.get('access-control-allow-origin'),null);
 const data=await response.json();
 assert.equal(data.schema,'dayframe.document.export.v1');
 assert.equal(data.document.id,ID);
 assert.equal(data.document.blocks[0].content[0].text,'Private text only');
 assert.deepEqual(calls.at(-1),{sql:DOCUMENT_DETAIL_SQL,args:['alice',ID]});
 assert.equal((await request('/v1/documents/'+ID+'/export','POST','alice',{any:'thing'})).status,405);
});

test('M6.3c document media endpoints remain disabled even with authentication',async()=>{
 const {request,calls}=setup();
 assert.equal((await request('/v1/documents/'+ID+'/attachments','POST','alice',{
  name:'malware.svg',body:'<script>alert(1)</script>'
 })).status,415);
 assert.equal((await request('/v1/documents/'+ID+'/attachments','POST',null,{
  name:'malware.svg'
 })).status,401);
 assert.equal(calls.length,0,'Do not touch the DB for unsupported binary uploads');
});
