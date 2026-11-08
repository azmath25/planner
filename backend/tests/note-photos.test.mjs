import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,NOTE_BY_ID_SQL} from '../src/index.mjs';
const ID='d1111111-1111-4111-8111-111111111111';
const tiny='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XCPsAAAAASUVORK5CYII=';
function setup(){
 const calls=[];
 const handler=createHandler({
  verifyToken:async token=>{
   if(!['alice','bob'].includes(token))throw Error('Invalid token');
   return token;
  },
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql===NOTE_BY_ID_SQL)return {rows:args[0]==='alice'?[{id:ID}]:[]};
   if(sql.includes('SELECT mime,encode(image_bytes'))return {rows:[{mime:'image/png',base64:tiny}]};
   if(sql.includes('INSERT INTO dayframe.note_photos'))return {rows:[{note_id:ID}]};
   if(sql.includes('DELETE FROM dayframe.note_photos'))return {rows:[]};
   throw Error('Unexpected query '+sql.slice(0,80));
  }
 });
 const send=(method,token='alice',body)=>handler.fetch(new Request('https://invalid.example/v1/notes/'+ID+'/photo',{
  method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 }));
 return {send,calls};
}
test('photo operations require authentication and note ownership',async()=>{
 const {send,calls}=setup();
 assert.equal((await send('GET',null)).status,401);
 assert.equal((await send('GET','bob')).status,404);
 assert.equal((await send('PUT','bob',{data:'data:image/png;base64,'+tiny})).status,404);
 assert.ok(calls.every(x=>x.args[0]!=='bob'||x.sql===NOTE_BY_ID_SQL));
});
test('photo upload uses guarded owner-scoped SQL and bounded image validation',async()=>{
 const {send,calls}=setup();
 const result=await send('PUT','alice',{data:'data:image/png;base64,'+tiny});
 assert.equal(result.status,200);
 const put=calls.find(x=>x.sql.includes('INSERT INTO dayframe.note_photos'));
 assert.ok(put);assert.match(put.sql,/owner_user_id=EXCLUDED.owner_user_id/);
 assert.equal(put.args[0],'alice');
 assert.equal(put.args[1],ID);
 assert.equal((await send('PUT','alice',{data:'data:text/html;base64,'+tiny})).status,400);
 assert.equal((await send('PUT','alice',{data:'data:image/png;base64,QUFBQUFBQUFBQUFBQUFB'})).status,400);
 assert.equal((await send('PUT','alice',{data:'data:image/png;base64,'+'A'.repeat(245000)})).status,413);
});
test('private photo download and deletion remain scoped to note owner',async()=>{
 const {send,calls}=setup();
 const get=await send('GET');
 assert.equal(get.status,200);
 assert.equal((await get.json()).photo.data,'data:image/png;base64,'+tiny);
 assert.equal((await send('DELETE')).status,200);
 const del=calls.find(x=>x.sql.includes('DELETE FROM dayframe.note_photos'));
 assert.ok(del);assert.deepEqual(del.args,['alice',ID]);
});
