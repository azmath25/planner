import {
 clearQuickNoteDraft,effectiveNoteTitle,meaningfulNote,noteFieldsMatch,
 readQuickNoteDraft,saveQuickNoteDraft,type QuickNoteFields
} from './quickNoteDraft';

export type CloudNote=QuickNoteFields&{id:string;revision:number};
type WriteFields=QuickNoteFields&{title:string};
export type NoteAutosaveApi={
 create:(id:string,fields:WriteFields)=>Promise<CloudNote>;
 update:(id:string,revision:number,fields:WriteFields)=>Promise<CloudNote>;
 list:()=>Promise<CloudNote[]>;
};
type Status={kind:'saved'|'local'|'saving'|'pending'|'conflict'|'error';message:string};
type Options={
 scope:string;id:string|null;revision:number;initial:QuickNoteFields;
 api:NoteAutosaveApi;
 onSaved:(note:CloudNote)=>void;
 onStatus:(status:Status)=>void;
 delayMs?:number;
};
/** One controller per open note. Writes are serialized, revision-fenced and
 * reconciled before a retry after an uncertain network response. */
export function createQuickNoteAutosaver(opts:Options){
 const slot=opts.id??'new';
 let id=opts.id,revision=opts.revision,fields=opts.initial;
 let version=0,cleanVersion=0,disposed=false,busy=false,conflict=false;
 let timer:ReturnType<typeof setTimeout>|null=null;
 let backoff=3500,unknown=false;
 let attempt:{id:string;revision:number;fields:WriteFields;version:number}|null=null;
 const saved=readQuickNoteDraft(opts.scope,slot);
 let clientId=saved?.clientId||(!id?crypto.randomUUID():null);
 if(saved){
  fields=saved.fields;
  version=1;
  if(id&&saved.revision!==revision){
   conflict=true;
   opts.onStatus({kind:'conflict',message:'The cloud note changed. A local draft is preserved; review it before overwriting.'});
  }else{
   unknown=!id&&!!saved.clientId;
   opts.onStatus({kind:'local',message:'Recovered an unsynced draft from this device.'});
  }
 }
 const saveLocal=()=>{
  const target=id??slot;
  const result=saveQuickNoteDraft(opts.scope,target,revision,fields,
   localStorage,clientId??undefined);
  if(id)clearQuickNoteDraft(opts.scope,'new');
  return result;
 };
 const status=(kind:Status['kind'],message:string)=>{
  if(!disposed)opts.onStatus({kind,message});
 };
 const schedule=(delay=opts.delayMs??1400)=>{
  if(disposed||conflict)return;
  if(timer)clearTimeout(timer);
  timer=setTimeout(()=>{
   timer=null;
   void (unknown?reconcile():flush());
  },delay);
 };
 const normal=(v:QuickNoteFields):WriteFields=>({...v,title:effectiveNoteTitle(v)});
 const equal=(a:QuickNoteFields,b:QuickNoteFields)=>noteFieldsMatch(a,b);
 const accept=(note:CloudNote,writeVersion:number)=>{
  const previousId=id;
  id=note.id;revision=note.revision;unknown=false;attempt=null;
  backoff=3500;
  if(!disposed)opts.onSaved(note);
  if(version===writeVersion&&equal(fields,note)){
   cleanVersion=version;
   clearQuickNoteDraft(opts.scope,slot);
   if(id!==slot)clearQuickNoteDraft(opts.scope,id);
   status('saved','Saved to cloud');
  }else{
   saveLocal();
   status('local','Newer edits saved on this device; syncing next.');
   schedule(250);
  }
  if(!previousId&&id!==slot)clearQuickNoteDraft(opts.scope,'new');
 };
 const retry=()=>{
  if(disposed||conflict)return;
  status('pending','Cloud save unconfirmed. Your draft is on this device; checking again.');
  schedule(backoff);
  backoff=Math.min(backoff*2,30000);
 };
 const reconcile=async()=>{
  if(disposed||busy||conflict||!unknown)return;
  busy=true;
  try{
   const notes=await opts.api.list();
   if(disposed)return;
   const match=notes.find(n=>n.id===(id??clientId));
   if(!match){
    // The original request did not commit, or its result is not visible yet.
    // The next create uses exactly the same client UUID, never a new note ID.
    unknown=false;attempt=null;
    schedule(400);
    return;
   }
   if(!id){
    accept(match,attempt?.version??-1);
    return;
   }
   const old=attempt;
   if(old&&match.revision===old.revision){
    revision=match.revision;unknown=false;attempt=null;schedule(400);
   }else if(old&&match.revision>old.revision&&equal(match,old.fields)){
    accept(match,old.version);
   }else if(!old&&equal(match,fields)){
    accept(match,version);
   }else{
    conflict=true;
    status('conflict','Cloud and local edits differ. Your local draft remains protected.');
   }
  }catch{
   if(!disposed)retry();
  }finally{busy=false;}
 };
 const flush=async(force=false):Promise<boolean>=>{
  if(timer){clearTimeout(timer);timer=null;}
  if(disposed||conflict)return false;
  if(busy){schedule(350);return false;}
  if(unknown){await reconcile();return false;}
  if(version===cleanVersion&&id)return true;
  if(!force&&!id&&!meaningfulNote(fields))return false;
  if(fields.reminderTime&&!fields.reminder){
   status('local','Draft saved on device; select a reminder date to sync its time.');
   return false;
  }
  const v=version,body=normal(fields),base=revision;
  const target=id??clientId??crypto.randomUUID();
  if(!id)clientId=target;
  attempt={id:target,revision:base,fields:body,version:v};
  saveLocal();
  busy=true;status('saving','Saving to cloud…');
  try{
   const result=id
    ?await opts.api.update(id,base,body)
    :await opts.api.create(target,body);
   if(disposed)return false;
   accept(result,v);
   return version===v;
  }catch(err){
   if(disposed)return false;
   const code=(err as {status?:number})?.status;
   if(code===400||code===413||code===415){
    status('error','Cloud rejected this note. The draft is retained on this device.');
   }else{
    unknown=true;
    retry();
   }
   return false;
  }finally{busy=false;}
 };
 return {
  /** Restore saved draft into the form before users type. */
  initialFields:fields,
  recovered:!!saved,
  hasConflict:()=>conflict,
  isDirty:()=>version!==cleanVersion,
  isSaved:()=>!!id&&version===cleanVersion&&!unknown,
  getId:()=>id,
  resume(){
   if(saved&&!conflict)schedule(800);
  },
  change(next:QuickNoteFields){
   if(disposed)return;
   fields=next;version++;
   const safe=saveLocal();
   status(safe?'local':'error',safe?'Draft saved on this device':'Local backup unavailable; copy your note before closing.');
   if(!conflict)schedule();
  },
  flush,
  dispose(){
   disposed=true;
   if(timer)clearTimeout(timer);
  }
 };
}
