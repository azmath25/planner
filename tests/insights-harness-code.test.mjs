import test from 'node:test';
import assert from 'node:assert/strict';
import {wrapInsightsCsvHelper} from './insights-harness-code.mjs';

test('M8 H2 browser Insights helper emits executable JavaScript with actual newlines',()=>{
 const source=wrapInsightsCsvHelper(
  'function timeInsightsCsv(value){return String(value).toUpperCase();}\n'
 );
 const fn=new Function(source+'\nreturn timeInsightsCsv;')();
 assert.equal(fn('research'),'RESEARCH');
 assert.ok(source.includes('\nreturn timeInsightsCsv;\n'));
 assert.ok(!source.includes('\\nreturn timeInsightsCsv;'));
});

test('M8 H2 browser Insights helper rejects malformed and missing exports',()=>{
 assert.throws(()=>wrapInsightsCsvHelper('function timeInsightsCsv( {'),SyntaxError);
 assert.throws(()=>wrapInsightsCsvHelper('const notAnInsightsFormatter=1;'),/not found/);
});
