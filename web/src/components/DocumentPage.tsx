import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
 cloudApi,type CloudDocument,type CloudDocumentInput,type CloudDocumentMeta
} from '../auth/api';
import { emptyDocumentBlocks,canonicalDocumentJSON,documentTitleFromBlocks } from '../domain/documentBlocks';
import { saveUnsyncedDraft,readUnsyncedDraft,clearUnsyncedDraft } from '../domain/documentDraftBackup';
import { BlockDocumentEditor } from './BlockDocumentEditor';
import { documentDownloadHtml,documentDownloadFilename,type DocumentPhoto } from '../domain/documentExport';

type Workspace={id:string;name:string};
type Props={
 workspaces:Workspace[];
 initialWorkspaceId?:string|null;
 initialTaskId?:string|null;
 initialTaskName?:string|null;
 draftScope:string;
 onDirtyChange:(dirty:boolean)=>void;
 onGoTask?:(taskId:string)=>void;
 onGoWorkspace?:(workspaceId:string)=>void;
};
function Documents({workspaces,initialWorkspaceId,initialTaskId,initialTaskName,draftScope,onDirtyChange,onGoTask,onGoWorkspace}:Props){
 const [documents,setDocuments]=useState<CloudDocumentMeta[]>([]);
 const [deleted,setDeleted]=useState<CloudDocumentMeta[]>([]);
 const [archived,setArchived]=useState<CloudDocumentMeta[]>([]);
 const [trashLoaded,setTrashLoaded]=useState(false);
 const [archiveLoaded,setArchiveLoaded]=useState(false);
 const [showArchive,setShowArchive]=useState(false);
 const [isTyping,setIsTyping]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [active,setActive]=useState<CloudDocument|null>(null);
 const [title,setTitle]=useState('');
 const [blocks,setBlocks]=useState<unknown[]>(emptyDocumentBlocks());
 const [photos,setPhotos]=useState<DocumentPhoto[]>([]);
 const [photoBusy,setPhotoBusy]=useState(false);
 const [photoError,setPhotoError]=useState('');
 const activePhotoId=useRef<string|null>(null);
 useEffect(()=>{activePhotoId.current=active?.id??null;},[active?.id]);
 const [dirty,setDirty]=useState(false);
 const [backupError,setBackupError]=useState(false);
 const [conflict,setConflict]=useState(false);
 const [autoSavePaused,setAutoSavePaused]=useState(false);
 const [editorEpoch,setEditorEpoch]=useState(0);
 // View-only scale; it never changes the document JSON or autosave revision.
 const [editorZoom,setEditorZoom]=useState(()=>{
  try{
   const value=Number(localStorage.getItem('dayframe.document-zoom.'+encodeURIComponent(draftScope)));
   return Number.isInteger(value)&&value>=60&&value<=150&&value%10===0?value:100;
  }catch{return 100;}
 });
 useEffect(()=>{
  try{localStorage.setItem('dayframe.document-zoom.'+encodeURIComponent(draftScope),String(editorZoom));}
  catch{/* Zoom still works when browser storage is disabled. */}
 },[draftScope,editorZoom]);
 // A network response must not clear edits made after its request began.
 const draftVersion=useRef(0);
 const savingRef=useRef(false);
 const uncertainSave=useRef<{docId:string;baseRevision:number;version:number;title:string;blocks:unknown[]}|null>(null);
 const retryDelay=useRef(3500);
 const latestDraft=useRef<{title:string;blocks:unknown[]}|null>(null);
 // Notion-like: first sentence names the page until the user edits the title.
 const autoTitleRef=useRef(false);
 const [filterWorkspace,setFilterWorkspace]=useState(initialWorkspaceId||'all');
 const [filterTask,setFilterTask]=useState<string|null>(initialTaskId||null);
 const [attachDocumentId,setAttachDocumentId]=useState('');
 const [showTrash,setShowTrash]=useState(false);
 const writing=Boolean(active&&!showTrash&&!showArchive);
 useEffect(()=>{
  // Give the active document the viewport, not the narrow dashboard column.
  // Remove the class on unmount, including a task-navigation exit.
  document.documentElement.classList.toggle('df-writing-open',Boolean(active&&!showTrash&&!showArchive));
  return ()=>document.documentElement.classList.remove('df-writing-open');
 },[active?.id,showTrash,showArchive]);
 const [searchTerm,setSearchTerm]=useState('');
 const [searchResults,setSearchResults]=useState<CloudDocumentMeta[]|null>(null);
 const [searchBusy,setSearchBusy]=useState(false);
 const [searchError,setSearchError]=useState('');
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
 useEffect(()=>{
  const docId=active?.id;
  setPhotos([]);setPhotoError('');
  if(!docId||showTrash||showArchive)return;
  let cancelled=false;
  void cloudApi.getDocumentPhotos(docId).then(rows=>{
   if(!cancelled&&alive.current)setPhotos(rows);
  }).catch(e=>{
   if(!cancelled&&alive.current)setPhotoError(
    e instanceof Error?e.message:'Could not load document photos');
  });
  return ()=>{cancelled=true;};
 },[active?.id,showTrash,showArchive]);
 const uploadPhoto=async(file:File|null)=>{
  if(!active||!file||photoBusy)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){
   setPhotoError('Select a JPEG, PNG or WebP photo smaller than 5 MB.');return;
  }
  const slot=[0,1,2,3].find(n=>!photos.some(p=>p.slot===n));
  if(slot===undefined){setPhotoError('Maximum four photos. Remove one before adding another.');return;}
  setPhotoBusy(true);setPhotoError('');
  const docId=active.id;
  try{
   const bitmap=await createImageBitmap(file);
   const canvas=document.createElement('canvas');
   let scale=Math.min(1,960/bitmap.width,960/bitmap.height),data='';
   try{
    for(let attempt=0;attempt<12;attempt++){
     canvas.width=Math.max(1,Math.floor(bitmap.width*scale));
     canvas.height=Math.max(1,Math.floor(bitmap.height*scale));
     const ctx=canvas.getContext('2d');
     if(!ctx)throw Error('Image compression is unavailable');
     ctx.clearRect(0,0,canvas.width,canvas.height);
     ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
     data=canvas.toDataURL('image/webp',Math.max(.28,.79-.043*attempt));
     if((data.split(',')[1]||'').length*.75<=175000)break;
     scale*=.78;
    }
   }finally{bitmap.close?.();}
   if(!/^data:image\/(?:webp|png|jpeg);base64,/.test(data)||
     (data.split(',')[1]||'').length*.75>180000)
     throw Error('Could not compress this photo to the private 180 KB limit');
   await cloudApi.putDocumentPhoto(docId,slot,data);
   if(alive.current&&activePhotoId.current===docId)
    setPhotos(old=>[...old,{slot,data}].sort((a,b)=>a.slot-b.slot));
  }catch(e){
   if(alive.current)setPhotoError(e instanceof Error?e.message:'Could not attach photo');
  }finally{if(alive.current)setPhotoBusy(false);}
 };
 const removePhoto=async(slot:number)=>{
  if(!active||photoBusy)return;
  setPhotoBusy(true);setPhotoError('');
  const docId=active.id;
  try{
   await cloudApi.deleteDocumentPhoto(docId,slot);
   if(alive.current&&activePhotoId.current===docId)setPhotos(old=>old.filter(p=>p.slot!==slot));
  }catch(e){if(alive.current)setPhotoError(e instanceof Error?e.message:'Could not remove photo');}
  finally{if(alive.current)setPhotoBusy(false);}
 };
 const downloadReadable=()=>{
  if(!active)return;
  const html=documentDownloadHtml(title.trim()||documentTitleFromBlocks(blocks)||'Untitled document',
    blocks,photos);
  const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  try{
   const a=document.createElement('a');a.href=url;
   a.download=documentDownloadFilename(title.trim()||'Untitled document');
   document.body.appendChild(a);a.click();a.remove();
  }finally{window.setTimeout(()=>URL.revokeObjectURL(url),1500);}
 };
 const printPdf=()=>{
  if(!active)return;
  // Browser-native print-to-PDF avoids untrusted remote converters and retains
  // the same safe self-contained HTML used by the document download.
  const printable=documentDownloadHtml(
   title.trim()||documentTitleFromBlocks(blocks)||'Untitled document',blocks,photos);
  const popup=window.open('','_blank');
  if(!popup){setError('Allow pop-ups for Dayframe to print or save this page as PDF.');return;}
  popup.addEventListener('load',()=>{popup.focus();popup.print();},{once:true});
  popup.document.open();popup.document.write(printable);popup.document.close();
 };
 const canDiscard=()=>{
  if(busy||savingRef.current){setError('An account request is still finishing. Try again when it completes.');return false;}
  if(pendingCreate){setError('A document creation result is uncertain. Retry creation first.');return false;}
  return !dirty||window.confirm('Discard unsaved document changes?');
 };
 const resetDraft=(value:CloudDocument|null)=>{
  draftVersion.current++;
  setActive(value);
  autoTitleRef.current=!value||!value.title.trim()||value.title==='Untitled document';
  setTitle(value?.title??'');
  setBlocks(value?.blocks??emptyDocumentBlocks());
  latestDraft.current={title:value?.title??'',blocks:value?.blocks??emptyDocumentBlocks()};
  setBackupError(false);
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
   if(alive.current){
    resetDraft(details);
    const saved=readUnsyncedDraft(draftScope,details.id);
    if(saved){
     const same=saved.title===details.title&&canonicalDocumentJSON(saved.blocks)===canonicalDocumentJSON(details.blocks);
     if(same)clearUnsyncedDraft(draftScope,details.id);
     else if(window.confirm('Unsynced edits were found on this device. Restore them?')){
      draftVersion.current++;
      setTitle(saved.title);setBlocks(saved.blocks);setDirty(true);autoTitleRef.current=false;
      latestDraft.current={title:saved.title,blocks:saved.blocks};
      if(saved.revision!==details.revision){
       setConflict(true);
       setError('The server also changed this document. Your local draft is restored, but review the versions before overwriting.');
      }else setError('Recovered your local draft. Autosave is resuming.');
     }
    }
   }
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Cannot open this document');}
  finally{if(alive.current)setBusy(false);}
 };
 const save=async()=>{
  if(!active||busy||savingRef.current||conflict)return;
  // Saving never requires a separate naming step.
  const safeTitle=(title.trim()||documentTitleFromBlocks(blocks)||'Untitled document').slice(0,160);
  // Draft persistence is not proof-reading: incorrect LaTeX and unfinished text are saved verbatim.
  // Capture exact version, document and payload. Never retry a network failure
  // automatically: the first write may already have committed on the server.
  const savedVersion=draftVersion.current;
  const docId=active.id;
  const attempt={docId,baseRevision:active.revision,version:savedVersion,title:safeTitle,blocks};
  savingRef.current=true;setBusy(true);setError('');
  try{
   const updated=await cloudApi.updateDocument(docId,active.revision,{
    workspace:active.workspace,taskId:active.taskId,parentId:active.parentId,
    title:safeTitle,blocks
   });
   if(!alive.current)return;
   setDocuments(current=>current.map(d=>d.id===updated.id?updated:d));
   if(draftVersion.current===savedVersion){
    // Confirm the revision without remounting BlockNote: remounting after each
    // autosave discards cursor position, selection and editor undo history.
    setActive(updated);setDirty(false);setConflict(false);setAutoSavePaused(false);
    clearUnsyncedDraft(draftScope,docId);uncertainSave.current=null;
    retryDelay.current=3500;setBackupError(false);setError('');
   }else{
    // A later edit arrived while the request was pending. Advance the
    // observed server revision without replacing the newer local draft.
    setActive(updated);setDirty(true);
    if(latestDraft.current)saveUnsyncedDraft(draftScope,docId,updated.revision,
     latestDraft.current.title,latestDraft.current.blocks);
    uncertainSave.current=null;retryDelay.current=3500;
   }
  }catch(e){
   if(!alive.current)return;
   const status=(e&&typeof e==='object'&&'status' in e)?Number(e.status):0;
   if(status===409){
    setConflict(true);
    setError('A newer version exists on the server. Your local draft remains backed up.');
   }else if([400,413,415].includes(status)){
    // Structural security and size limits remain; never keep retrying a
    // server-rejected request, but keep the raw draft safe on this device.
    setConflict(true);
    setError('Cloud rejected an oversized or unsafe document. Your local draft remains backed up and can be downloaded.');
   }else{
    uncertainSave.current=attempt;setAutoSavePaused(true);
    setError('Cloud save unconfirmed. Local draft retained; retrying after checking the server.');
   }
  }finally{
   savingRef.current=false;
   if(alive.current)setBusy(false);
  }
 };
 useEffect(()=>{
  if(!active||!dirty||busy||savingRef.current||
     conflict||autoSavePaused||pendingCreate)return;
  const timer=window.setTimeout(()=>{void save();},1400);
  return ()=>window.clearTimeout(timer);
 // save() intentionally uses the latest render's captured title and blocks.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[active?.id,active?.revision,title,blocks,dirty,busy,conflict,autoSavePaused,pendingCreate]);
 const reconcileUncertainSave=async()=>{
  if(!active||busy||savingRef.current||!autoSavePaused)return;
  setBusy(true);
  try{
   const remote=await cloudApi.getDocument(active.id);
   if(!alive.current)return;
   const pending=uncertainSave.current;
   const same=(a:unknown,b:unknown)=>canonicalDocumentJSON(a)===canonicalDocumentJSON(b);
   const currentTitle=(title.trim()||documentTitleFromBlocks(blocks)||'Untitled document').slice(0,160);
   const exactlyLocal=remote.title===currentTitle&&same(remote.blocks,blocks);
   const committedAttempt=pending&&pending.docId===remote.id&&
    remote.revision>pending.baseRevision&&remote.title===pending.title&&
    same(remote.blocks,pending.blocks);
   if(exactlyLocal||committedAttempt){
    setActive(remote);setAutoSavePaused(false);setConflict(false);
    uncertainSave.current=null;retryDelay.current=3500;
    if(exactlyLocal&&(!pending||draftVersion.current===pending.version)){
     setDirty(false);clearUnsyncedDraft(draftScope,remote.id);
    }else{
     setDirty(true);
     if(latestDraft.current)saveUnsyncedDraft(draftScope,remote.id,remote.revision,
      latestDraft.current.title,latestDraft.current.blocks);
    }
    setError('');
   }else if(remote.revision===active.revision){
    // The last write did not commit. Revision fencing makes a retry safe.
    uncertainSave.current=null;retryDelay.current=3500;
    setAutoSavePaused(false);setError('');
   }else{
    setConflict(true);
    setError('Another version exists on the server. Your local draft is backed up; review before overwriting.');
   }
  }catch(e){
   if(alive.current){
    setAutoSavePaused(true);
    setError('Cloud unavailable. Local draft retained; another check will run automatically.');
   }
  }finally{if(alive.current)setBusy(false);}
 };
 useEffect(()=>{
  if(!autoSavePaused||conflict||!active||busy||savingRef.current)return;
  const timer=window.setTimeout(()=>{
   retryDelay.current=Math.min(retryDelay.current*2,30000);
   void reconcileUncertainSave();
  },retryDelay.current);
  return ()=>window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[autoSavePaused,conflict,active?.id,busy]);
 const reloadLatest=async()=>{
  if(!active||busy||savingRef.current)return;
  if(!window.confirm('Discard the local document draft and load the newest saved version?'))return;
  setBusy(true);setError('');
  try{
   const remote=await cloudApi.getDocument(active.id);
   if(alive.current){clearUnsyncedDraft(draftScope,remote.id);resetDraft(remote);}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Could not reload document');}
  finally{if(alive.current)setBusy(false);}
 };
 const changeDraft=(newBlocks:unknown[],_message:string|null)=>{
  // Autosave must not disable typing or discard keystrokes that arrive while
  // its previous request is still in flight.
  if(busy&&!savingRef.current)return;
  draftVersion.current++;setBlocks(newBlocks);
  if(autoTitleRef.current){
   const inferred=documentTitleFromBlocks(newBlocks);
   if(inferred)setTitle(inferred);
  }
  const nextTitle=autoTitleRef.current?(documentTitleFromBlocks(newBlocks)||title):title;
  latestDraft.current={title:nextTitle,blocks:newBlocks};
  setBackupError(!saveUnsyncedDraft(draftScope,active?.id||'',active?.revision||1,nextTitle,newBlocks));
  setDirty(true);
 };
 const changeTitle=(newTitle:string)=>{
  if(busy&&!savingRef.current)return;
  autoTitleRef.current=false;
  draftVersion.current++;setTitle(newTitle);setDirty(true);
  latestDraft.current={title:newTitle,blocks};
  setBackupError(!saveUnsyncedDraft(draftScope,active?.id||'',active?.revision||1,newTitle,blocks));
 };
 // A failed POST may have committed. Abandoning a retry never deletes data
 // or reuses the ID, and requires deliberate acknowledgment of that risk.
 const abandonPendingCreate=()=>{
  if(!pendingCreate||busy||savingRef.current)return;
  if(!window.confirm(
   'Stop retrying this document creation? The earlier request may already have saved a document. Check My documents before creating a replacement.'
  ))return;
  setPendingCreate(null);
  setError('Retry abandoned. The previous document may exist; use Refresh to check My documents.');
 };
 const create=async(child:boolean,retry=false)=>{
  if(busy||(!retry&&!canDiscard())||(retry&&!pendingCreate))return;
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
   if(!alive.current)return;
   setDocuments(list=>[created,...list.filter(d=>d.id!==id)]);
   setPendingCreate(null);
   resetDraft(created);
   setShowTrash(false);setShowArchive(false);
  }catch(e){if(alive.current)setError((e instanceof Error?e.message:'Cannot create document')+
    '. Use Retry creation to reconcile this request before starting a different document.');}
  finally{if(alive.current)setBusy(false);}
 };
 const attachExisting=async()=>{
  if(!filterTask||!initialWorkspaceId||!attachDocumentId||
   busy||!canDiscard())return;
  const candidate=documents.find(d=>d.id===attachDocumentId&&
   d.workspace===initialWorkspaceId&&d.taskId===null&&d.parentId===null&&
   !documents.some(child=>child.parentId===d.id));
  if(!candidate){setError('Choose an unassigned document from this workspace.');return;}
  setBusy(true);setError('');
  try{
   const full=await cloudApi.getDocument(candidate.id);
   // Fetch the latest revision; never move a document that was linked elsewhere
   // while this picker was open.
   if(full.workspace!==initialWorkspaceId||full.taskId!==null||
    full.parentId!==null)
    throw new Error('This document was moved. Refresh before linking it.');
   const attached=await cloudApi.updateDocument(full.id,full.revision,{
    workspace:full.workspace,taskId:filterTask,parentId:null,
    title:full.title,blocks:full.blocks
   });
   if(!alive.current)return;
   setDocuments(list=>list.map(d=>d.id===attached.id?attached:d));
   setAttachDocumentId('');
   resetDraft(attached);
  }catch(e){
   if(alive.current)setError(e instanceof Error?e.message:'Could not link this document');
  }finally{if(alive.current)setBusy(false);}
 };
 const unlinkFromTask=async()=>{
  if(!active||!active.taskId||busy)return;
  if(dirty||savingRef.current){
   setError('Finish cloud saving this document before removing its task link.');return;
  }
  if(active.parentId||documents.some(d=>d.parentId===active.id)){
   setError('Nested documents must stay with their parent page.');return;
  }
  if(!window.confirm('Remove this document from its task? The document and its contents will be kept.'))return;
  setBusy(true);setError('');
  try{
   const remote=await cloudApi.getDocument(active.id);
   if(remote.revision!==active.revision||remote.taskId!==active.taskId)
    throw new Error('This document changed. Refresh before removing its link.');
   const updated=await cloudApi.updateDocument(remote.id,remote.revision,{
    workspace:remote.workspace,taskId:null,parentId:null,
    title:remote.title,blocks:remote.blocks
   });
   if(!alive.current)return;
   setDocuments(list=>list.map(d=>d.id===updated.id?updated:d));
   resetDraft(null);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Could not unlink this document');}
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
 const archiveDocument=async()=>{
  if(!active||busy||dirty||savingRef.current)return;
  if(!window.confirm('Archive this document? It remains private and can be restored from Archive.'))return;
  setBusy(true);setError('');
  try{
   await cloudApi.archiveDocument(active.id,active.revision);
   if(!alive.current)return;
   setDocuments(rows=>rows.filter(d=>d.id!==active.id));
   setArchiveLoaded(false);resetDraft(null);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Cannot archive this document');}
  finally{if(alive.current)setBusy(false);}
 };
 const openArchive=async()=>{
  if(!canDiscard())return;
  setShowTrash(false);setShowArchive(true);resetDraft(null);setError('');
  if(archiveLoaded)return;
  setLoading(true);
  try{
   const rows=await cloudApi.listArchivedDocuments();
   if(alive.current){setArchived(rows);setArchiveLoaded(true);}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Cannot load archive');}
  finally{if(alive.current)setLoading(false);}
 };
 const unarchive=async(doc:CloudDocumentMeta)=>{
  if(busy)return;
  setBusy(true);setError('');
  try{
   const restored=await cloudApi.unarchiveDocument(doc.id,doc.revision);
   if(!alive.current)return;
   setArchived(rows=>rows.filter(d=>d.id!==restored.id));
   setDocuments(rows=>[restored,...rows]);
   setShowArchive(false);setShowTrash(false);resetDraft(null);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Cannot restore this archived document');}
  finally{if(alive.current)setBusy(false);}
 };
 const openTrash=async()=>{
  if(!canDiscard())return;
  setShowTrash(true);setShowArchive(false);resetDraft(null);setError('');
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
   if(!alive.current)return;
   setDeleted(list=>list.filter(d=>d.id!==restored.id));
   setDocuments(list=>[restored,...list]);
   setShowTrash(false);setShowArchive(false);
   resetDraft(restored);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Cannot restore document');}
  finally{if(alive.current)setBusy(false);}
 };
 // Search runs only on demand, debounced and owner-scoped by the API.
 // No document content is stored in the browser's search results.
 useEffect(()=>{
  const q=searchTerm.trim();
  if(q.length<2){setSearchResults(null);setSearchBusy(false);setSearchError('');return;}
  const controller=new AbortController();
  setSearchBusy(true);setSearchError('');
  const timer=window.setTimeout(()=>{
   void cloudApi.searchDocuments(q,{
    ...(filterWorkspace!=='all'?{workspace:filterWorkspace}:{}),
    ...(filterTask?{taskId:filterTask}:{})
   },controller.signal).then(rows=>{
    if(!controller.signal.aborted){setSearchResults(rows);setSearchBusy(false);}
   }).catch(e=>{
    if(!controller.signal.aborted){
     setSearchError(e instanceof Error?e.message:'Search unavailable');
     setSearchResults([]);setSearchBusy(false);
    }
   });
  },350);
  return ()=>{window.clearTimeout(timer);controller.abort();};
 },[searchTerm,filterWorkspace,filterTask]);
 const downloadJson=(payload:unknown,name:string)=>{
  const text=JSON.stringify(payload,null,2);
  if(text.length>240000){setError('Export is too large for a single document');return;}
  const blob=new Blob([text],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{
   const anchor=document.createElement('a');
   anchor.href=url;anchor.download=name;
   document.body.appendChild(anchor);anchor.click();anchor.remove();
  }finally{window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
 };
 const exportSaved=async()=>{
  if(!active||busy)return;
  setBusy(true);setError('');
  try{
   const data=await cloudApi.exportDocument(active.id);
   if(!alive.current)return;
   downloadJson(data,'dayframe-document-'+active.id+'.json');
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Export unavailable');}
  finally{if(alive.current)setBusy(false);}
 };
 const exportDraft=()=>{
  if(!active)return;
  downloadJson({
   schema:'dayframe.document.draft.v1',
   exportedAt:new Date().toISOString(),
   baseRevision:active.revision,
   document:{id:active.id,workspace:active.workspace,taskId:active.taskId,
    parentId:active.parentId,title,blocks}
  },'dayframe-unsaved-draft-'+active.id+'.json');
 };
 const attachCandidates=useMemo(()=>filterTask&&initialWorkspaceId?
  documents.filter(d=>d.workspace===initialWorkspaceId&&d.taskId===null&&
   d.parentId===null&&!documents.some(child=>child.parentId===d.id))
   .sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id)):[],
  [documents,filterTask,initialWorkspaceId]);
 const filtered=useMemo(()=>(searchTerm.trim().length>=2?(searchResults??[]):documents)
 .filter(d=>
  (filterWorkspace==='all'||d.workspace===filterWorkspace)&&
  (!filterTask||d.taskId===filterTask)
 ),[documents,searchResults,searchTerm,filterWorkspace,filterTask]);
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
 return <section className={'df-documents'+(writing?' df-documents-writing':'')} aria-label="Private document library">
  <div className="page-head">
   <div><div className="eyebrow">PRIVATE LIBRARY</div><h1>{filterTask?'Task documents':'Documents'}</h1>
    <p className="subtitle">{filterTask
     ?<>For {initialTaskName||'this task'} · New documents here stay linked to the task and autosave while you write.</>
     :'Autosave keeps unfinished writing and imperfect math. Unsynced edits are backed up on this device.'}</p>
   </div>
   <div className="actions">
    <button className="btn secondary small" type="button" onClick={()=>void refresh()} disabled={busy||loading}>Refresh</button>
    <button className="btn" type="button" onClick={()=>void create(false)} disabled={busy||showTrash}>
     {filterTask?'New task document':'New document'}</button>
   </div>
  </div>
  {error&&<p role="alert" className="info-banner">{error}</p>}
  {active&&(conflict||autoSavePaused)&&<div className="actions" role="group" aria-label="Document recovery actions">
    <button className="btn small secondary" disabled={busy||conflict}
      type="button" onClick={()=>void reconcileUncertainSave()}>Check server and retry</button>
    <button className="btn small secondary" disabled={busy}
      type="button" onClick={exportDraft}>Download local draft</button>
    <button className="btn small secondary" disabled={busy}
      type="button" onClick={()=>void reloadLatest()}>Reload server version</button>
  </div>}
  {pendingCreate&&<div className="info-banner" role="alert">
    A document creation response is uncertain. Retrying uses its original ID.
    <div className="actions" role="group" aria-label="Document creation recovery">
     <button type="button" className="btn small secondary" disabled={busy}
      onClick={()=>void create(false,true)}>Retry creation</button>
     <button type="button" className="btn small secondary" disabled={busy}
      onClick={abandonPendingCreate}>Abandon retry</button>
    </div>
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
     <label className="field-wrap"><span className="form-label">Search documents (server)</span>
      <input className="field" type="search" aria-label="Search private documents"
       placeholder="Title or text (2+ characters)" maxLength={120}
       value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
     </label>
     {searchTerm.trim().length>=2&&<p className="tiny" role="status">
      {searchBusy?'Searching saved documents…':searchError||'Showing matching documents'}
     </p>}
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
     {filterTask&&initialWorkspaceId&&<div className="df-doc-attach-existing">
      <label className="field-wrap">
       <span className="form-label">Add an existing document to this task</span>
       <select className="field" aria-label="Choose an unassigned document"
        value={attachDocumentId} disabled={busy}
        onChange={e=>setAttachDocumentId(e.target.value)}>
        <option value="">Choose an unassigned document</option>
        {attachCandidates.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}
       </select>
      </label>
      <button className="btn small secondary" type="button"
       disabled={busy||!attachDocumentId} onClick={()=>void attachExisting()}>
       Attach to task
      </button>
      <p className="tiny">Only unassigned pages without child pages can be linked here.</p>
     </div>}
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
      <div className="df-doc-writing-bar">
       <button type="button" className="btn small secondary df-doc-back"
        disabled={busy&&!savingRef.current}
        onClick={()=>{if(canDiscard())resetDraft(null);}}>← Documents</button>
       <p className="tiny df-doc-save-status" role="status" aria-live="polite">
        {busy?'Saving to cloud…':conflict?'Cloud save needs attention — draft kept':autoSavePaused?'Local draft saved — retrying cloud':backupError?'Local recovery unavailable':dirty?'Draft backed up — cloud save soon':'Saved to cloud'}
       </p>
       <button type="button" className="btn small" disabled={busy||!dirty||conflict}
        onClick={()=>void (autoSavePaused?reconcileUncertainSave():save())}>
        {autoSavePaused?'Retry sync':'Save now'}</button>
       <button type="button" className="btn small secondary df-doc-download"
        onClick={downloadReadable} disabled={photoBusy}>Download HTML</button>
       <div className="df-doc-zoom-control" role="group" aria-label="Document zoom">
        <button type="button" className="btn small secondary" aria-label="Zoom out 10 percent"
         disabled={editorZoom<=60} onClick={()=>setEditorZoom(z=>Math.max(60,z-10))}>−</button>
        <button type="button" className="btn small secondary df-doc-zoom-value"
         aria-label={'Reset document zoom, currently '+editorZoom+' percent'}
         title="Reset to 100%" onClick={()=>setEditorZoom(100)}>{editorZoom}%</button>
        <button type="button" className="btn small secondary" aria-label="Zoom in 10 percent"
         disabled={editorZoom>=150} onClick={()=>setEditorZoom(z=>Math.min(150,z+10))}>+</button>
       </div>
       <details className="df-doc-options">
        <summary className="btn small secondary">More</summary>
        <div className="actions">
         <button type="button" className="btn small secondary" disabled={busy} onClick={()=>void create(true)}>New child page</button>
         <button type="button" className="btn small secondary" disabled={busy||!dirty}
          onClick={()=>{if(window.confirm('Discard local edits?'))resetDraft(active);}}>Discard edits</button>
         <button type="button" className="btn small secondary" disabled={busy} onClick={()=>void exportSaved()}>Download saved JSON</button>
         {active.taskId&&!active.parentId&&<button type="button" className="btn small secondary"
          disabled={busy||dirty||documents.some(d=>d.parentId===active.id)}
          onClick={()=>void unlinkFromTask()}>Remove from task</button>}
         <button type="button" className="btn small secondary" disabled={busy||dirty} onClick={()=>void remove()}>Delete</button>
        </div>
       </details>
      </div>
      <label className="field-wrap df-doc-title-field">
       <span className="form-label">Page title (optional; filled from first sentence)</span>
       <input className="field" aria-label="Page title (optional)" placeholder="Untitled"
        maxLength={160} value={title} disabled={busy&&!savingRef.current}
        onChange={e=>changeTitle(e.target.value)}/>
      </label>
      {active.parentId&&<p className="tiny">Nested below another document. Delete children first.</p>}
     </div>
     <div className="df-document-editor" aria-label="Rich text editor">
      <div className="df-doc-zoom-surface" style={{zoom:editorZoom/100}}>
       <BlockDocumentEditor key={active.id+'-'+editorEpoch} blocks={blocks}
        readOnly={busy&&!savingRef.current} onEdit={changeDraft}/>
      </div>
     </div>
     <section className="df-doc-photo-section" aria-label="Document photos">
      <div className="df-doc-photo-heading">
       <strong>Photos</strong>
       <span className="tiny">{photos.length}/4 private attachments</span>
      </div>
      {photos.length>0&&<div className="df-doc-photo-grid">
       {photos.map(p=><figure key={p.slot} className="df-doc-photo">
        <img src={p.data} alt={'Document photo '+(p.slot+1)}/>
        <figcaption>Photo {p.slot+1}
         <button type="button" className="btn small secondary" disabled={photoBusy}
          onClick={()=>void removePhoto(p.slot)}>Remove</button>
        </figcaption>
       </figure>)}
      </div>}
      <label className="btn small secondary df-doc-photo-add">
       {photoBusy?'Saving photo…':'Add photo'}
       <input type="file" accept="image/png,image/jpeg,image/webp"
        disabled={photoBusy||photos.length>=4} hidden
        onChange={event=>{
         const file=event.target.files?.[0]??null;
         event.target.value='';
         void uploadPhoto(file);
        }}/>
      </label>
      <p className="tiny">Images are stored privately with this document.
       They are included in the readable HTML download.</p>
      {photoError&&<p className="tiny" role="alert">{photoError}</p>}
     </section>
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
