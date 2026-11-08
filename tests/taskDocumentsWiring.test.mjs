import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const taskUi=readFileSync('web/src/legacy/legacy.ts','utf8');
const docs=readFileSync('web/src/components/DocumentPage.tsx','utf8');

test('task Notes panel offers working task documents rather than milestone placeholder',()=>{
 assert.doesNotMatch(taskUi,/Autosave arrives in M6\.3/);
 assert.match(taskUi,/data-action="documents-task"/);
 assert.match(taskUi,/Add or open documents/);
 assert.match(taskUi,/case'documents-task'/);
 assert.match(taskUi,/state\.documentTaskId=task\.id/);
 assert.match(taskUi,/initialTaskId:state\.documentTaskId/);
});
test('new documents started from a task stay attached to that task',()=>{
 assert.match(docs,/useState<string\|null>\(initialTaskId\|\|null\)/);
 assert.match(docs,/taskId:parent\?\.taskId\?\?filterTask/);
 assert.match(docs,/filterTask\?'New task document':'New document'/);
 assert.match(docs,/filterTask\?'Task documents':'Documents'/);
});
test('task and notes screens no longer claim that autosave is a future feature',()=>{
 assert.doesNotMatch(taskUi,/Save edits explicitly\./);
 assert.match(taskUi,/autosave while you write/);
 assert.match(taskUi,/autosave as you write/);
});

test('existing unassigned documents can be linked safely without moving unrelated pages',()=>{
 assert.match(docs,/Add an existing document to this task/);
 assert.match(docs,/d\.taskId===null&&/);
 assert.match(docs,/d\.parentId===null/);
 assert.match(docs,/!documents\.some\(child=>child\.parentId===d\.id\)/);
 assert.match(docs,/const full=await cloudApi\.getDocument\(candidate\.id\)/);
 assert.match(docs,/full\.workspace!==initialWorkspaceId\|\|full\.taskId!==null/);
 assert.match(docs,/await cloudApi\.updateDocument\(full\.id,full\.revision,\{/);
 assert.match(docs,/workspace:full\.workspace,taskId:filterTask,parentId:null/);
 assert.match(docs,/Attach to task/);
});

test('unlinking a task document keeps its contents and respects revisions',()=>{
 assert.match(docs,/const unlinkFromTask=async\(\)=>\{/);
 assert.match(docs,/if\(dirty\|\|savingRef\.current\)/);
 assert.match(docs,/remote\.revision!==active\.revision/);
 assert.match(docs,/taskId:null,parentId:null/);
 assert.match(docs,/title:remote\.title,blocks:remote\.blocks/);
 assert.match(docs,/Remove from task/);
 assert.match(docs,/Nested documents must stay with their parent page/);
});
