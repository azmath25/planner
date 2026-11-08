import {safeDocumentLink} from './documentBlocks';

const escapeHtml=(text:unknown):string=>String(text??'')
 .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
 .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const plain=(v:unknown):v is Record<string,unknown>=>
 !!v&&typeof v==='object'&&!Array.isArray(v);
function inline(runs:unknown):string{
 if(!Array.isArray(runs))return escapeHtml(runs);
 return runs.map(run=>{
  if(!plain(run))return '';
  if(run.type==='math'&&typeof run.content==='string')
   return '<code class="latex">\\('+escapeHtml(run.content)+'\\)</code>';
  if(run.type==='link'){
   const text=inline(run.content);
   return safeDocumentLink(run.href)?'<a href="'+escapeHtml(run.href)+
    '" rel="noopener noreferrer" target="_blank">'+text+'</a>':text;
  }
  if(run.type!=='text')return '';
  let text=escapeHtml(run.text);
  const style=plain(run.styles)?run.styles:{};
  if(style.bold===true)text='<strong>'+text+'</strong>';
  if(style.italic===true)text='<em>'+text+'</em>';
  if(style.underline===true)text='<u>'+text+'</u>';
  if(style.strike===true)text='<s>'+text+'</s>';
  if(style.code===true)text='<code>'+text+'</code>';
  return text;
 }).join('');
}
function textContent(data:unknown):string{
 if(typeof data==='string')return data;
 if(!Array.isArray(data))return '';
 return data.map(run=>plain(run)?String(run.text??''):'').join('');
}
function renderBlocks(blocks:unknown,depth=0):string{
 if(!Array.isArray(blocks)||depth>6)return '';
 return blocks.slice(0,700).map(block=>{
  if(!plain(block))return '';
  const content=inline(block.content);
  const children=renderBlocks(block.children,depth+1);
  switch(block.type){
   case 'heading':{
    const level=plain(block.props)&&block.props.level===2?'h2':'h1';
    return '<'+level+'>'+content+'</'+level+'>'+children;
   }
   case 'paragraph':return '<p>'+content+'</p>'+children;
   case 'bulletListItem':return '<ul><li>'+content+children+'</li></ul>';
   case 'numberedListItem':return '<ol><li>'+content+children+'</li></ol>';
   case 'checkListItem':return '<p class="checkbox">'+
     (plain(block.props)&&block.props.checked===true?'☑':'☐')+' '+content+'</p>'+children;
   case 'quote':return '<blockquote>'+content+'</blockquote>'+children;
   case 'codeBlock':return '<pre><code>'+escapeHtml(textContent(block.content))+'</code></pre>'+children;
   case 'mathBlock':return '<pre class="math">\\['+
     escapeHtml(textContent(block.content))+'\\]</pre>'+children;
   default:return children;
  }
 }).join('\n');
}
export type DocumentPhoto={slot:number;data:string};
export function documentDownloadHtml(title:string,blocks:unknown,photos:DocumentPhoto[]=[]):string{
 const images=photos.filter(p=>Number.isInteger(p.slot)&&p.slot>=0&&p.slot<=3&&
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(p.data)&&
  p.data.length<=250000).sort((a,b)=>a.slot-b.slot);
 const gallery=images.length?'<section class="photos"><h2>Attached photos</h2>'+
  images.map((p,i)=>'<figure><img alt="Document photo '+(i+1)+'" src="'+p.data+'"/>'+
   '<figcaption>Photo '+(i+1)+'</figcaption></figure>').join('')+'</section>':'';
 return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>'+escapeHtml(title)+'</title><style>'+
  'body{font:16px/1.6 system-ui,sans-serif;color:#111;background:#fff;max-width:780px;margin:36px auto;padding:0 20px}'+
  'h1,h2{line-height:1.3;overflow-wrap:anywhere}p,li{overflow-wrap:anywhere}'+
  'code,pre{white-space:pre-wrap;overflow-wrap:anywhere}pre{padding:12px;background:#f5f5f5}'+
  'blockquote{border-left:3px solid #888;padding-left:14px;margin-left:0}'+
  '.latex,.math{font-family:ui-monospace,monospace}'+
  'a{color:#165a8d;text-decoration:underline}img{display:block;max-width:100%;max-height:780px;height:auto}'+
  '.photos{border-top:1px solid #ccc;margin-top:26px;padding-top:12px}figcaption{color:#555;font-size:.85em}'+
  '</style></head><body><main><h1>'+escapeHtml(title||'Untitled document')+'</h1>'+
  renderBlocks(blocks)+gallery+'</main></body></html>';
}
export function documentDownloadFilename(title:string):string{
 const safe=(title||'document').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,65)||'document';
 return 'dayframe-document-'+safe+'.html';
}
