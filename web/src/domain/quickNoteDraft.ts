// Preserve Quick Note text before network requests. This is an account-scoped
// local recovery copy, not proof that the cloud commit succeeded.
export type QuickNoteFields={
 workspace:string;title:string;content:string;color:string;pinned:boolean;
 reminder:string|null;reminderTime:string|null;
};
export type QuickNoteDraft={
 schema:'dayframe.quick-note-draft.v1';noteId:string;revision:number;
 fields:QuickNoteFields;updatedAt:number;
};
const PREFIX='dayframe.quick-note-draft.v1.';
function key(scope:string,noteId:string){
 return PREFIX+encodeURIComponent(scope)+'.'+encodeURIComponent(noteId);
}
export function firstSentenceTitle(text:string):string{
 const compact=text.replace(/\s+/g,' ').trim();
 const sentence=compact.match(/^.{1,120}?[.!?](?=\s|$)/u)?.[0]??compact.slice(0,120);
 return sentence.trim();
}
export function effectiveNoteTitle(fields:Pick<QuickNoteFields,'title'|'content'>):string{
 return fields.title.trim().slice(0,120)||firstSentenceTitle(fields.content)||'Untitled note';
}
export function meaningfulNote(fields:QuickNoteFields):boolean{
 return !!(fields.title.trim()||fields.content.trim()||fields.reminder||
  fields.reminderTime||fields.pinned);
}
export function noteFieldsMatch(a:QuickNoteFields,b:QuickNoteFields):boolean{
 return a.workspace===b.workspace&&effectiveNoteTitle(a)===effectiveNoteTitle(b)&&
  a.content===b.content&&a.color===b.color&&a.pinned===b.pinned&&
  a.reminder===b.reminder&&a.reminderTime===b.reminderTime;
}
export function saveQuickNoteDraft(
 scope:string,noteId:string,revision:number,fields:QuickNoteFields,
 storage:Pick<Storage,'setItem'>=localStorage
):boolean{
 try{
  if(!Number.isSafeInteger(revision)||revision<0||fields.content.length>8000||
   fields.title.length>120)return false;
  const record:QuickNoteDraft={
   schema:'dayframe.quick-note-draft.v1',noteId,revision,fields,updatedAt:Date.now()
  };
  const data=JSON.stringify(record);
  if(new TextEncoder().encode(data).byteLength>24000)return false;
  storage.setItem(key(scope,noteId),data);
  return true;
 }catch{return false;}
}
export function readQuickNoteDraft(
 scope:string,noteId:string,storage:Pick<Storage,'getItem'>=localStorage
):QuickNoteDraft|null{
 try{
  const data=storage.getItem(key(scope,noteId));
  if(!data||data.length>24000)return null;
  const row:unknown=JSON.parse(data);
  if(!row||typeof row!=='object'||Array.isArray(row))return null;
  const d=row as Record<string,unknown>;
  if(d.schema!=='dayframe.quick-note-draft.v1'||d.noteId!==noteId||
   !Number.isSafeInteger(d.revision)||Number(d.revision)<0||
   !Number.isFinite(d.updatedAt)||!d.fields||typeof d.fields!=='object'||
   Array.isArray(d.fields))return null;
  const f=d.fields as Record<string,unknown>;
  if(typeof f.workspace!=='string'||typeof f.title!=='string'||f.title.length>120||
   typeof f.content!=='string'||f.content.length>8000||
   typeof f.color!=='string'||typeof f.pinned!=='boolean'||
   !(f.reminder===null||typeof f.reminder==='string')||
   !(f.reminderTime===null||typeof f.reminderTime==='string'))return null;
  return row as QuickNoteDraft;
 }catch{return null;}
}
export function clearQuickNoteDraft(
 scope:string,noteId:string,storage:Pick<Storage,'removeItem'>=localStorage
):boolean{
 try{storage.removeItem(key(scope,noteId));return true;}catch{return false;}
}
