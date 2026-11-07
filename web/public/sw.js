/* Dayframe M8.2 public-shell offline worker.
 * Never cache API/auth tokens, private documents, note content, or write requests.
 * Offline fallback deliberately does not attempt signed-in data restoration.
 */
const PUBLIC_CACHE='dayframe-public-v1';
const SCOPE=new URL(self.registration.scope);
const OFFLINE=new URL('offline.html',SCOPE).href;
const PRE_CACHE=[OFFLINE,new URL('icon.svg',SCOPE).href,
 new URL('manifest.webmanifest',SCOPE).href];
const sameSite=(url)=>url.origin===SCOPE.origin&&url.pathname.startsWith(SCOPE.pathname);
const staticAsset=(request,url)=>
 request.method==='GET'&&sameSite(url)&&(
  url.pathname.startsWith(SCOPE.pathname+'assets/')||
  ['icon.svg','manifest.webmanifest','offline.html'].some(name=>
   url.pathname===SCOPE.pathname+name)
 );
self.addEventListener('install',event=>{
 // Do not skipWaiting automatically: an open BlockNote draft may be unsaved.
 event.waitUntil(caches.open(PUBLIC_CACHE).then(cache=>cache.addAll(PRE_CACHE)));
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(name=>name.startsWith('dayframe-public-')&&name!==PUBLIC_CACHE)
   .map(name=>caches.delete(name)));
  await self.clients.claim();
 })());
});
self.addEventListener('message',event=>{
 if(event.data?.type==='DAYFRAME_ACTIVATE_UPDATE'){
  event.waitUntil(self.skipWaiting());
 }
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(!sameSite(url))return;
 if(request.mode==='navigate'){
  // Navigation responses are NOT cached; only a generic offline page is.
  event.respondWith(fetch(request,{cache:'no-store'})
   .catch(async()=>await caches.match(OFFLINE)||
    new Response('Offline. Reconnect to use Dayframe.',{status:503,headers:{'content-type':'text/plain'}})));
  return;
 }
 if(!staticAsset(request,url))return;
 event.respondWith((async()=>{
  const cached=await caches.match(request);
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok&&response.type==='basic'&&!request.headers.has('authorization')){
   const cache=await caches.open(PUBLIC_CACHE);
   await cache.put(request,response.clone());
  }
  return response;
 })());
});
// Generic, payload-free Web Push; the notification never exposes account text.
self.addEventListener('push',event=>{
 event.waitUntil(self.registration.showNotification('Dayframe reminder',{
  body:'Open Dayframe to review your due tasks and reminders.',
  tag:'dayframe-reminders',renotify:false,
  data:{url:self.registration.scope}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const url=self.registration.scope;
  const clientsList=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clientsList){
   if(client.url.startsWith(url)){await client.focus();return;}
  }
  await self.clients.openWindow(url);
 })());
});
