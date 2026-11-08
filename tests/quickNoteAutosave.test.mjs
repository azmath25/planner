import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const output=await build({entryPoints:['web/src/domain/quickNoteAutosave.ts'],
 bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {createQuickNoteAutosaver}=await import(
 'data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].contents).toString('base64'));
const fields=(content='Draft',title='')=>({
 workspace:'workspace-1',title,content,color:'cream',pinned:false,
 reminder:null,reminderTime:null
});
const mem=()=>{
 const map=new Map();
 return {map,
  setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)??null,
  removeItem:k=>map.delete(k)};
};
const note=(id,revision,entry)=>({id,revision,...entry});
function setup({scope='user-1',id=null,revision=0,initial=fields('', '')}={}){
 const storage=mem(),notes=new Map(),statuses=[],saved=[];
 let creates=0,updates=0;
 const api={
  async create(clientId,body){
   creates++;
   if(notes.has(clientId))return notes.get(clientId);
   const n=note(clientId,1,body);notes.set(clientId,n);return n;
  },
  async update(clientId,base,body){
   updates++;
   const n=notes.get(clientId);
   if(!n||n.revision!==base)throw Object.assign(Error('Revision conflict'),{status:409});
   const changed=note(clientId,base+1,body);notes.set(clientId,changed);return changed;
  },
  async list(){return [...notes.values()];}
 };
 const controller=createQuickNoteAutosaver({scope,id,revision,initial,storage,api,
  onSaved:n=>saved.push(n),onStatus:s=>statuses.push(s)});
 return {controller,storage,notes,statuses,saved,api,
  counts:()=>({creates,updates})};
}
test('new Quick Notes are named from their first sentence and saved automatically',async()=>{
 const h=setup();
 h.controller.change(fields('This is my first idea. More text later.'));
 assert.equal(h.controller.isDirty(),true);
 assert.equal(await h.controller.flush(),true);
 assert.equal(h.controller.isSaved(),true);
 assert.equal(h.notes.size,1);
 assert.equal([...h.notes.values()][0].title,'This is my first idea.');
 assert.equal(h.storage.map.size,0);
 h.controller.dispose();
});
test('rapid typing while creation is in-flight never loses the newer text',async()=>{
 const h=setup();
 let release;
 let calls=0;
 const delayed={
  ...h.api,
  create:async(id,body)=>{
   calls++;
   await new Promise(r=>{release=r;});
   const item=note(id,1,body);h.notes.set(id,item);return item;
  }
 };
 h.controller.dispose();
 const controller=createQuickNoteAutosaver({
  scope:'user-1',id:null,revision:0,initial:fields('', ''),storage:h.storage,api:delayed,
  onSaved:n=>h.saved.push(n),onStatus:s=>h.statuses.push(s)});
 controller.change(fields('First draft.'));
 const first=controller.flush();
 await Promise.resolve();
 controller.change(fields('Newer text written while saving.'));
 release();
 assert.equal(await first,false);
 assert.equal(controller.isDirty(),true);
 assert.equal(await controller.flush(),true);
 assert.equal(calls,1);
 assert.equal([...h.notes.values()][0].content,'Newer text written while saving.');
 controller.dispose();
});
test('lost creation response reconciles its stable UUID before retry',async()=>{
 const h=setup();
 let calls=0;
 const uncertain={...h.api,async create(id,body){
  calls++;
  h.notes.set(id,note(id,1,body));
  throw Error('Response was lost after commit');
 }};
 h.controller.dispose();
 const c=createQuickNoteAutosaver({
  scope:'user-1',id:null,revision:0,initial:fields('', ''),storage:h.storage,api:uncertain,
  onSaved:n=>h.saved.push(n),onStatus:s=>h.statuses.push(s)});
 c.change(fields('Keep this one, not a duplicate.'));
 assert.equal(await c.flush(),false);
 assert.equal(await c.flush(),false); // Reconcile GET, no second POST.
 assert.equal(c.isSaved(),true);
 assert.equal(h.notes.size,1);
 assert.equal(calls,1);
 c.dispose();
});
test('cloud conflict never overwrites another device, local draft remains readable',async()=>{
 const h=setup({id:'11111111-1111-4111-8111-111111111111',revision:1,initial:fields('Original','Existing')});
 const uuid='11111111-1111-4111-8111-111111111111';
 h.notes.set(uuid,note(uuid,1,fields('Original','Existing')));
 const conflicting={...h.api,async update(id,base,body){
  h.notes.set(id,note(id,base+1,fields('Changes from another device','Existing')));
  throw Error('Connection lost');
 }};
 h.controller.dispose();
 const c=createQuickNoteAutosaver({
  scope:'user-1',id:uuid,revision:1,initial:fields('Original','Existing'),
  storage:h.storage,api:conflicting,
  onSaved:n=>h.saved.push(n),onStatus:s=>h.statuses.push(s)});
 c.change(fields('My unsynced work','Existing'));
 assert.equal(await c.flush(),false);
 assert.equal(await c.flush(),false);
 assert.equal(c.hasConflict(),true);
 assert.equal(h.notes.get(uuid).content,'Changes from another device');
 assert.ok([...h.storage.map.values()][0].includes('My unsynced work'));
 c.dispose();
});
test('a recovered draft is scoped to the intended signed-in account',()=>{
 const storage=mem(),id='22222222-2222-4222-8222-222222222222';
 const opts={id,revision:2,initial:fields('Cloud','Old'),storage,
  api:{create:async()=>null,update:async()=>null,list:async()=>[]},
  onSaved:()=>{},onStatus:()=>{}};
 const one=createQuickNoteAutosaver({...opts,scope:'alice'});
 one.change(fields('Alice draft','Old'));one.dispose();
 const bob=createQuickNoteAutosaver({...opts,scope:'bob'});
 assert.equal(bob.recovered,false);bob.dispose();
 const again=createQuickNoteAutosaver({...opts,scope:'alice'});
 assert.equal(again.recovered,true);
 assert.equal(again.initialFields.content,'Alice draft');
 again.dispose();
});
