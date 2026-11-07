// M1 local-preview harness built from CURRENT application sources, not removed
// root app.js/styles.css from the pre-React prototype.
import fs from 'node:fs';
import ts from 'typescript';
function strip(path){
 return ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
 }).outputText
 .replace(/^import [^\n]+\n/gm,'')
 .replace(/^export \{\};?\s*$/gm,'')
 .replace(/\bexport /g,'');
}
const timer=strip('web/src/domain/timeTracking.ts');
const legacy=strip('web/src/legacy/legacy.ts');
fs.mkdirSync('tests/.harness',{recursive:true});
fs.writeFileSync('tests/.harness/app.js',timer+'\n'+legacy+'\nmountLegacyDayframe();');
fs.copyFileSync('web/src/styles.css','tests/.harness/styles.css');
