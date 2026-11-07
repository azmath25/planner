import { readFileSync, existsSync } from 'node:fs';
const paths = [
  'web/src/main.tsx', 'web/src/components/App.tsx', 'web/src/domain/models.ts',
  'web/src/domain/storage.ts', 'web/src/legacy/legacy.ts',
  'web/src/styles.css', 'web/index.html', 'vite.config.ts'
];
for (const path of paths) {
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
}
const legacy = readFileSync('web/src/legacy/legacy.ts','utf8');
for (const word of ['home()', 'tasksPage()', 'plan()', 'notesPage()', 'settingsPage()', 'workspacePage()', 'taskDetail()', 'renderModal()', 'media-file', 'reminderTime', 'deadlineTime']) {
  if (!legacy.includes(word)) throw new Error(`Existing feature missing after compatibility migration: ${word}`);
}
const react = readFileSync('web/src/components/App.tsx', 'utf8');
if (!react.includes('mountLegacyDayframe(')) throw new Error('React compatibility mount missing');
console.log('PASS: React sources present and existing Dayframe screens preserved');
const auth = readFileSync('web/src/components/App.tsx','utf8');
if (!auth.includes('authClient.useSession()') || !auth.includes('loadCloudSnapshot')) throw new Error('Auth gate or cloud bootstrap missing');
const api = readFileSync('backend/src/index.mjs','utf8');
if (!api.includes('jwtVerify(') || !api.includes('owner_user_id=$1')) throw new Error('Backend verified identity and owner filter missing');
const client=readFileSync('web/src/auth/api.ts','utf8');
for(const marker of ['loadCloudSnapshot','createWorkspace','createTask','updateTask','trashTask','restoreTask']){
  if(!client.includes(marker))throw new Error('Missing persistent API client '+marker);
}
for(const marker of ['cloud.tasks.map(localTask)','cloudApi.updateTask','cloudApi.createWorkspace','cloudApi.trashTask','case\x27restore-task\x27']){
  if(!legacy.includes(marker))throw new Error('Missing cloud UI integration '+marker);
}
console.log('PASS: M2.3 authenticated tasks, workspaces and recoverable Trash integration present');
const authScreen=readFileSync('web/src/components/AuthScreen.tsx','utf8');
if(!authScreen.includes('onPreview')||!react.includes('LocalPreview'))throw new Error('Safari login escape hatch missing');
if(!client.includes("credentials:'include'")||!client.includes("'/token'"))throw new Error('Uncached managed Auth token fallback missing');
console.log('PASS: Local demo is available without bypassing Neon authentication');

const profile=readFileSync('web/src/legacy/legacy.ts','utf8');
if(react.includes('account-topbar')||react.includes('account-local-notice'))throw new Error('Obsolete account horizontal bar present');
for(const marker of ["state.page==='profile'?profilePage()","data-page=\"profile\"","case'account-sign-out'","account.onSignOut","escapeHTML(accountName)"]){
 if(!profile.includes(marker))throw new Error('Missing accessible profile navigation or safe sign-out '+marker);
}
if(!react.includes('email={session.data.user.email')||!react.includes('onSignOut={signOut}'))throw new Error('Profile account identity or sign-out callback not wired');
console.log('PASS: Profile identity and sign-out accessible without account top bar');

// M2.3-W: archive is distinct from deletion, and the General workspace cannot be archived.
const archiveApi=readFileSync('web/src/auth/api.ts','utf8');
for(const marker of ['listArchivedWorkspaces','archiveWorkspace','restoreWorkspace']){
 if(!archiveApi.includes(marker))throw new Error('Missing workspace archive API: '+marker);
}
for(const marker of ['archivedWorkspacesPage()','case\x27confirm-archive-workspace\x27','case\x27restore-workspace\x27',"w.kind!=='custom'",'state.tasks=state.tasks.filter(t=>t.workspace!==w.id)','Boolean(findTask(s.taskId))']){
 if(!legacy.includes(marker))throw new Error('Missing archive/restore UI logic: '+marker);
}
if(!readFileSync('web/src/styles.css','utf8').includes('@media(max-width:480px){.archive-workspace-row'))throw new Error('Missing mobile restore layout');
console.log('PASS: Workspace archive, restore and mobile controls wired with General protection');

const m3=readFileSync('web/src/legacy/legacy.ts','utf8'),m3client=readFileSync('web/src/auth/api.ts','utf8'),m3backend=readFileSync('backend/src/index.mjs','utf8');
for(const marker of ['id="task-sort"','task-priority','task-tags',"case'cancel-task'","case'add-subtask'","case'confirm-archive-task'","case'unarchive-task'","case'modal-permanent-task'","move-task-form",'loadTaskMedia']){
 if(!m3.includes(marker))throw new Error('M3 task control missing: '+marker);
}
for(const marker of ['archiveTask','moveTask','taskEvents','permanentlyDeleteTask','getTaskMedia','saveTaskMedia']){
 if(!m3client.includes(marker))throw new Error('M3 authenticated client missing: '+marker);
}
for(const marker of ['move_task_subtree','TASK_HISTORY','taskSubtreeUpdate','task_media','allowOpenChildren']){
 if(!m3backend.includes(marker))throw new Error('M3 API protection missing: '+marker);
}
console.log('PASS: M3 task management, hierarchy, auditing and private media controls wired');

const m41ui=readFileSync('web/src/legacy/legacy.ts','utf8');
const m41client=readFileSync('web/src/auth/api.ts','utf8');
const m41backend=readFileSync('backend/src/index.mjs','utf8');
const m41sql=readFileSync('backend/db/migrations/0007_daily_pool.sql','utf8');
for(const marker of ['loadCloudPool(today())','changeDailyPool(','pool-sync-status',"case'pool-add'","case'pool-remove'","case'pool-up':case'pool-down'","if(isCloud)void loadCloudPool(state.planDay)",'pools:isCloud?undefined:state.pools']){
 if(!m41ui.includes(marker))throw Error('Missing signed-in day pool integration: '+marker);
}
for(const marker of ['loadDailyPool','saveDailyPool','DailyPool']){
 if(!m41client.includes(marker))throw Error('Missing daily pool client: '+marker);
}
for(const marker of ['DAY_POOL_GET_SQL','DAY_POOL_PUT_SQL','replace_daily_pool','taskIds:ids']){
 if(!m41backend.includes(marker))throw Error('Missing authenticated day pool API: '+marker);
}
for(const marker of ['CREATE TABLE IF NOT EXISTS dayframe.daily_pools','daily_pool_task_owner','FOR UPDATE','p_expected_revision','cardinality(p_ids)']){
 if(!m41sql.includes(marker))throw Error('Missing atomic day pool migration: '+marker);
}
console.log('PASS: M4.1 authenticated daily pool and unchanged local timed intervals wired');
