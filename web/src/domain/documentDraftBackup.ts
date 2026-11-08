// Account-scoped local safety net for unsynced drafts. This is not a substitute
// for confirmed Neon persistence. No authentication tokens are stored here.
export type UnsyncedDocumentDraft={
 schema:'dayframe.unsynced-document.v1';
 id:string;revision:number;title:string;blocks:unknown[];updatedAt:number;
};
const PREFIX='dayframe.unsynced-document.v1.';
const MAX_BYTES=240000;
function key(scope:string,id:string):string{
 return PREFIX+encodeURIComponent(scope)+'.'+encodeURIComponent(id);
}
export function saveUnsyncedDraft(
 scope:string,id:string,revision:number,title:string,blocks:unknown[],
 storage:Pick<Storage,'setItem'>=localStorage
):boolean{
 try{
  const record:UnsyncedDocumentDraft={
   schema:'dayframe.unsynced-document.v1',id,revision,title,blocks,updatedAt:Date.now()
  };
  const json=JSON.stringify(record);
  if(new TextEncoder().encode(json).byteLength>MAX_BYTES)return false;
  storage.setItem(key(scope,id),json);
  return true;
 }catch{return false;}
}
export function readUnsyncedDraft(
 scope:string,id:string,storage:Pick<Storage,'getItem'>=localStorage
):UnsyncedDocumentDraft|null{
 try{
  const json=storage.getItem(key(scope,id));
  if(!json||new TextEncoder().encode(json).byteLength>MAX_BYTES)return null;
  const value:unknown=JSON.parse(json);
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;
  if(row.schema!=='dayframe.unsynced-document.v1'||row.id!==id||
   !Number.isSafeInteger(row.revision)||Number(row.revision)<1||
   typeof row.title!=='string'||row.title.length>160||
   !Array.isArray(row.blocks)||!Number.isFinite(row.updatedAt))return null;
  return row as UnsyncedDocumentDraft;
 }catch{return null;}
}
export function clearUnsyncedDraft(
 scope:string,id:string,storage:Pick<Storage,'removeItem'>=localStorage
):boolean{
 try{storage.removeItem(key(scope,id));return true;}catch{return false;}
}
