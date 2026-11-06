import fs from 'node:fs';
import ts from 'typescript';
function stripped(path){return ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;}
const base='web/src/';
let domain=stripped(base+'domain/timeTracking.ts').replace(/\bexport /g,'');
let adapter=stripped(base+'legacy/legacy.ts')
  .replace(/^import \{[^\n]+\} from '\.\.\/domain\/timeTracking';\n/m,'')
  .replace('export function mountLegacyDayframe()', 'function mountLegacyDayframe()');
fs.mkdirSync('tests/.harness',{recursive:true});
fs.writeFileSync('tests/.harness/app.js',domain+'\n'+adapter+'\nmountLegacyDayframe();');
fs.copyFileSync(base+'styles.css','tests/.harness/styles.css');
