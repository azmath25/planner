import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
 cloudApi,type CloudDocument,type CloudDocumentInput,type CloudDocumentMeta
} from '../auth/api';
import { assertDocumentBlocks,emptyDocumentBlocks } from '../domain/documentBlocks';
import { BlockDocumentEditor } from './BlockDocumentEditor';

type Workspace={id:string;name:string};
type Props={
 workspaces:Workspace[];
 initialWorkspaceId?:string|null;
 initialTaskId?:string|null;
 initialTaskName?:string|null;
 onDirtyChange:(dirty:boolean)=>void;
};
function Documents({workspaces,initialWorkspaceId,initialTaskId,initialTaskName,onDirtyChange}:Props){
 const [documents,setDocuments]=useState<CloudDocumentMeta[]>([]);
 const [deleted,setDeleted]=useState<CloudDocumentMeta[]>([]);
 const [trashLoaded,setTrashLoaded]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [active,setActive]=useState<CloudDocument|null>(null);
 const [title,setTitle]=useState('');
 const [blocks,setBlocks]=useState<unknown[]>(emptyDocumentBlocks());
 const [dirty,setDirty]=useState(false);
 const [validation,setValidation]=useState('');
 const [conflict,setConflict]=useState(false);
 const [autoSavePaused,setAutoSavePaused]=useState(false);
 const [editorEpoch,setEditorEpoch]=useState(0);
 // A network response must not clear edits made after its request began.
 const draftVersion=useRef(0);
 const savingRef=useRef(false);
 const [filterWorkspace,setFilterWorkspace]=useState(initialWorkspaceId||'all');
 const [filterTask,setFilterTask]=useState<string|null>(initialTaskId||null);
 const [showTrash,setShowTrash]=useState(false);
 const [pendingCreate,setPendingCreate]=useState<{id:string;body:CloudDocumentInput}|null>(null);
 const alive=useRef(true);
 useEffect(()=>{
  alive.current=true;
  let cancelled=false;
  void cloudApi.listDocuments().then(rows=>{
   if(!cancelled){setDocuments(rows);setLoading(false);}
  }).catch(e=>{
   if(!cancelled){setError(e instanceof Error?e.message:'Cannot load documents');setLoading(false);}
  });
  return ()=>{cancelled=true;alive.current=false;};
 },[]);
 useEffect(()=>{
  onDirtyChange(dirty||busy||pendingCreate!==null);
  const unload=(event:BeforeUnloadEvent)=>{
   if(dirty||busy||pendingCreate!==null){event.preventDefault();event.returnValue='';}
  };
  window.addEventListener('beforeunload',unload);
  return ()=>window.removeEventListener('beforeunload',unload);
 },[dirty,busy,pendingCreate,onDirtyChange]);
 const canDiscard=()=>{
  if(busy||savingRef.current){setError('An account request is still finishing. Try again when it completes.');return false;}
  if(pendingCreate){setError('A document creation result is uncertain. Retry creation first.');return false;}
  return !dirty||window.confirm('Discard unsaved document changes?');
 };
 const resetDraft=(value:CloudDocument|null)=>{
  draftVersion.current++;
  setActive(value);
  setTitle(value?.title??'');
  setBlocks(value?.blocks??emptyDocumentBlocks());
  setValidation('');
  setDirty(false);setConflict(false);setAutoSavePaused(false);setEditorEpoch(x=>x+1);
 };
 const refresh=async()=>{
  if(!canDiscard())return;
  setBusy(true);setError('');
  try{
   const rows=await cloudApi.listDocuments();
   if(!alive.current)return;
   setDocuments(rows);resetDraft(null);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Cannot refresh documents');}
  finally{if(alive.current)setBusy(false);}
 };
 const open=async(doc:CloudDocumentMeta)=>{
  if(busy||!canDiscard())return;
  setBusy(true);setError('');
  try{
   const details=await cloudApi.getDocument(doc.id);
   assertDocumentBlocks(details.blocks);
   if(alive.current)resetDraft(details);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Cannot open this document');}
  finally{if(alive.current)setBusy(false);}
 };
 const save=async()=>{
  if(!active||busy||savingRef.current||conflict)return;
  const safeTitle=title.trim();
  if(!safeTitle||safeTitle.length>160){
   setValidation('Document title must contain 1–160 characters.');return;
  }
  try{assertDocumentBlocks(blocks);}catch(e){
   setValidation(e instanceof Error?e.message:'Unsupported blocks');return;
  }
  // Capture exact version, document and payload. Never retry a network failure
  // automatically: the first write may already have committed on the server.
  const savedVersion=draftVersion.current;
  const docId=active.id;
  savingRef.current=true;setBusy(true);setError('');
  try{
   const updated=await cloudApi.updateDocument(docId,active.revision,{
    workspace:active.workspace,taskId:active.taskId,parentId:active.parentId,
    title:safeTitle,blocks
   });
   if(!alive.current)return;
   setDocuments(current=>current.map(d=>d.id===updated.id?updated:d));
   if(draftVersion.current===savedVersion){
    resetDraft(updated);
   }else{
    // A later edit arrived while the request was pending. Advance the
    // observed server revision without replacing the newer local draft.
    setActive(updated);setDirty(true);
   }
  }catch(e){
   if(!alive.current)return;
   const status=(e&&typeof e==='object'&&'status' in e)?Number(e.status):0;
   if(status===409){
    setConflict(true);
    setError('A newer version exists on the server. Your local draft is untouched. Download it or reload the latest version before continuing.');
   }else{
    setAutoSavePaused(true);
    setError('Save outcome uncertain. Your local changes are preserved here. Retry manually after checking your connection.');
   }
  }finally{
   savingRef.current=false;
   if(alive.current)setBusy(false);
  }
 };
 useEffect(()=>{
  if(!active||!dirty||busy||savingRef.current||validation||
     conflict||autoSavePaused||pendingCreate)return;
  const timer=window.setTimeout(()=>{void save();},1400);
  return ()=>window.clearTimeout(timer);
 // save() intentionally uses the latest render's captured title and blocks.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[active?.id,active?.revision,title,blocks,dirty,busy,validation,conflict,autoSavePaused,pendingCreate]);
 const reloadLatest=async()=>{
  if(!active||busy||savingRef.current)return;
  if(!window.confirm('Discard the local document draft and load the newest saved version?'))return;
  setBusy(true);setError('');
  try{
   const remote=await cloudApi.getDocument(active.id);
   assertDocumentBlocks(remote.blocks);
   if(alive.current)resetDraft(remote);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Could not reload document');}
  finally{if(alive.current)setBusy(false);}
 };
 const changeDraft=(newBlocks:unknown[],message:string|null)=>{
  if(busy||savingRef.current)return;
  draftVersion.current++;setBlocks(newBlocks);
  setValidation(message||'');setDirty(true);
 };
 const changeTitle=(newTitle:string)=>{
  if(busy||savingRef.current)return;
  draftVersion.current++;setTitle(newTitle);setDirty(true);
  setValidation(''); // New input gets a fresh validation pass.
 };
 const create=async(child:boolean)=>{
  if(busy||!canDiscard())return;
  const parent=child?active:null;
  const workspace=parent?.workspace||
   (filterWorkspace!=='all'?filterWorkspace:workspaces[0]?.id);
  if(!workspace){setError('Select an active workspace first.');return;}
  const body:CloudDocumentInput=pendingCreate?.body??{
   workspace,taskId:parent?.taskId??filterTask,
   parentId:parent?.id??null,title:'Untitled document',blocks:[]
  };
  const id=pendingCreate?.id??crypto.randomUUID();
  // Preserve client ID after a response is lost; the server checks its payload.
  if(!pendingCreate)setPendingCreate({id,body});
  setBusy(true);setError('');
  try{
   const created=await cloudApi.createDocument(id,body);
   assertDocumentBlocks(created.blocks);
   if(!alive.current)return;
   setDocuments(list=>[created,...list.filter(d=>d.id!==id)]);
   setPendingCreate(null);
   resetDraft(created);
   setShowTrash(false);
  }catch(e){if(alive.current)setError((e instanceof Error?e.message:'Cannot create document')+
    '. Use Retry creation to reconcile this request before starting a different document.');}
  finally{if(alive.current)setBusy(false);}
 };
 const remove=async()=>{
  if(!active||busy)return;
  if(!window.confirm('Move this document to Recently Deleted? Child pages must be deleted first.'))return;
  setBusy(true);setError('');
  try{
   await cloudApi.deleteDocument(active.id,active.revision);
   if(!alive.current)return;
   setDocuments(list=>list.filter(d=>d.id!==active.id));
   setTrashLoaded(false);
   resetDraft(null);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Cannot delete this document');}
  finally{if(alive.current)setBusy(false);}
 };
 const openTrash=async()=>{
  if(!canDiscard())return;
  setShowTrash(true);resetDraft(null);setError('');
  if(trashLoaded)return;
  setLoading(true);
  try{
   const rows=await cloudApi.listDeletedDocuments();
   if(alive.current){setDeleted(rows);setTrashLoaded(true);}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Cannot load deleted documents');}
  finally{if(alive.current)setLoading(false);}
 };
 const restore=async(doc:CloudDocumentMeta)=>{
  if(busy)return;
  setBusy(true);setError('');
  try{
   const restored=await cloudApi.restoreDocument(doc.id,doc.revision);
   assertDocumentBlocks(restored.blocks);
   if(!alive.current)return;
   setDeleted(list=>list.filter(d=>d.id!==restored.id));
   setDocuments(list=>[restored,...list]);
   setShowTrash(false);
   resetDraft(restored);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Cannot restore document');}
  finally{if(alive.current)setBusy(false);}
 };
 const filtered=useMemo(()=>documents.filter(d=>
  (filterWorkspace==='all'||d.workspace===filterWorkspace)&&
  (!filterTask||d.taskId===filterTask)
 ),[documents,filterWorkspace,filterTask]);
 const ids=useMemo(()=>new Map(filtered.map(d=>[d.id,d])),[filtered]);
 const ordered=useMemo(()=>{
  const byTitle=(a:CloudDocumentMeta,b:CloudDocumentMeta)=>
    a.title.localeCompare(b.title)||a.id.localeCompare(b.id);
  const children=(parent:string|null)=>filtered.filter(d=>{
   const belongs=d.parentId&&ids.has(d.parentId)?d.parentId:null;
   return belongs===parent;
  }).sort(byTitle);
  const result:{doc:CloudDocumentMeta;depth:number}[]=[];
  const seen=new Set<string>();
  const visit=(parent:string|null,depth:number)=>{
   if(depth>20)return;
   for(const doc of children(parent)){
    if(seen.has(doc.id))continue;
    seen.add(doc.id);result.push({doc,depth});visit(doc.id,depth+1);
   }
  };
  visit(null,0);
  for(const doc of filtered.sort(byTitle))if(!seen.has(doc.id))result.push({doc,depth:0});
  return result;
 },[filtered,ids]);
 return <section className="df-documents" aria-label="Private document library">
  <div className="page-head">
   <div><div className="eyebrow">PRIVATE LIBRARY</div><h1>Documents</h1>
    <p className="subtitle">Private rich-text documents autosave after 1.4 seconds of inactivity. Saves pause on errors; no offline sync is promised.</p>
   </div>
   <div className="actions">
    <button className="btn secondary small" type="button" onClick={()=>void refresh()} disabled={busy||loading}>Refresh</button>
    <button className="btn" type="button" onClick={()=>void create(false)} disabled={busy||showTrash}>New document</button>
   </div>
  </div>
  {error&&<p role="alert" className="info-banner">{error}</p>}
  {active&&(conflict||autoSavePaused)&&<div className="actions" role="group" aria-label="Document recovery actions">
    <button className="btn small secondary" disabled={busy||conflict||!!validation}
      type="button" onClick={()=>{setAutoSavePaused(false);void save();}}>Retry save</button>
    <button className="btn small secondary" disabled={busy}
      type="button" onClick={()=>void reloadLatest()}>Reload server version</button>
  </div>}
  {pendingCreate&&<div className="info-banner" role="alert">
    A document creation response is uncertain.
    <button type="button" className="btn small secondary" disabled={busy}
      onClick={()=>void create(false)}>Retry creation</button>
   </div>}
  <div className="df-doc-grid">
   <aside className="card df-doc-library" aria-label="Document folders">
    <div className="actions">
     <button type="button" className={'btn small '+(!showTrash?'':'secondary')}
      onClick={()=>{if(canDiscard()){setShowTrash(false);resetDraft(null);}}}
      aria-pressed={!showTrash}>My documents</button>
     <button type="button" className={'btn small '+(showTrash?'':'secondary')}
      onClick={()=>void openTrash()} aria-pressed={showTrash}>Recently Deleted</button>
    </div>
    {!showTrash&&<>
     <label className="field-wrap"><span className="form-label">Workspace</span>
      <select className="field" aria-label="Filter documents by workspace"
       value={filterWorkspace} onChange={e=>{if(!canDiscard())return;setFilterWorkspace(e.target.value);setFilterTask(null);resetDraft(null);}}>
       <option value="all">All workspaces</option>
       {workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
     </label>
     {filterTask&&<p className="tiny">
      Task: {initialTaskName||'Selected task'}{' '}
      <button className="text-link" onClick={()=>{if(canDiscard()){setFilterTask(null);resetDraft(null);}}}
       type="button">Show all tasks</button>
     </p>}
    </>}
    <div className="df-doc-list">
     {loading?<p role="status">Loading documents…</p>:showTrash?
       deleted.length?deleted.map(d=><div className="df-doc-row" key={d.id}>
        <span>{d.title}</span><button type="button" className="btn small secondary"
         disabled={busy} onClick={()=>void restore(d)}>Restore</button>
       </div>):<p className="tiny">No deleted documents.</p>:
       ordered.length?ordered.map(({doc,depth})=>
        <button key={doc.id} type="button"
         className={'df-doc-entry '+(active?.id===doc.id?'selected':'')}
         style={{paddingLeft:Math.min(depth,8)*12+12}}
         aria-current={active?.id===doc.id?'page':undefined}
         onClick={()=>void open(doc)}>
         <span aria-hidden="true">{depth?'↳':'▤'}</span><span>{doc.title}</span>
        </button>):<p className="tiny">No documents here. Create your first one.</p>}
    </div>
   </aside>
   <div className="card df-doc-content">
    {active&&!showTrash?<>
     <div className="df-doc-controls">
      <label className="field-wrap"><span className="form-label">Document title</span>
       <input className="field" aria-label="Document title" maxLength={160}
        value={title} disabled={busy} onChange={e=>changeTitle(e.target.value)}/>
      </label>
      <div className="actions">
       <button type="button" className="btn small secondary" disabled={busy}
        onClick={()=>void create(true)}>New child page</button>
       <button type="button" className="btn small secondary" disabled={busy||!dirty}
        onClick={()=>{if(window.confirm('Discard local edits?'))resetDraft(active);}}>Discard edits</button>
       <button type="button" className="btn small secondary" disabled={busy||dirty}
        onClick={()=>void remove()}>Delete</button>
       <button type="button" className="btn small" disabled={busy||!dirty||!!validation}
        onClick={()=>{setAutoSavePaused(false);void save();}}>Save changes</button>
      </div>
      <p className="tiny" role="status" aria-live="polite">
       {busy?'Saving…':conflict?'Conflict — local draft preserved':autoSavePaused?'Autosave paused — use Retry save':validation?'Cannot autosave: '+validation:dirty?'Unsaved — autosave scheduled':'Saved'}
      </p>
      {active.parentId&&<p className="tiny">Nested below another document. Delete children first.</p>}
     </div>
     <div className="df-document-editor" aria-label="Rich text editor">
      <BlockDocumentEditor key={active.id+'-'+editorEpoch} blocks={blocks} readOnly={busy}
       onEdit={changeDraft}/>
     </div>
    </>:<div className="df-doc-empty">
      <h2>{showTrash?'Restore a document':'Choose a document'}</h2>
      <p className="subtitle">{showTrash?'Restore a deleted page to edit it.':
       'Select a page from the library, or create a document with the button above.'}</p>
     </div>}
   </div>
  </div>
 </section>;
}
export function mountDayframeDocuments(
 element:HTMLElement,
 props:Omit<Props,'onDirtyChange'>,
 onDirtyChange:(dirty:boolean)=>void
):()=>void{
 const root=createRoot(element);
 root.render(<Documents {...props} onDirtyChange={onDirtyChange}/>);
 return ()=>{root.unmount();onDirtyChange(false);};
}
