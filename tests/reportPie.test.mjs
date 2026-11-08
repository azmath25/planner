import test from 'node:test';
import assert from 'node:assert/strict';
import {pieSegments,pieGradient} from '../web/src/domain/reportPie.ts';
test('pie chart sums actual recorded time and preserves percentages',()=>{
 const data=pieSegments([{label:'Research',value:7200000},{label:'Admin',value:3600000},{label:'Unused',value:0}]);
 assert.equal(data.total,10800000);
 assert.deepEqual(data.segments.map(s=>s.percentage),[66.7,33.3]);
 assert.ok(Math.abs(data.segments.at(-1).end-360)<0.000001);
 assert.match(pieGradient(data),/^conic-gradient\(/);
});
test('empty and invalid data display an honest zero state',()=>{
 const pie=pieSegments([{label:'Invalid',value:-10},{label:'Nan',value:NaN}]);
 assert.equal(pie.total,0);
 assert.deepEqual(pie.segments,[]);
 assert.equal(pieGradient(pie),'#d9e4df');
});
test('too many slices group into Other while preserving the total',()=>{
 const data=pieSegments(Array.from({length:12},(_,i)=>({label:'W'+i,value:i+1})));
 assert.equal(data.total,78);
 assert.equal(data.segments.length,8);
 assert.equal(data.segments.at(-1).label,'Other');
 assert.equal(data.segments.reduce((s,x)=>s+x.value,0),78);
});
