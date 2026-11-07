import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createHandler,NOTES_LIST_SQL,NOTE_BY_ID_SQL,NOTE_INSERT_SQL,
 NOTE_UPDATE_SQL,NOTE_DELETE_SQL,NOTE_RESTORE_SQL,NOTES_TRASH_SQL,NOTE_CONVERT_SQL
} from '../src/index.mjs';
const NOTE='a1111111-1111-4111-8111-111111111111';
const WS='b2222222-2222-4222-8222-222222222222';
const TASK='c3333333-3333-4333-8333-333333333333';
const item=(id=NOTE)=>({
 id,workspace:WS,title:'A note',content:'Remember this',color:'lilac',
 pinned:true,reminder:'2026-12-01',reminderTime:'14:00',
 convertedTaskId:null,convertedAt:null,deletedAt:null,revision:1,
 createdAt:'2026-11-07T00:00:00Z',updatedAt:'2026-11-07T00:00:00Z'
});
const input={workspace:WS,title:'A note',content:'Remember this',color:'lilac',
 pinned:true,reminder:'2026-12-01',reminderTime:'14:00'};
const create=async(custom={})=>{
 const calls=[];
 const handler=createHandler({
  verifyToken:async token=>{if(['owner-a','owner-b'].includes(token))return token;throw Error('Unauthorized');},
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(custom.run)return custom.run(sql,args);
   if(sql===NOTES_LIST_SQL)return {rows:args[0]==='owner-a'?[item()]:[]};
   if(sql===NOTES_TRASH_SQL)return {rows:[{...item(),deletedAt:'2026-11-07T12:00:00Z'}]};
   if(sql===NOTE_RESTORE_SQL)return {rows:[{...item(),revision:3}]};
   if(sql===NOTE_INSERT_SQL)return {rows:[item()]};
   if(sql===NOTE_BY_ID_SQL)return {rows:[item()]};
   if(sql===NOTE_UPDATE_SQL)return {rows:[{...item(),revision:2}]};
   if(sql===NOTE_DELETE_SQL)return {rows:[{id:NOTE}]};
   if(sql===NOTE_CONVERT_SQL)return {rows:[{task_id:TASK}]};
   throw Error('Unexpected SQL in notes unit test');
  }
 });
 const request=(path,method='GET',token='owner-a',body)=>{
  return handler.fetch(new Request('https://example.invalid'+path,{
   method,headers:{...(token?{Authorization:'Bearer '+token}:{}),
    ...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  }));
 };
 return {request,calls};
};
test('M6.1 notes are JWT-owner scoped; anonymous or forged token rejected',async()=>{
 const {request,calls}=await create();
 assert.equal((await request('/v1/notes','GET',null)).status,401);
 assert.equal((await request('/v1/notes','GET','forged')).status,401);
 assert.deepEqual((await (await request('/v1/notes','GET','owner-b')).json()).notes,[]);
 assert.deepEqual((await (await request('/v1/notes','GET','owner-a')).json()).notes,[item()]);
 assert.deepEqual(calls.map(c=>c.args),[['owner-b',101,0],['owner-a',101,0]]);
});
test('M6.1 create is scoped to server owner; browser owner override ignored',async()=>{
 const {request,calls}=await create();
 const res=await request('/v1/notes','POST','owner-b',{id:NOTE,...input,owner_user_id:'owner-a'});
 assert.equal(res.status,201);
 assert.equal(calls.length,1);
 assert.equal(calls[0].sql,NOTE_INSERT_SQL);
 assert.deepEqual(calls[0].args,['owner-b',NOTE,WS,'A note','Remember this','lilac',
  true,'2026-12-01','14:00']);
});
test('M6.1 update/delete revisions and conversion use owner, note ID and task ID',async()=>{
 const {request,calls}=await create({
  run:async(sql,args)=>{
   if(sql===NOTE_UPDATE_SQL)return {rows:[{...item(),revision:2}]};
   if(sql===NOTE_DELETE_SQL)return {rows:[{id:NOTE}]};
   if(sql===NOTE_CONVERT_SQL)return {rows:[{task_id:TASK}]};
   if(sql.includes('FROM dayframe.tasks WHERE'))return {rows:[{
    id:TASK,workspace:WS,title:'A note',notes:'Remember this',revision:1
   }]};
   if(sql===NOTE_BY_ID_SQL)return {rows:[{
    ...item(),convertedTaskId:TASK,convertedAt:'2026-11-07T00:00:00Z',revision:3
   }]};
   throw Error('Unexpected query');
  }
 });
 const update=await request('/v1/notes/'+NOTE,'PATCH','owner-b',{...input,revision:1});
 assert.equal(update.status,200);
 assert.deepEqual(calls[0].args,['owner-b',NOTE,WS,'A note','Remember this','lilac',
  true,'2026-12-01','14:00',1]);
 const del=await request('/v1/notes/'+NOTE,'DELETE','owner-b',{revision:2});
 assert.equal(del.status,200);
 assert.deepEqual(calls[1].args,['owner-b',NOTE,2]);
 const convert=await request('/v1/notes/'+NOTE+'/convert','POST','owner-b',{
  revision:2,taskId:TASK,estimate:60,owner_user_id:'owner-a'
 });
 assert.equal(convert.status,200);
 assert.deepEqual(calls[2].args,['owner-b',NOTE,2,TASK,60]);
 assert.equal((await convert.json()).task.id,TASK);
});
test('M6.1 note input validation and stale conversion handling',async()=>{
 const {request,calls}=await create({run:async(sql)=>{
  if(sql===NOTE_CONVERT_SQL)throw Object.assign(Error('conflict'),{code:'40001'});
  throw Error('Unexpected query');
 }});
 for(const body of [
  {...input,id:NOTE,reminder:null,reminderTime:'13:00'},
  {...input,id:NOTE,title:''},
  {...input,id:NOTE,color:'<script>'},
  {...input,id:NOTE,pinned:'yes'},
  {...input,id:'invalid'},
  {...input,id:NOTE,content:'a'.repeat(8001)}
 ]){
  const res=await request('/v1/notes','POST','owner-a',body);
  assert.equal(res.status,400);
 }
 assert.equal(calls.length,0);
 const stale=await request('/v1/notes/'+NOTE+'/convert','POST','owner-a',{
  taskId:TASK,revision:1,estimate:30
 });
 assert.equal(stale.status,409);
 assert.doesNotMatch(await stale.text(),/SQL|password|DATABASE_URL/i);
});


test('M6.1 trash listing and restore are account-owned and revision-fenced',async()=>{
 const {request,calls}=await create();
 const trash=await request('/v1/notes/trash?limit=20&offset=0','GET','owner-b');
 assert.equal(trash.status,200);
 assert.equal((await trash.json()).notes[0].deletedAt,'2026-11-07T12:00:00Z');
 assert.deepEqual(calls[0],{sql:NOTES_TRASH_SQL,args:['owner-b',21,0]});
 const restored=await request('/v1/notes/'+NOTE+'/restore','POST','owner-a',{revision:2,owner_user_id:'owner-b'});
 assert.equal(restored.status,200);
 assert.equal((await restored.json()).note.deletedAt,null);
 assert.deepEqual(calls[1],{sql:NOTE_RESTORE_SQL,args:['owner-a',NOTE,2]});
 assert.equal((await request('/v1/notes/'+NOTE+'/restore','POST','owner-a',{revision:0})).status,400);
});
test('M6.1 conflicting restore returns safe message',async()=>{
 const {request}=await create({run:async(sql)=>{
  if(sql===NOTE_RESTORE_SQL)return {rows:[]};
  throw Error('Unexpected SQL');
 }});
 const response=await request('/v1/notes/'+NOTE+'/restore','POST','owner-a',{revision:2});
 assert.equal(response.status,409);
 assert.doesNotMatch(await response.text(),/database|password|SELECT|secret/i);
});
