import test from 'node:test';
import assert from 'node:assert/strict';
import {periodReportCsv} from '../web/src/domain/reportCsv.ts';

const payload={
 period:'week',timeZone:'Asia/Baku',startDay:'2026-11-02',endDayExclusive:'2026-11-09',
 accountRecordedMs:3600000,accountLegacyEstimatedMs:100000,accountPlannedMinutes:120,
 runningIncluded:false,
 workspaces:[{
  workspaceId:'11111111-1111-4111-8111-111111111111',name:'=IMPORTXML("evil","data")',
  recordedMs:3600000,legacyEstimatedMs:100000,plannedMinutes:120,archived:false
 }],
 longTermTasks:[{
  taskId:'22222222-2222-4222-8222-222222222222',
  workspaceId:'11111111-1111-4111-8111-111111111111',title:' +CMD|"/C calc"!A0',
  status:'open',recordedMs:2000000,plannedMinutes:100
 }]
};
test('M7.3 CSV export is BOM+CRLF, quotes fields and does not double count ancestors',()=>{
 const csv=periodReportCsv(payload);
 assert.ok(csv.startsWith('\uFEFF'));
 assert.ok(csv.endsWith('\r\n'));
 assert.match(csv,/dayframe\.time\.report\.v1/);
 assert.match(csv,/Legacy estimated ms/);
 assert.match(csv,/do not sum/);
 assert.match(csv,/3600000/);
});
test('M7.3 CSV prevents untrusted titles becoming spreadsheet formulas',()=>{
 const csv=periodReportCsv(payload);
 assert.match(csv,/"'=IMPORTXML\(""evil"",""data""\)"/);
 assert.match(csv,/"' \+CMD\|""\/C calc""!A0"/);
 assert.doesNotMatch(csv,/,=IMPORTXML/);
});
