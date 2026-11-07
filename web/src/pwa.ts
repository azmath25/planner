// Public-shell PWA registration. Private account state stays outside caches.
// The worker remains waiting until the user explicitly permits an update;
// preserve an unsaved document draft across controller changes.
let draftPending=false;
let prompt:HTMLElement|null=null;
let reloadAfterUpdate=false;
let updateButton:HTMLButtonElement|null=null;
let updateAdvice:HTMLElement|null=null;
window.addEventListener('dayframe:draft-state',(event:Event)=>{
 draftPending=Boolean((event as CustomEvent<{dirty:boolean}>).detail?.dirty);
 if(updateButton)updateButton.disabled=draftPending;
 if(updateAdvice)updateAdvice.textContent=draftPending?
  'Save or export your unsaved document draft first.':'The app will reload when updated.';
});
function showUpdate(worker:ServiceWorker){
 if(prompt){prompt.remove();prompt=null;}
 const panel=document.createElement('aside');
 panel.setAttribute('role','status');
 panel.setAttribute('aria-label','Dayframe update available');
 panel.style.cssText='position:fixed;bottom:18px;right:18px;z-index:10000;max-width:350px;'+
  'background:#fff;color:#163a33;border:1px solid #cedfd4;border-radius:14px;'+
  'box-shadow:0 8px 25px #0002;padding:13px 15px;font:14px/1.4 system-ui';
 const label=document.createElement('span');
 label.textContent='A newer version of Dayframe is ready. ';
 const button=document.createElement('button');
 button.textContent='Update app';
 button.type='button';
 button.style.cssText='margin-top:8px;padding:8px 12px;border:0;border-radius:8px;'+
  'background:#1f6257;color:white;cursor:pointer';
 button.disabled=draftPending;
 button.setAttribute('aria-describedby','dayframe-update-advice');
 const advice=document.createElement('small');
 advice.id='dayframe-update-advice';
 advice.style.display='block';
 advice.textContent=draftPending?'Save or export your unsaved document draft first.':'The app will reload when updated.';
 button.onclick=()=>{
  if(draftPending||worker.state!=='installed')return;
  reloadAfterUpdate=true;
  button.disabled=true;
  worker.postMessage({type:'DAYFRAME_ACTIVATE_UPDATE'});
 };
 panel.append(label,button,advice);
 document.body.appendChild(panel);prompt=panel;
 updateButton=button;updateAdvice=advice;
}
export async function registerDayframePwa():Promise<void>{
 if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
 try{
  const scope=new URL('./',document.baseURI);
  const registration=await navigator.serviceWorker.register(
   new URL('sw.js',scope).href,{scope:scope.pathname}
  );
  if(registration.waiting&&navigator.serviceWorker.controller)
   showUpdate(registration.waiting);
  registration.addEventListener('updatefound',()=>{
   const installing=registration.installing;
   if(!installing)return;
   installing.addEventListener('statechange',()=>{
    if(installing.state==='installed'&&navigator.serviceWorker.controller)
     showUpdate(installing);
   });
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
   if(reloadAfterUpdate&&!draftPending)window.location.reload();
   else reloadAfterUpdate=false;
  });
 }catch{
  // Secure contexts, corporate policies and some private modes may block SWs.
  // Keep online mode functional without requiring push/PWA support.
 }
}
