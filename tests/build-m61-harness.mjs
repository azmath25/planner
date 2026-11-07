// M6.1 signed-in UI adapter. Run in the final integrated browser test gate.
import fs from 'node:fs';
import './build-m53-harness.mjs';
const source=fs.readFileSync('tests/.harness/m53-app.js','utf8');
const index=source.lastIndexOf('mountApp();');
if(index<0)throw Error('Expected original app mount');
const adapter=`
const GENERAL_NOTE='d1111111-1111-4111-8111-111111111111';
const RESEARCH_NOTE='d2222222-2222-4222-8222-222222222222';
const fakeNow='2026-11-07T15:00:00Z';
const createNote=(id,workspace,title,content,pinned=false)=>({
 id,workspace,title,content,color:'cream',pinned,
 reminder:null,reminderTime:null,convertedTaskId:null,convertedAt:null,
 revision:1,createdAt:fakeNow,updatedAt:fakeNow,deletedAt:null
});
mockDb.notes=[
 createNote(GENERAL_NOTE,GENERAL,'Remember graph proof','A mathematical idea',true),
 createNote(RESEARCH_NOTE,PROJECT,'Draft outline','A research note')
];
mockDb.noteConvertCalls=[];
mockDb.noteCreateCalls=[];
mockDb.noteSimulateLostResponse=true;
cloudApi.listQuickNotes=async()=>mockDb.notes.filter(n=>!n.deletedAt).map(n=>({...n}));
cloudApi.listTrashedQuickNotes=async()=>mockDb.notes.filter(n=>Boolean(n.deletedAt)).map(n=>({...n}));
cloudApi.restoreQuickNote=async(id,revision)=>{
 const note=mockDb.notes.find(n=>n.id===id&&n.deletedAt);
 if(!note||note.revision!==revision)
  throw Object.assign(Error('Deleted note changed'),{status:409});
 note.deletedAt=null;note.revision++;return {...note};
};
cloudApi.createQuickNote=async body=>{
 mockDb.noteCreateCalls.push({id:body.id,title:body.title});
 const prior=mockDb.notes.find(n=>n.id===body.id);
 if(prior){
  if(prior.title!==body.title)throw Object.assign(Error('Note ID already used'),{status:409});
  return {...prior};
 }
 const note={...createNote(body.id,body.workspace,body.title,body.content,body.pinned),
  color:body.color,reminder:body.reminder,reminderTime:body.reminderTime};
 mockDb.notes.unshift(note);
 if(body.title==='Retry note'&&mockDb.noteSimulateLostResponse){
  mockDb.noteSimulateLostResponse=false;
  throw Error('Connection lost after save');
 }
 return {...note};
};
cloudApi.updateQuickNote=async (id,body)=>{
 const note=mockDb.notes.find(n=>n.id===id&&!n.deletedAt);
 if(!note||note.revision!==body.revision)
  throw Object.assign(Error('Note changed on another device'),{status:409});
 Object.assign(note,body,{revision:note.revision+1,updatedAt:fakeNow});
 return {...note};
};
cloudApi.deleteQuickNote=async (id,revision)=>{
 const note=mockDb.notes.find(n=>n.id===id&&!n.deletedAt);
 if(!note||note.revision!==revision)
  throw Object.assign(Error('Note changed on another device'),{status:409});
 note.deletedAt=fakeNow;note.revision++;return;
};
cloudApi.convertQuickNote=async(id,revision,taskId,estimate)=>{
 const note=mockDb.notes.find(n=>n.id===id&&!n.deletedAt);
 if(!note)throw Object.assign(Error('Note unavailable'),{status:409});
 if(note.convertedTaskId){
  if(note.convertedTaskId!==taskId)throw Object.assign(Error('Already converted'),{status:409});
  return {note:{...note},task:{...mockDb.tasks.find(t=>t.id===taskId)}};
 }
 if(note.revision!==revision)
  throw Object.assign(Error('Note changed on another device'),{status:409});
 const task={...mockDb.tasks[0],id:taskId,workspace:note.workspace,
  title:note.title,notes:note.content,estimate,revision:1,
  status:'open',parent:null,pinned:false,tags:[],createdAt:fakeNow,updatedAt:fakeNow};
 mockDb.tasks.push(task);note.convertedTaskId=taskId;note.convertedAt=fakeNow;note.revision++;
 mockDb.noteConvertCalls.push({id,taskId});
 return {note:{...note},task:{...task}};
};
`;
fs.writeFileSync('tests/.harness/m61-app.js',source.slice(0,index)+adapter+source.slice(index));
fs.copyFileSync('tests/.harness/m53.css','tests/.harness/m61.css');
