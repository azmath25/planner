import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker,{makeVapidAuthorization,isApprovedPushEndpoint,dispatchDue,PUSH_QUIET_SQL,createDispatchHandler} from '../src/reminder-dispatch.mjs';

test('M4.3 Web Push endpoint allowlist rejects SSRF and credentialed origins',()=>{
 for(const url of ['http://fcm.googleapis.com/test','https://127.0.0.1/push',
  'https://fcm.googleapis.com.attacker.test/push','https://user:secret@fcm.googleapis.com/push',
  'https://fcm.googleapis.com:8443/push','https://fcm.googleapis.com/push#fragment'])
  assert.equal(isApprovedPushEndpoint(url),false,url);
 for(const url of ['https://fcm.googleapis.com/fcm/send/test',
  'https://updates.push.services.mozilla.com/wpush/v2/test',
  'https://web.push.apple.com/test'])
  assert.equal(isApprovedPushEndpoint(url),true,url);
});
test('M4.3 VAPID ES256 signature authenticates for the correct push audience',()=>{
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const pub=publicKey.export({format:'jwk'}),pri=privateKey.export({format:'jwk'});
 const publicRaw=Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,'base64url'),Buffer.from(pub.y,'base64url')]).toString('base64url');
 const endpoint='https://fcm.googleapis.com/fcm/send/test';
 const header=makeVapidAuthorization(endpoint,pri.d,1790000000,publicRaw);
 assert.ok(header.startsWith('vapid t='));
 const [jwtPart,keyPart]=header.slice(8).split(', k=');
 assert.equal(keyPart,publicRaw);
 const [head,payload,sig]=jwtPart.split('.');
 assert.deepEqual(JSON.parse(Buffer.from(head,'base64url').toString()),{typ:'JWT',alg:'ES256'});
 const claims=JSON.parse(Buffer.from(payload,'base64url').toString());
 assert.equal(claims.aud,'https://fcm.googleapis.com');
 assert.equal(claims.exp,1790003600);
 assert.equal(crypto.verify('sha256',Buffer.from(head+'.'+payload),
  {key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(sig,'base64url')),true);
});
test('M4.3 dispatch re-checks ownership/acknowledgment before ever sending',async()=>{
 const endpoint='https://web.push.apple.com/synthetic';
 let calls=0;
 const sql=async(text,args)=>{
  if(text.includes('UPDATE dayframe.notification_deliveries d SET'))
   return {rows:[{id:1,endpoint,attempts:1}]};
  if(text.includes('SELECT 1 FROM dayframe.notification_deliveries d'))return {rows:[]};
  if(text.includes("status='expired'"))return {rows:[]};
  throw Error('Unexpected query '+text.slice(0,60));
 };
 const result=await dispatchDue({sql,send:()=>{calls++;throw Error('Must not push');},privateKey:'unused'});
 assert.deepEqual(result,{claimed:1,delivered:0,expired:1,retrying:0});
 assert.equal(calls,0);
});
test('M4.3 successful push sends no task payload and marks delivery exactly once',async()=>{
 const endpoint='https://fcm.googleapis.com/fcm/send/synthetic';
 const requests=[];
 const sql=async(text,args)=>{
  if(text.includes('UPDATE dayframe.notification_deliveries d SET'))
   return {rows:[{id:2,endpoint,attempts:1}]};
  if(text.includes('SELECT 1 FROM dayframe.notification_deliveries d'))return {rows:[{'?column?':1}]};
  if(text===PUSH_QUIET_SQL)return {rows:[{not_before:new Date(0)}]};
  if(text.includes("status='delivered'"))return {rows:[]};
  throw Error('Unexpected query');
 };
 const result=await dispatchDue({
  sql,privateKey:'not-a-real-key',
  vapid:()=> 'vapid test-token',
  send:async(url,auth)=>{requests.push({url,auth});return {ok:true,status:201};}
 });
 assert.deepEqual(result,{claimed:1,delivered:1,expired:0,retrying:0});
 assert.deepEqual(requests,[{url:endpoint,auth:'vapid test-token'}]);
});

test('M4.3 reject trigger body/header mismatches before any dispatch',async()=>{
 const makeRequest=(header,body)=>new Request('https://example.invalid/dispatch',{
  method:'POST',headers:{'content-type':'application/json','x-neon-trigger-invocation-id':header},
  body:JSON.stringify(body)
 });
 const event={version:1,invocation_id:'real-invocation',trigger:{type:'schedule',name:'dayframe-reminder-dispatch'},data:{scheduled_at:'2026-11-07T12:00:00Z'}};
 const bad=await worker.fetch(makeRequest('another-invocation',event));
 assert.equal(bad.status,403);
 const missing=await worker.fetch(new Request('https://example.invalid/dispatch',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(event)
 }));
 assert.equal(missing.status,403);
 const spoofed=await worker.fetch(makeRequest('real-invocation',{...event,trigger:{...event.trigger,name:'not-dayframe'}}));
 assert.equal(spoofed.status,403);
});

test('M8.1 native Neon trigger proxy contract verifies invocation and schedule details',async()=>{
 // Native Neon drops client-supplied x-neon-* headers. The test injects
 // post-proxy requests, not publicly spoofable HTTP traffic.
 const event={version:1,invocation_id:'native-trigger-id',
  trigger:{type:'schedule',name:'dayframe-reminder-dispatch'},
  data:{scheduled_at:'2026-11-07T12:00:00Z'}};
 let taskCalls=0,noteCalls=0;
 const handler=createDispatchHandler({
  dispatchTasks:async()=>{taskCalls++;return {claimed:0,delivered:0,expired:0,retrying:0};},
  dispatchNotes:async()=>{noteCalls++;return {claimed:0,delivered:0,expired:0,retrying:0};}
 });
 const request=(header,eventBody=event)=>new Request('https://example.invalid/dispatch',{
  method:'POST',
  headers:{'content-type':'application/json',
   ...(header?{'x-neon-trigger-invocation-id':header}:{})},
  body:JSON.stringify(eventBody)
 });
 for(const invalid of [
  request(null),request('wrong-id'),
  request('native-trigger-id',{...event,trigger:{...event.trigger,name:'wrong-job'}})
 ])assert.equal((await handler.fetch(invalid)).status,403);
 assert.equal(taskCalls,0);assert.equal(noteCalls,0);
 const valid=await handler.fetch(request('native-trigger-id'));
 assert.equal(valid.status,200);
 assert.equal((await valid.json()).ok,true);
 assert.equal(taskCalls,1);assert.equal(noteCalls,1);
});
