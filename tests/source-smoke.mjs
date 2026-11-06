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
if (!auth.includes('authClient.useSession()') || !auth.includes('loadGeneralWorkspace')) throw new Error('Auth gate or general bootstrap missing');
const api = readFileSync('backend/src/index.mjs','utf8');
if (!api.includes('jwtVerify(') || !api.includes('owner_user_id=$1')) throw new Error('Backend verified identity and owner filter missing');
console.log('PASS: M2.2 auth and user-scoped workspace integration present');
