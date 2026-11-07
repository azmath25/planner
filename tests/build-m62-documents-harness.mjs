// Run only in an isolated local M8.3 verification environment after deps install.
// Builds the actual React/BlockNote UI with a substituted in-memory API module.
import {build} from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
fs.mkdirSync('tests/.harness',{recursive:true});
await build({
 entryPoints:['tests/m62-documents-entry.tsx'],
 outfile:'tests/.harness/m62-documents.js',
 bundle:true,format:'iife',platform:'browser',target:'es2022',
 loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl','.svg':'dataurl','.png':'dataurl'},
 plugins:[{
  name:'mock-private-documents',
  setup(context){
   context.onResolve({filter:/^\.\.\/auth\/api$/},()=>({
    path:path.resolve('tests/m62-documents-cloud-mock.mjs')
   }));
  }
 }]
});
