import type {PeriodReport} from './timeReports';

function cell(input:unknown):string{
 let value=String(input??'');
 // Protect spreadsheet users from untrusted titles interpreted as formulas.
 if(/^[\s\u0000-\u001f]*[=+@-]/.test(value))value="'"+value;
 return '"'+value.replace(/"/g,'""')+'"';
}
const row=(values:unknown[])=>values.map(cell).join(',');
export function periodReportCsv(report:PeriodReport):string{
 const lines=[
  row(['Dayframe time report','dayframe.time.report.v1']),
  row(['Period',report.period,'Timezone',report.timeZone,
   'Start',report.startDay,'End exclusive',report.endDayExclusive]),
  row(['Category','Identifier','Name','Recorded ms','Fixed planned minutes',
   'Legacy estimated ms','Status','Important note']),
  row(['account','','All workspaces',report.accountRecordedMs,
   report.accountPlannedMinutes,report.accountLegacyEstimatedMs,'',
   'Account totals; legacy is approximate and excluded from recorded'])
 ];
 for(const w of report.workspaces){
  lines.push(row(['workspace',w.workspaceId,w.name??'Deleted workspace',
   w.recordedMs,w.plannedMinutes,w.legacyEstimatedMs,
   w.archived?'archived':'active',
   'Recorded time uses workspace-at-session-start']));
 }
 for(const t of report.longTermTasks){
  lines.push(row(['longTermTask',t.taskId,t.title,t.recordedMs,
   t.plannedMinutes,'',t.status,
   'Subtree rollup: may overlap other long-term tasks; do not sum']));
 }
 return '\uFEFF'+lines.join('\r\n')+'\r\n';
}
