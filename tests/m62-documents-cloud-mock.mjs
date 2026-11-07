// Disposable, account-scoped fake for the M6.2 BlockNote UI browser harness.
// Never connects to Neon or sends a live API request.
const WORKSPACE='33333333-3333-4333-8333-333333333333';
const SEED='d1111111-1111-4111-8111-111111111111';
const clone=value=>JSON.parse(JSON.stringify(value));
const now='2026-11-07T00:00:00Z';
const seed={
 id:SEED,workspace:WORKSPACE,taskId:null,parentId:null,title:'Seed document',
 revision:1,deletedAt:null,createdAt:now,updatedAt:now,
 blocks:[{id:'paragraph0',type:'paragraph',
  props:{backgroundColor:'default',textColor:'default',textAlignment:'left'},
  content:[{type:'text',text:'Original text',styles:{}}],children:[]}]
};
const items=[seed];
const updates=[];
const creations=[];
const searches=[];
const exports=[];
function get(id){return items.find(d=>d.id===id);}
function missing(){throw Object.assign(Error('Document unavailable or changed'),{status:409});}
export const cloudApi={
 async searchDocuments(q,filters={}){
  searches.push({q,filters:clone(filters)});
  return clone(items.filter(d=>!d.deletedAt&&
   (!filters.workspace||d.workspace===filters.workspace)&&
   (!filters.taskId||d.taskId===filters.taskId)&&
   (d.title.toLowerCase().includes(q.toLowerCase())||
    JSON.stringify(d.blocks).toLowerCase().includes(q.toLowerCase())))
   .map(({blocks,...meta})=>meta));
 },
 async exportDocument(id){
  const item=get(id);if(!item||item.deletedAt)missing();
  exports.push(id);
  return {schema:'dayframe.document.export.v1',exportedAt:now,document:clone(item)};
 },
 async listDocuments(){
  return clone(items.filter(d=>!d.deletedAt).map(({blocks,...meta})=>meta));
 },
 async listDeletedDocuments(){
  return clone(items.filter(d=>d.deletedAt).map(({blocks,...meta})=>meta));
 },
 async getDocument(id){
  const found=get(id);
  if(!found||found.deletedAt)missing();
  return clone(found);
 },
 async createDocument(id,body){
  creations.push({id,body:clone(body)});
  const prior=get(id);
  if(prior){
   if(JSON.stringify(prior.blocks)!==JSON.stringify(body.blocks)||
      prior.title!==body.title||prior.workspace!==body.workspace||
      prior.taskId!==body.taskId||prior.parentId!==body.parentId)missing();
   return clone(prior);
  }
  const item={id,...clone(body),revision:1,deletedAt:null,
   createdAt:now,updatedAt:now};
  items.push(item);
  if(window.__docMock.failNextCreateAfterCommit){
   window.__docMock.failNextCreateAfterCommit=false;
   throw Error('Synthetic connection loss after committed creation');
  }
  return clone(item);
 },
 async updateDocument(id,revision,body){
  const item=get(id);
  if(!item||item.deletedAt||item.revision!==revision)missing();
  updates.push({id,revision,body:clone(body)});
  Object.assign(item,clone(body),{revision:item.revision+1,updatedAt:now});
  return clone(item);
 },
 async deleteDocument(id,revision){
  const item=get(id);
  if(!item||item.deletedAt||item.revision!==revision||
   items.some(d=>!d.deletedAt&&d.parentId===id))missing();
  item.deletedAt=now;item.revision++;return;
 },
 async restoreDocument(id,revision){
  const item=get(id);
  if(!item||!item.deletedAt||item.revision!==revision)missing();
  item.deletedAt=null;item.revision++;return clone(item);
 }
};
Object.assign(window,{__docMock:{items,updates,creations,searches,exports,workspace:WORKSPACE,seed:SEED,failNextCreateAfterCommit:false}});
