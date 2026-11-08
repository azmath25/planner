import test from 'node:test';
import assert from 'node:assert/strict';
import {saveUnsyncedDraft,readUnsyncedDraft,clearUnsyncedDraft} from '../web/src/domain/documentDraftBackup.ts';
function memoryStorage(){
 const values=new Map();
 return {
  setItem:(key,value)=>values.set(key,value),
  getItem:key=>values.get(key)??null,
  removeItem:key=>values.delete(key),
  keys:()=>[...values.keys()]
 };
}
test('invalid LaTeX or unfinished text is backed up without semantic validation',()=>{
 const store=memoryStorage();
 const blocks=[{type:'mathBlock',props:{},content:[
  {type:'text',text:'\\\\bad{formula',styles:{}}],children:[]}];
 assert.equal(saveUnsyncedDraft('user-A','doc-1',2,'Scratch',blocks,store),true);
 const recovered=readUnsyncedDraft('user-A','doc-1',store);
 assert.equal(recovered?.title,'Scratch');
 assert.deepEqual(recovered?.blocks,blocks);
 assert.equal(recovered?.revision,2);
});
test('local drafts are account-and-document scoped and cleared after cloud save',()=>{
 const store=memoryStorage();
 assert.equal(saveUnsyncedDraft('uid-1','a',1,'A',[],store),true);
 assert.equal(saveUnsyncedDraft('uid-2','a',1,'B',[],store),true);
 assert.equal(readUnsyncedDraft('uid-2','a',store)?.title,'B');
 assert.equal(readUnsyncedDraft('uid-1','a',store)?.title,'A');
 assert.equal(readUnsyncedDraft('uid-1','b',store),null);
 assert.equal(clearUnsyncedDraft('uid-1','a',store),true);
 assert.equal(readUnsyncedDraft('uid-1','a',store),null);
 assert.equal(readUnsyncedDraft('uid-2','a',store)?.title,'B');
});
test('oversized or inaccessible browser storage fails visibly without throwing',()=>{
 const store=memoryStorage();
 assert.equal(saveUnsyncedDraft('a','b',1,'x',[{text:'x'.repeat(250000)}],store),false);
 assert.equal(readUnsyncedDraft('a','b',store),null);
 const denied={setItem:()=>{throw Error('denied');},getItem:()=>{throw Error('denied');},removeItem:()=>{throw Error('denied');}};
 assert.equal(saveUnsyncedDraft('a','b',1,'x',[],denied),false);
 assert.equal(readUnsyncedDraft('a','b',denied),null);
 assert.equal(clearUnsyncedDraft('a','b',denied),false);
});
