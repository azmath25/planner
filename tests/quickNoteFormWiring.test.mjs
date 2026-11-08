import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync('web/src/legacy/legacy.ts','utf8');
test('Quick Note form is autosave-first without mandatory title',()=>{
 assert.match(ui,/Title \(optional\)/);
 assert.match(ui,/First sentence becomes the title/);
 assert.doesNotMatch(ui,/name="title" id="ntitle" required/);
 assert.match(ui,/id="note-autosave-status"/);
 assert.match(ui,/beginNoteAutosave\(\)/);
 assert.match(ui,/noteAutoController\?\.change\(noteFormFields\(form\)\)/);
 assert.match(ui,/controller\.flush\(true\)/);
 assert.doesNotMatch(ui,/The previous save may have succeeded\. Restore the original fields/);
});
test('A note editor is not remounted or discarded by periodic UI refreshes',()=>{
 assert.match(ui,/const savedNoteFields=oldForm\?\.dataset\.noteContext/);
 assert.match(ui,/current\.focus\(\{preventScroll:true\}\)/);
 assert.match(ui,/case'modal-note'[\s\S]{0,260}beginNoteAutosave\(\)/);
 assert.match(ui,/case'edit-note'[\s\S]{0,350}beginNoteAutosave\(\)/);
 assert.match(ui,/Your unsynced Quick Note draft remains on this device/);
});
