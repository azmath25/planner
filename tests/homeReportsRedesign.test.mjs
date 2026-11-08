import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync('web/src/legacy/legacy.ts','utf8');
const css=readFileSync('web/src/styles.css','utf8');
const section=(from,to)=>ui.slice(ui.indexOf(from),ui.indexOf(to,ui.indexOf(from)+from.length));
const home=section('function home(){','\nfunction ');
const profile=section('function profileNotifications(){','\nlet documentPageCleanup');
const distribution=section('function reportDistribution(report){','function signedInReportsPage(){');

test('Home prioritizes reports, today tasks, then editable Quick Notes',()=>{
 const tasks=home.indexOf('df-home-today');
 const notes=home.indexOf('df-home-notes');
 assert.ok(tasks>=0&&notes>tasks);
 assert.doesNotMatch(home,/homeWeeklyReport\(\)/);
 assert.match(home,/state\.notes\.filter/);
 assert.match(home,/data-action="edit-note"/);
 assert.match(home,/data-action="modal-note"/);
 assert.match(home,/data-page="notes"/);
 assert.match(home,/homePins\(\)/);
 assert.doesNotMatch(home,/A little progress|goes a long way|Welcome back/);
});
test('Home shortcuts are functional rather than decorative Android placeholders',()=>{
 assert.match(home,/data-page="plan"/);
 assert.match(home,/data-action="home-focus-jump"/);
 assert.match(home,/id="df-home-focus-task"/);
 assert.match(home,/data-action="home-start-focus"/);
 assert.match(ui,/case'home-start-focus'/);
 assert.match(ui,/updateTimer\('start',selected\)/);
 assert.match(ui,/case'home-focus-jump'/);
 assert.match(ui,/querySelector\('select'\)\?\.focus/);
});
test('Home shows exact daily metrics without fake or weekly totals',()=>{
 assert.match(ui,/cloudApi\.getTimePeriod\('day',day\)/);
 assert.match(ui,/state\.homeReport=report/);
 assert.match(ui,/accountRecordedMs/);
 assert.match(home,/Focus today/);
 assert.match(home,/Completed today/);
 assert.match(home,/Due today/);
 assert.doesNotMatch(home,/Focus this week|next 48h|Current tasks, all-time/);
 assert.doesNotMatch(home,/16h|64h|Illustrative|sample sessions/i);
});
test('Profile contains notification preferences and full reminder inbox, not Home',()=>{
 assert.match(home,/data-action="open-notifications"/);
 assert.doesNotMatch(home,/data-action="quiet-hours"|data-action="enable-push"/);
 for(const action of ['quiet-hours','use-device-zone','refresh-alerts','alert-snooze','alert-ack'])
  assert.ok(profile.includes('data-action="'+action+'"')||
   ['alert-snooze','alert-ack'].includes(action)&&profile.includes('data-action="'+action+'"'));
 assert.match(profile,/profile-notifications/);
 assert.match(ui,/\['home','profile'\]\.includes\(state\.page\)/);
});
test('Reports expose workspace, workflow, task and optional bar/pie/table lenses',()=>{
 for(const id of ['workspace','workflow','task','bar','pie','table']){
  assert.ok(distribution.includes("'"+id+"'"),id);
 }
 assert.match(ui,/case'report-scope'/);
 assert.match(ui,/case'report-chart'/);
 assert.match(distribution,/Period-specific task reporting requires a backend extension/);
 assert.match(distribution,/Nested project rollups are omitted to avoid double-counting/);
 assert.match(distribution,/pieGradient\(pie\)/);
});
test('Home and chart CSS reflow on narrow phones',()=>{
 assert.match(css,/\.df-home-metrics\{display:grid/);
 assert.match(css,/@media\(max-width:660px\)/);
 assert.match(css,/@media\(max-width:370px\)/);
 assert.match(css,/\.df-home-note-grid/);
 assert.match(css,/\.df-report-pie-content/);
 assert.match(css,/\.df-profile-reminder-actions/);
});
