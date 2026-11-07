import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync('web/public/sw.js','utf8');
function harness(){
 const events={},requests=[],stored=new Map(),deleted=[],notifications=[];
 const scope='https://example.invalid/planner/';
 const mockCache={
  addAll:async urls=>{for(const url of urls)stored.set(url,{asset:true,url});},
  put:async(req,reply)=>{stored.set(req.url,reply);},
 };
 const caches={
  open:async()=>mockCache,
  keys:async()=>['dayframe-public-older','dayframe-public-v1','foreign-cache'],
  delete:async key=>{deleted.push(key);return true;},
  match:async input=>stored.get(typeof input==='string'?input:input.url)
 };
 const self={
  registration:{scope,showNotification:async(title,opts)=>{notifications.push({title,opts});}},
  addEventListener:(name,fn)=>{events[name]=fn;},
  clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async()=>{}},
  skipWaiting:async()=>{},
  location:{origin:'https://example.invalid'}
 };
 const fetch=async(req)=>{
  requests.push(req.url);
  if(req.mode==='navigate')throw Error('offline');
  return {ok:true,type:'basic',url:req.url,clone(){return {...this}}};
 };
 vm.runInNewContext(script,{self,caches,fetch,URL,Response,Promise,console},
  {filename:'web/public/sw.js',timeout:1000});
 const run=async(name,event)=>{let pending;
  events[name]({...event,waitUntil:p=>pending=Promise.resolve(p),
   respondWith:p=>pending=Promise.resolve(p)});
  return pending?await pending:null;
 };
 return {scope,events,stored,deleted,requests,notifications,run};
}
test('M8.2 install precaches only public offline shell, icon and manifest',async()=>{
 const h=harness();await h.run('install',{});
 assert.deepEqual([...h.stored.keys()].sort(),[
  h.scope+'icon.svg',h.scope+'manifest.webmanifest',h.scope+'offline.html'
 ].sort());
});
test('M8.2 never stores personal APIs/auth navigation or write responses',async()=>{
 const h=harness();await h.run('install',{});
 const request=(url,mode='cors',method='GET')=>({
  url,mode,method,headers:{has:()=>false}
 });
 const privateRequest=request('https://example.invalid/v1/documents/secret');
 await h.run('fetch',{request:privateRequest});
 await h.run('fetch',{request:request('https://example.invalid/planner/api/documents')});
 await h.run('fetch',{request:request(h.scope+'anything','cors','POST')});
 assert.equal(h.requests.length,0);
 assert.equal(h.stored.size,3);
 const staticReq=request(h.scope+'assets/index-test.js');
 await h.run('fetch',{request:staticReq});
 assert.equal(h.stored.has(staticReq.url),true);
 const nav=await h.run('fetch',{request:request(h.scope,'navigate')});
 assert.equal(nav.url,h.scope+'offline.html');
 assert.equal(h.stored.has(h.scope),false,'Never cache account navigation HTML');
});
test('M8.2 push is generic; update activation must be explicit',async()=>{
 const h=harness();await h.run('install',{});
 await h.run('push',{});
 assert.equal(h.notifications.length,1);
 assert.equal(h.notifications[0].title,'Dayframe reminder');
 assert.doesNotMatch(JSON.stringify(h.notifications),/note title|account id|bearer/i);
 await h.run('activate',{});
 assert.deepEqual(h.deleted,['dayframe-public-older']);
});
