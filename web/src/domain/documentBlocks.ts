// Dayframe document interchange: text, safe hyperlinks and LaTeX source.
// Browser validation gives fast feedback; the backend enforces the same limits.
const safeText=/^[#A-Za-z0-9_-]+$/;
const allowedBlocks=new Set(['paragraph','heading','bulletListItem','numberedListItem',
 'checkListItem','quote','codeBlock','mathBlock']);
const allowedProps=new Set(['backgroundColor','textColor','textAlignment','level','checked','isToggleable','language']);
const allowedStyles=new Set(['bold','italic','underline','strike','code','textColor','backgroundColor']);
function plain(value:unknown):value is Record<string,unknown>{
 return !!value&&typeof value==='object'&&!Array.isArray(value);
}
export function safeDocumentLink(value:unknown):boolean{
 if(typeof value!=='string'||value.length>2048||!/^https?:\/\//i.test(value)||
  /[\u0000-\u001f\u007f]/.test(value))return false;
 try{
  const url=new URL(value);
  return ['http:','https:'].includes(url.protocol)&&!!url.hostname&&
   !url.username&&!url.password&&url.href.length<=2100;
 }catch{return false;}
}
export function assertDocumentBlocks(value:unknown):asserts value is unknown[]{
 if(!Array.isArray(value)||value.length>250)throw Error('Too many document blocks');
 let total=0;
 const styledText=(run:unknown):void=>{
  if(!plain(run)||run.type!=='text'||typeof run.text!=='string'||run.text.length>10000||
   !plain(run.styles)||!Object.keys(run).every(k=>['type','text','styles'].includes(k)))
   throw Error('Unsupported document text');
  for(const [k,v] of Object.entries(run.styles)){
   if(!allowedStyles.has(k)||
    !(['textColor','backgroundColor'].includes(k)?
     typeof v==='string'&&v.length<=40&&safeText.test(v):
     typeof v==='boolean'))throw Error('Unsupported text style');
  }
 };
 const inline=(content:unknown[]):void=>{
  if(content.length>300)throw Error('Too much text in one block');
  for(const run of content){
   if(!plain(run))throw Error('Unsupported inline content');
   if(run.type==='text'){styledText(run);continue;}
   if(run.type==='link'){
    if(!safeDocumentLink(run.href)||!Array.isArray(run.content)||
     run.content.length>100||
     !Object.keys(run).every(k=>['type','href','content'].includes(k)))
     throw Error('Only HTTP/HTTPS links are supported');
    run.content.forEach(styledText);
    continue;
   }
   if(run.type==='math'){
    if(typeof run.content!=='string'||run.content.length>6000||
     !plain(run.props)||Object.keys(run.props).length>0||
     !Object.keys(run).every(k=>['type','content','props'].includes(k)))
     throw Error('Unsupported LaTeX source');
    continue;
   }
   throw Error('Unsupported inline content');
  }
 };
 const visit=(entries:unknown[],depth:number):void=>{
  if(depth>6)throw Error('Maximum document nesting is six levels');
  for(const value of entries){
   total++;
   if(total>700||!plain(value)||!allowedBlocks.has(String(value.type))||
    !Object.keys(value).every(k=>['id','type','props','content','children'].includes(k))||
    (value.id!==undefined&&(typeof value.id!=='string'||value.id.length>100||
      !/^[A-Za-z0-9_-]+$/.test(value.id)))||
    !plain(value.props)||!Array.isArray(value.children))
    throw Error('Unsupported document block');
   for(const [key,v] of Object.entries(value.props)){
    if(!allowedProps.has(key))throw Error('Unsupported block formatting');
    if(key==='level'&&![1,2,3,4,5,6].includes(v as number))
     throw Error('Unsupported heading level');
    if(['checked','isToggleable'].includes(key)&&typeof v!=='boolean')
     throw Error('Invalid checkbox');
    if(key==='textAlignment'&&!['left','right','center','justify'].includes(String(v)))
     throw Error('Invalid text alignment');
    if(!['level','checked','isToggleable','textAlignment'].includes(key)&&
     (typeof v!=='string'||v.length>40||!safeText.test(v)))
     throw Error('Unsupported block property');
   }
   if(value.type==='mathBlock'){
    if(typeof value.content!=='string'||value.content.length>6000||
     Object.keys(value.props).length)throw Error('Unsupported LaTeX block');
   }else if(value.type==='codeBlock'){
    if(typeof value.content!=='string'||value.content.length>20000)
     throw Error('Unsupported code block');
   }else{
    if(!Array.isArray(value.content))throw Error('Unsupported block text');
    inline(value.content);
   }
   visit(value.children,depth+1);
  }
 };
 visit(value,0);
 if(new TextEncoder().encode(JSON.stringify(value)).byteLength>200000)
  throw Error('Document exceeds the 200 KB editor limit');
}
export function emptyDocumentBlocks():unknown[]{
 return [{type:'paragraph',props:{},content:[],children:[]}];
}
/** The first substantive sentence names a new note automatically, Notion-style.
 * The user may still override the title explicitly. */
export function documentTitleFromBlocks(blocks:unknown):string{
 if(!Array.isArray(blocks))return '';
 const first=(entries:unknown[],depth:number):string=>{
  if(depth>6)return '';
  for(const row of entries){
   if(!plain(row))continue;
   let value='';
   if(Array.isArray(row.content)){
    for(const run of row.content){
     if(!plain(run))continue;
     if(run.type==='text'&&typeof run.text==='string')value+=run.text;
     else if(run.type==='link'&&Array.isArray(run.content))
      value+=run.content.filter(plain).map(t=>typeof t.text==='string'?t.text:'').join('');
     else if(run.type==='math'&&typeof run.content==='string')value+=run.content;
    }
   }else if(row.type==='mathBlock'&&typeof row.content==='string')value=row.content;
   const normal=value.replace(/\s+/g,' ').trim();
   if(normal){
    const sentence=normal.match(/^.{1,140}?[.!?](?=\s|$)/u)?.[0]??normal.slice(0,110);
    return sentence.trim().slice(0,160);
   }
   if(Array.isArray(row.children)){
    const child=first(row.children,depth+1);
    if(child)return child;
   }
  }
  return '';
 };
 return first(blocks,0);
}
/** Compare JSON after PostgreSQL jsonb reorders object keys. */
export function canonicalDocumentJSON(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonicalDocumentJSON).join(',')+']';
 if(value!==null&&typeof value==='object'){
  const record=value as Record<string,unknown>;
  return '{'+Object.keys(record).sort().map(key=>
   JSON.stringify(key)+':'+canonicalDocumentJSON(record[key])).join(',')+'}';
 }
 return JSON.stringify(value);
}
