/* Dayframe M4.3: generic no-payload push. No task data or secrets in this worker. */
self.addEventListener('push', event => {
 event.waitUntil(self.registration.showNotification('Dayframe reminder', {
  body:'Open Dayframe to review your due tasks and reminders.',
  tag:'dayframe-reminders',renotify:false,
  icon:'./favicon.svg',
  data:{url:self.registration.scope}
 }));
});
self.addEventListener('notificationclick', event => {
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
