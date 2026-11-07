import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve('dist');
const html = readFileSync(resolve(dir, 'index.html'), 'utf8');
if (!html.includes('id="root"')) throw new Error('React root missing in compiled index');
if (!html.includes('/planner/assets/')) throw new Error('GitHub Pages /planner/ base path missing');
if (!existsSync(resolve(dir, 'assets'))) throw new Error('Build assets folder is missing');
const assets = readdirSync(resolve(dir, 'assets'));
if (!assets.some(name => /^index-.*\.js$/.test(name))) throw new Error('React entry bundle is missing');
if (!assets.some(name => /^index-.*\.css$/.test(name))) throw new Error('Compiled CSS is missing');
for(const name of ['sw.js','manifest.webmanifest','icon.svg',
 'icon-192.png','icon-512.png','offline.html']){
 if(!existsSync(resolve(dir,name)))throw new Error('Missing public PWA asset '+name);
}
const manifest=JSON.parse(readFileSync(resolve(dir,'manifest.webmanifest'),'utf8'));
if(manifest.start_url!=='/planner/'||manifest.scope!=='/planner/'||
 manifest.icons?.length<2)
 throw new Error('PWA manifest scope or install icons missing');
if(!html.includes('/planner/manifest.webmanifest'))
 throw new Error('Built site is missing scoped PWA manifest');
console.log('PASS: PWA manifest, install icons, offline fallback and worker');
console.log('PASS: React website build, CSS and Pages subpath');
