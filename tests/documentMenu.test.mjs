import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const editor=readFileSync(new URL('../web/src/components/DocumentPage.tsx',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../web/src/legacy/legacy.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/src/styles.css',import.meta.url),'utf8');
const menuStart=editor.indexOf('<div className="df-doc-writing-bar">');
const menuEnd=editor.indexOf('<label className="field-wrap df-doc-title-field">',menuStart);
const bar=editor.slice(menuStart,menuEnd);
test('M12 document top bar contains only Back, unobtrusive status and Options',()=>{
 assert.ok(menuStart>0&&menuEnd>menuStart);
 assert.match(bar,/aria-label=\{active.parentId\?'Back to parent page':'Back to documents'\}/);
 assert.match(bar,/className="df-doc-options"/);
 assert.match(bar,/df-doc-menu-trigger/);
 assert.doesNotMatch(bar,/df-doc-zoom-control/,'Zoom must not crowd the title bar');
 assert.doesNotMatch(bar,/\>Download HTML\</,'Downloads belong within the options menu');
});
test('M12 all document actions are inside the compact options menu',()=>{
 for(const label of ['Save now','Download as…','Print / Save PDF','Archive document','Delete document','Go to workspace','Go to task','New child page'])
  assert.ok(bar.includes(label),'Missing action '+label);
 assert.ok(bar.indexOf('Archive document')<bar.indexOf('Delete document'));
 assert.match(legacy,/onGoTask:\(taskId\)=>/);
 assert.match(legacy,/onGoWorkspace:\(workspaceId\)=>/);
});
test('M12 zoom is lower right and hidden during active writing',()=>{
 assert.match(editor,/df-doc-zoom-control df-doc-zoom-floating/);
 assert.match(editor,/df-doc-zoom-writing/);
 assert.match(css,/\.df-doc-zoom-floating\{/);
 assert.match(css,/\.df-doc-zoom-floating\.df-doc-zoom-writing\{opacity:0;pointer-events:none\}/);
 assert.match(editor,/parent=documents.find\(d=>d.id===active.parentId\)/);
});
test('M12 archived documents are not trash and remain restorable',()=>{
 assert.match(editor,/const openArchive=async\(\)=>/);
 assert.match(editor,/const unarchive=async\(doc:CloudDocumentMeta\)=>/);
 assert.match(editor,/cloudApi\.archiveDocument\(active.id,active.revision\)/);
 assert.match(editor,/cloudApi\.unarchiveDocument\(doc.id,doc.revision\)/);
 assert.match(editor,/showArchive\?'Restore an archived document'/);
});
