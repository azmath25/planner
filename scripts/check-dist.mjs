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
console.log('PASS: React website build, CSS and Pages subpath');
