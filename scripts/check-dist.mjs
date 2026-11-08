import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve('dist');
const html = readFileSync(resolve(dir, 'index.html'), 'utf8');
if (!html.includes('id="root"')) throw new Error('React root missing in compiled index');
const stage=process.env.VITE_DAYFRAME_TARGET==='staging';
const base=stage?'/':'/planner/';
if (!html.includes(base+'assets/')) throw new Error('Incorrect Vite assets base for '+base);
if(stage&&html.includes('/planner/assets/'))throw new Error('Staging assets leaked Pages base');
if (!existsSync(resolve(dir, 'assets'))) throw new Error('Build assets folder is missing');
const assets = readdirSync(resolve(dir, 'assets'));
if (!assets.some(name => /^index-.*\.js$/.test(name))) throw new Error('React entry bundle is missing');
if (!assets.some(name => /^index-.*\.css$/.test(name))) throw new Error('Compiled CSS is missing');
if(stage){
 const js=assets.filter(name=>name.endsWith('.js')).map(name=>
  readFileSync(resolve(dir,'assets',name),'utf8')).join('\n');
 if(!js.includes('br-delicate-violet-b9cnjyuh-dayframeapi')||
    !js.includes('ep-wispy-surf-b94f834t.neonauth'))
  throw new Error('Missing isolated staging endpoints in compiled JS');
 if(js.includes('br-shiny-king-b9np2anx-dayframeapi')||
    js.includes('ep-blue-salad-b9534bb3.neonauth'))
  throw new Error('Production hostname leaked into staging JavaScript');
 console.log('PASS: staging bundle includes only isolated Neon endpoints');
}
for(const name of ['sw.js','manifest.webmanifest','icon.svg',
 'icon-192.png','icon-512.png','offline.html']){
 if(!existsSync(resolve(dir,name)))throw new Error('Missing public PWA asset '+name);
}
const manifest=JSON.parse(readFileSync(resolve(dir,'manifest.webmanifest'),'utf8'));
if(manifest.start_url!==base||manifest.scope!==base||manifest.id!==base||
 manifest.icons?.length<2)
 throw new Error('PWA manifest scope or install icons missing');
if(!html.includes(base+'manifest.webmanifest'))
 throw new Error('Built site is missing scoped PWA manifest');
console.log('PASS: PWA manifest, install icons, offline fallback and worker');
console.log('PASS: React website build, CSS and '+(stage?'Vercel root':'Pages subpath'));
