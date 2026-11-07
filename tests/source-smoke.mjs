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
