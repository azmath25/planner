import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,DOCUMENT_DETAIL_SQL} from '../src/index.mjs';
const ID='d1111111-1111-4111-8111-111111111111';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XCPsAAAAASUVORK5CYII=';
function setup(){
 const calls=[];
 const handler=createHandler({
  verifyToken:async token=>token,
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql===DOCUMENT_DETAIL_SQL)return {rows:args[0]==='alice'?[{id:ID}]:[]};
   if(sql.includes('SELECT slot,mime,encode(image_bytes'))return {rows:[{slot:0,mime:'image/png',base64:png}]};
   if(sql.includes('INSERT INTO dayframe.document_photos'))return {rows:[]};
   if(sql.includes('DELETE FROM dayframe.document_photos'))return {rows:[]};
   throw Error('Unexpected SQL: '+sql.slice(0,120));
  }
 });
 const fetch=(method,identity,body,query='')=>handler.fetch(
  new Request('https://invalid.example/v1/documents/'+ID+'/attachments'+query,{
   method,headers:{...(identity?{authorization:'Bearer '+identity}:{}),
    ...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  }));
 return {fetch,calls};
}
test('document photo endpoint requires authentication and rejects nonowners before images',async()=>{
 const {fetch,calls}=setup();
 assert.equal((await fetch('GET',null)).status,401);
 assert.equal((await fetch('GET','bob')).status,404);
 assert.equal((await fetch('PUT','bob',{slot:0,data:'data:image/png;base64,'+png})).status,404);
 assert.ok(calls.every(x=>x.args?.[0]!=='bob'||x.sql===DOCUMENT_DETAIL_SQL));
});
test('private document photos accept bounded images and return a self-contained list',async()=>{
 const {fetch,calls}=setup();
 const saved=await fetch('PUT','alice',{slot:1,data:'data:image/png;base64,'+png});
 assert.equal(saved.status,200);
 const insert=calls.find(x=>x.sql.includes('INSERT INTO dayframe.document_photos'));
 assert.ok(insert);
 assert.equal(insert.args[0],'alice');assert.equal(insert.args[2],1);
 assert.match(insert.sql,/owner_user_id=EXCLUDED.owner_user_id/);
 const data=await (await fetch('GET','alice')).json();
 assert.deepEqual(data.photos,[{slot:0,data:'data:image/png;base64,'+png}]);
 assert.equal((await fetch('PUT','alice',{slot:4,data:'data:image/png;base64,'+png})).status,400);
 assert.equal((await fetch('PUT','alice',{slot:1,data:'data:text/html;base64,'+png})).status,400);
 assert.equal((await fetch('PUT','alice',{slot:1,data:'data:image/png;base64,'+'A'.repeat(245000)})).status,413);
});
test('document photo removal uses exact owner, document and slot',async()=>{
 const {fetch,calls}=setup();
 assert.equal((await fetch('DELETE','alice',undefined,'?slot=2')).status,200);
 const query=calls.find(x=>x.sql.includes('DELETE FROM dayframe.document_photos'));
 assert.deepEqual(query.args,['alice',ID,2]);
 assert.equal((await fetch('DELETE','alice',undefined,'?slot=7')).status,400);
});
