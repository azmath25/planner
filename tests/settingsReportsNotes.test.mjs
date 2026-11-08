import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
const ui=readFileSync('web/src/legacy/legacy.ts','utf8');
const css=readFileSync('web/src/styles.css','utf8');
const subset=(a,b)=>ui.slice(ui.indexOf(a),ui.indexOf(b,ui.indexOf(a)+a.length));
test('repeated selected navigation returns Home and clears stale report context',()=>{
 assert.match(ui,/if\(page===state\.page&&page!=='home'\)page='home'/);
 assert.match(ui,/b\.dataset\.page===state\.page&&state\.page!=='home'\?'home'/);
 assert.match(ui,/if\(destination==='reports'&&state\.page!=='reports'\)state\.reportContext=null/);
});
test('Home has small metrics but no duplicated giant report card',()=>{
 const home=subset('function home(){','\nfunction ');
 assert.doesNotMatch(home,/homeWeeklyReport\(\)/);
 assert.match(home,/df-home-metrics/);
 assert.doesNotMatch(home,/data-page="reports"/);
 assert.match(home,/data-action="home-focus-jump"/);
});
test('tasks have sixth reports metric and workspaces have contextual report button',()=>{
 assert.match(ui,/class="card metric df-report-tile"/);
 assert.match(ui,/data-scope="\$\{t\.long\?'workflow':'task'\}"/);
 assert.match(ui,/data-scope="workspace"/);
 assert.match(ui,/case'report-context'/);
 assert.match(ui,/case'report-context-clear'/);
 assert.match(ui,/w\.workspaceId===serverWorkspaceId\(context\.id\)/);
 assert.match(ui,/taskTimeMs\(t\)/);
});
test('Appearance settings are flat, allow true monochrome, and control activity visibility',()=>{
 const settings=subset('function settingsPage(){','\nfunction taskDetail(){');
 assert.match(settings,/Appearance & settings/);
 assert.match(settings,/monochrome/);
 assert.match(settings,/activity-visibility/);
 assert.match(settings,/Task activity history/);
 assert.match(ui,/showActivity:!!saved\.showActivity/);
 assert.match(ui,/state\.showActivity\?/);
 assert.match(css,/\[data-theme="monochrome"\]/);
 assert.match(css,/--radius:0px/);
 assert.match(css,/border-radius:0!important/);
});
test('Quick Note cards have only Delete and rich documents carry photos/downloads',()=>{
 const home=subset('function home(){','\nfunction ');
 const notes=subset('function notesPage(){','\nfunction ');
 assert.match(home,/df-quick-note-card/);
 assert.match(notes,/df-quick-note-card/);
 assert.match(home,/data-action="delete-note"/);
 assert.match(notes,/data-action="delete-note"/);
 assert.doesNotMatch(home,/data-action="download-note"|data-action="toggle-note-pin"|Open task/);
 assert.doesNotMatch(notes,/data-action="download-note"|data-action="toggle-note-pin"|data-action="convert-note"/);
 assert.doesNotMatch(ui.slice(ui.indexOf('<form id="note-form"'),ui.indexOf('<form id="note-form"')+4900),
  /note-photo-file|download-current-note/);
});
test('Browser Back traverses Dayframe history before leaving a nested page',()=>{
 assert.match(ui,/window\.history\.pushState\(entry/);
 assert.match(ui,/window\.addEventListener\('popstate',onAppPopState\)/);
 assert.match(ui,/window\.removeEventListener\('popstate',onAppPopState\)/);
 assert.match(ui,/function onAppPopState\(event\)/);
 assert.match(ui,/state\.page=destination/);
 assert.match(ui,/state\.modal=\['note','note-edit'\]/);
});
