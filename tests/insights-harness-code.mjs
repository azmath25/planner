// The M7.3 browser fixture injects the real TypeScript CSV formatter after
// transpilation, without a module bundler. Fail early if that generated source
// is not valid standalone JavaScript (notably literal backslash-n escapes).
export function wrapInsightsCsvHelper(transpiled){
 if(typeof transpiled!=='string'||!transpiled.includes('function timeInsightsCsv('))
  throw Error('Insights CSV formatter was not found in transpiled source');
 const source='const timeInsightsCsv=(function(){\n'+transpiled+
  '\nreturn timeInsightsCsv;\n})();\n';
 // Parse only, do not execute; this checks the exact string inserted into
 // the Playwright harness instead of merely checking this builder's syntax.
 new Function(source);
 return source;
}
