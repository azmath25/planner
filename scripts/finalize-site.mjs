#!/usr/bin/env node
// Build-only PWA finalization. Never contacts a backend or writes credentials.
// GitHub Pages remains /planner/; explicitly opted-in staging is root-hosted.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const target=process.env.VITE_DAYFRAME_TARGET;
if(target!==undefined&&target!=='staging'&&target!=='production')
  throw Error('Unknown Dayframe build target');
const path=resolve('dist/manifest.webmanifest');
const manifest=JSON.parse(readFileSync(path,'utf8'));
const base=target==='staging'?'/':'/planner/';
manifest.id=base;
manifest.start_url=base;
manifest.scope=base;
writeFileSync(path,JSON.stringify(manifest,null,2)+'\n');
console.log('Dayframe PWA manifest scope: '+base);
