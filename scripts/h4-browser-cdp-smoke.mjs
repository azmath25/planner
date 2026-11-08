#!/usr/bin/env node
// H4.3 fallback: real Chromium UI smoke using Node 24 native WebSocket + CDP.
// No Playwright, browser installs, credentials, external browser requests, or DB writes.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import {setTimeout as pause} from 'node:timers/promises';

const ROOT=process.cwd(),BASE='http://127.0.0.1:4187';
const BRANCH='feature/dayframe-m53-release-20261107';
const processes=[];
let chromeProfile;
function kill(child,signal='SIGTERM'){
 if(!child||child.pid===undefined||child.exitCode!==null)return;
 try{process.kill(-child.pid,signal);}catch(e){if(e.code!=='ESRCH')throw e;}
}
async function cleanup(){
 for(const child of [...processes].reverse())kill(child);
 await pause(300);
 for(const child of processes)kill(child,'SIGKILL');
 if(chromeProfile)rmSync(chromeProfile,{recursive:true,force:true});
}
function portFree(port){
 return new Promise((resolve,reject)=>{
  const server=net.createServer();
  server.once('error',reject);
  server.listen(port,'127.0.0.1',()=>server.close(resolve));
 });
}
function launch(cmd,args){
 const child=spawn(cmd,args,{cwd:ROOT,detached:true,stdio:['ignore','pipe','pipe']});
 processes.push(child);
 let log='';
 for(const stream of [child.stdout,child.stderr])
  stream.on('data',buf=>{log=(log+buf.toString()).slice(-8000);});
 child.on('error',err=>{log+=' '+err.message;});
 return {child,logs:()=>log};
}
async function waitUntil(fn,ms=24000){
 const end=Date.now()+ms;let last;
 while(Date.now()<end){
  try{const v=await fn();if(v)return v;}catch(e){last=e;}
  await pause(120);
 }
 throw new Error('Timed out waiting for browser condition'+(last?': '+last.message:''));
}
async function build(){
 return new Promise((resolve,reject)=>{
  const p=launch('npm',['run','build']);
  const timer=setTimeout(()=>{kill(p.child);reject(Error('Build timed out. '+p.logs().slice(-1500)));},90000);
  p.child.once('error',e=>{clearTimeout(timer);reject(e);});
  p.child.once('close',code=>{
   clearTimeout(timer);
   code===0?resolve():reject(Error('Build failed: '+p.logs().slice(-3200)));
  });
 });
}
class CDP{
 constructor(socket){
  this.socket=socket;this.id=0;this.pending=new Map();this.handlers=[];
  socket.addEventListener('message',({data})=>{
   const m=JSON.parse(data);
   if(m.id){
    const call=this.pending.get(m.id);if(!call)return;
    this.pending.delete(m.id);clearTimeout(call.timer);
    m.error?call.reject(Error(m.error.message)):call.resolve(m.result||{});
   }else if(m.method)for(const f of this.handlers)f(m);
  });
  socket.addEventListener('close',()=>{
   for(const call of this.pending.values()){clearTimeout(call.timer);call.reject(Error('CDP disconnected'));}
   this.pending.clear();
  });
 }
 send(method,params={},sessionId){
  return new Promise((resolve,reject)=>{
   const id=++this.id;
   const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout '+method));},20000);
   this.pending.set(id,{resolve,reject,timer});
   this.socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
 }
 on(handler){this.handlers.push(handler);}
 close(){this.socket.close();}
}
async function connect(url){
 const socket=new WebSocket(url);
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Chrome websocket timeout')),15000);
  socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
  socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Chrome websocket failed'));},{once:true});
 });
 return new CDP(socket);
}
async function evalJS(cdp,session,expression){
 const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);
 if(r.exceptionDetails)throw Error('Browser JS exception: '+r.exceptionDetails.text);
 return r.result?.value;
}
async function verify(cdp,session){
 const navigation=await cdp.send('Page.navigate',{url:BASE+'/planner/'},session);
 if(navigation.errorText)throw Error('Local browser navigation blocked: '+navigation.errorText);
 await waitUntil(()=>evalJS(cdp,session,"document.querySelector('h1')?.textContent?.includes('Welcome back')"));
 assert.ok(await evalJS(cdp,session,'!!document.querySelector(\'input[type="email"]\')'));
 assert.ok(await evalJS(cdp,session,'!!document.querySelector(\'input[type="password"]\')'));
 console.log('PASS: signed-out account form.');
 async function click(label){
  const expression="(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==="+JSON.stringify(label)+");if(!b)return false;b.click();return true})()";
  assert.equal(await evalJS(cdp,session,expression),true,'Missing button: '+label);
 }
 await click('New here? Create an account');
 await waitUntil(()=>evalJS(cdp,session,"document.querySelector('h1')?.textContent?.includes('Make room for what matters')"));
 assert.ok(await evalJS(cdp,session,'!!document.querySelector(\'input[autocomplete="name"]\')'));
 await click('Already registered? Sign in');
 await waitUntil(()=>evalJS(cdp,session,"document.querySelector('h1')?.textContent?.includes('Welcome back')"));
 console.log('PASS: sign-up / sign-in navigation.');
 await click('Open local demo without signing in');
 await waitUntil(()=>evalJS(cdp,session,'!!document.querySelector(\'[data-react-host="local-preview"] .mobile-nav [data-page="tasks"]\')'));
 console.log('PASS: Dayframe local demo and task navigation.');
 for(const width of [320,390,768,1440]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width<=390},session);
  await pause(200);
  const size=await evalJS(cdp,session,'({width:innerWidth,scroll:document.documentElement.scrollWidth})');
  assert.ok(size.scroll<=size.width+4,'Horizontal overflow at '+width+': '+JSON.stringify(size));
 }
 console.log('PASS: responsive widths 320/390/768/1440.');
}
async function main(){
 const branch=execFileSync('git',['branch','--show-current'],{cwd:ROOT,encoding:'utf8'}).trim();
 assert.equal(branch,BRANCH,'Only the Dayframe feature branch is allowed.');
 assert.ok(Number(process.versions.node.split('.')[0])>=24,'Node 24+ required');
 assert.ok(existsSync(join(ROOT,'node_modules')),'node_modules missing; no installs performed');
 const chrome=['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(existsSync);
 assert.ok(chrome,'An existing system Chromium is required; none is installed automatically.');
 await portFree(4187);
 console.log('Building Dayframe feature frontend without deploying...');
 await build();
 console.log('PASS: Vite frontend build.');
 const preview=launch('npm',['run','preview','--','--port','4187','--strictPort']);
 await waitUntil(async()=>{
  if(preview.child.exitCode!==null)throw Error(preview.logs());
  const r=await fetch(BASE+'/planner/',{signal:AbortSignal.timeout(1500)});
  return r.status===200;
 },30000);
 console.log('PASS: loopback-only Vite preview.');
 chromeProfile=mkdtempSync(join(tmpdir(),'dayframe-h43-cdp-'));
 const processChrome=launch(chrome,[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--no-first-run','--no-default-browser-check','--no-proxy-server','--disable-background-networking',
  '--disable-sync','--disable-extensions','--disable-component-update',
  '--disable-features=Translate,MediaRouter,OptimizationHints',
  '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
  '--user-data-dir='+chromeProfile,'about:blank'
 ]);
 const port=await waitUntil(()=>{
  if(processChrome.child.exitCode!==null)throw Error(processChrome.logs());
  const path=join(chromeProfile,'DevToolsActivePort');
  return existsSync(path)?Number(readFileSync(path,'utf8').split('\n')[0]):null;
 },25000);
 const response=await fetch('http://127.0.0.1:'+port+'/json/version',{signal:AbortSignal.timeout(3000)});
 assert.equal(response.status,200);
 const metadata=await response.json();
 const address=new URL(metadata.webSocketDebuggerUrl);
 assert.ok(['127.0.0.1','localhost'].includes(address.hostname));
 assert.equal(Number(address.port),port);
 const cdp=await connect(address.href);
 try{
  const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
  let unexpected;
  cdp.on(m=>{
   if(m.sessionId!==sessionId)return;
   if(m.method==='Runtime.exceptionThrown')unexpected||=m.params?.exceptionDetails?.text;
   if(m.method==='Fetch.requestPaused'){
    const {requestId,request}=m.params;
    const allowed=request.url.startsWith(BASE+'/');
    const method=allowed?'Fetch.continueRequest':'Fetch.failRequest';
    const params=allowed?{requestId}:{requestId,errorReason:'BlockedByClient'};
    void cdp.send(method,params,sessionId).catch(e=>{unexpected||=e.message;});
   }
  });
  await cdp.send('Page.enable',{},sessionId);
  await cdp.send('Runtime.enable',{},sessionId);
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]},sessionId);
  await verify(cdp,sessionId);
  assert.ok(!unexpected,'Unexpected browser error: '+unexpected);
  console.log('PASS H4.3: real UI via Chromium without Playwright.');
  console.log('NOT TESTED: live login/JWT, Safari, Neon migrations or deployment.');
 }finally{cdp.close();}
}
// Interrupts should never orphan a test-owned preview or Chromium process.
let interrupted=false;
for(const signal of ['SIGINT','SIGTERM']){
 process.once(signal,()=>{
  if(interrupted)return;
  interrupted=true;
  void cleanup().finally(()=>process.exit(signal==='SIGINT'?130:143));
 });
}
try{await main();}catch(error){console.error('FAIL H4.3: '+(error.stack||error.message));process.exitCode=1;}
finally{if(!interrupted)await cleanup();}
