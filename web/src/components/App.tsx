import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { mountLegacyDayframe } from '../legacy/legacy';
import { authClient } from '../auth/client';
import { loadCloudSnapshot, type CloudSnapshot } from '../auth/api';
import { AuthScreen } from './AuthScreen';
import { getDemoStorageStatus } from '../domain/storage';

interface BoundaryProps {children:ReactNode}
interface BoundaryState {broken:boolean}
class ErrorBoundary extends Component<BoundaryProps,BoundaryState>{
 state:BoundaryState={broken:false};
 static getDerivedStateFromError():BoundaryState{return {broken:true};}
 componentDidCatch(error:Error,info:ErrorInfo){console.error('Dayframe failed to render',error,info.componentStack);}
 render(){
  if(this.state.broken)return <main className="fallback" role="alert">
   <h1>Dayframe could not open</h1>
   <p>Your data has not been deleted. Reload to try again.</p>
   <button onClick={()=>window.location.reload()}>Reload</button>
  </main>;
  return this.props.children;
 }
}
function Dayframe({userId,snapshot,displayName,email,onSignOut,onRefresh}:{
 userId:string;snapshot:CloudSnapshot;displayName:string;email:string;
 onSignOut:()=>Promise<void>;onRefresh:()=>void;
}){
 useEffect(()=>{
  // Cloud tasks/workspaces are the only source of truth for these records.
  // Plans, quick notes, images, and timer sessions remain labeled local previews.
  const dispose=mountLegacyDayframe('dayframe.user-preview.'+encodeURIComponent(userId),snapshot,{
   name:displayName,email,onSignOut,onRefresh
  });
  const shortcut=(event:KeyboardEvent)=>{
   const node=event.target;
   if(node instanceof HTMLElement&&node.closest('input,textarea,select,[contenteditable="true"]'))return;
   if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
    event.preventDefault();
    document.querySelector<HTMLButtonElement>('[data-action="modal-task"]')?.click();
   }
  };
  window.addEventListener('keydown',shortcut);
  document.documentElement.dataset.demoStorage=getDemoStorageStatus();
  return ()=>{window.removeEventListener('keydown',shortcut);dispose();};
 },[userId,snapshot,displayName,email]);
 return <div id="app" data-react-host="dayframe"/>;
}
// Local demonstration works even when the browser cannot retain a
// third-party Neon Auth session. It never calls an authenticated data API.
function LocalPreview({onExit}:{onExit:()=>void}){
 useEffect(()=>{
  const dispose=mountLegacyDayframe('dayframe.local-only-preview.1',null,{name:'Local demo',email:'',onSignOut:onExit});
  return ()=>dispose();
 },[]);
 return <div className="authed-app"><div id="app" data-react-host="local-preview"/></div>;
}
function SignedIn({userId,displayName,email}:{userId:string;displayName:string;email:string}){
 const [snapshot,setSnapshot]=useState<CloudSnapshot|null>(null);
 const [error,setError]=useState('');
 const [retry,setRetry]=useState(0);
 const [signingOut,setSigningOut]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  setSnapshot(null);setError('');
  loadCloudSnapshot(controller.signal).then(value=>{
   if(!controller.signal.aborted)setSnapshot(value);
  }).catch(reason=>{
   if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Could not load your tasks');
  });
  return ()=>controller.abort();
 },[userId,retry]);
 async function signOut(){
  if(signingOut)return;
  setSigningOut(true);
  try{
   const result=await authClient.signOut();
   if(result.error)throw new Error(result.error.message||'Sign out failed. Please retry.');
   // Ensure the profile no longer displays account data if the session SDK
   // has stale state after a successful sign-out.
   window.location.reload();
  }catch(error){
   setSigningOut(false);
   throw error;
  }
 }
 return <div className="authed-app">
  {!snapshot ? <main className="auth-page auth-wait" aria-live="polite">
   <section className="auth-card">
    <p className="auth-kicker">{error?'PROFILE · CONNECTION':'DAYFRAME · ACCOUNT'}</p>
    <h1>{error?'Cannot load your workspace':'Loading your tasks'}</h1>
    <p className="auth-subtitle">{displayName}</p>
    <p>{error||'Getting your saved workspaces and tasks from Neon…'}</p>
    {error&&<div className="profile-actions" style={{justifyContent:'center',marginTop:20}}>
      <button type="button" className="auth-submit" onClick={()=>setRetry(x=>x+1)}>Retry</button>
      <button type="button" className="btn secondary" disabled={signingOut} onClick={()=>{void signOut().catch(e=>setError(e instanceof Error?e.message:'Sign out failed'));}}>Sign out</button>
    </div>}
   </section>
  </main> : <Dayframe userId={userId} snapshot={snapshot} displayName={displayName} email={email} onSignOut={signOut} onRefresh={()=>setRetry(x=>x+1)}/>}
 </div>;
}
export function App(){
 const [localPreview,setLocalPreview]=useState(false);
 const session=authClient.useSession();
 return <ErrorBoundary>
  {session.data?.user
    ? <SignedIn key={session.data.user.id} userId={session.data.user.id} displayName={session.data.user.name||session.data.user.email||'Account'} email={session.data.user.email||''}/>
    : localPreview
      ? <LocalPreview onExit={()=>setLocalPreview(false)}/>
      : session.isPending
        ? <main className="auth-page" aria-live="polite"><div className="auth-card"><h1>Opening Dayframe…</h1><p>Restoring your account session.</p></div></main>
        : <AuthScreen onPreview={()=>setLocalPreview(true)}/>}
 </ErrorBoundary>;
}
