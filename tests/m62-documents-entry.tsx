import {mountDayframeDocuments} from '../web/src/components/DocumentPage';
declare global{
 interface Window{
  startDayframeDocuments?:()=>void;
  stopDayframeDocuments?:()=>void;
  __documentDirty?:boolean;
 }
}
window.startDayframeDocuments=()=>{
 window.stopDayframeDocuments?.();
 const slot=document.getElementById('documents-root');
 if(!slot)throw Error('Document root not found');
 window.stopDayframeDocuments=mountDayframeDocuments(slot,{
  workspaces:[{id:'33333333-3333-4333-8333-333333333333',name:'Research'}]
 },dirty=>{window.__documentDirty=dirty;});
};
