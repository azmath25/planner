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
 assert.match(home,/data-page="reports"/);
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
test('Quick Notes support safe links, HTML export and one owner-private photo',()=>{
 assert.match(ui,/noteLinksHtml\(n\.content\)/);
 assert.match(ui,/data-action="download-note"/);
 assert.match(ui,/data-action="download-current-note"/);
 assert.match(ui,/noteDownloadHtml/);
 assert.match(ui,/id="note-photo-file"/);
 assert.match(ui,/saveQuickNotePhoto/);
 assert.match(ui,/deleteQuickNotePhoto/);
 assert.match(ui,/if\(e\.target\?\.id==='note-photo-file'\)return/);
});
