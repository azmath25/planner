// Dayframe document interchange: bounded text, HTTPS links and LaTeX source.
// Never store HTML, embedded media, scripts, file data or arbitrary URLs.
const BLOCK_TYPES=new Set(['paragraph','heading','bulletListItem','numberedListItem',
 'checkListItem','quote','codeBlock','mathBlock']);
const PROP_KEYS=new Set(['backgroundColor','textColor','textAlignment','level','checked',
 'isToggleable','language']);
const STYLE_KEYS=new Set(['bold','italic','underline','strike','code',
 'textColor','backgroundColor']);
const fault=()=>Object.assign(new Error('Unsupported document blocks'),{status:400});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const limitedString=(value,max)=>typeof value==='string'&&value.length<=max;
const safeProp=value=>limitedString(value,40)&&/^[#a-zA-Z0-9_-]+$/.test(value);
export function safeDocumentLink(href){
 if(!limitedString(href,2048)||!/^https?:\/\//i.test(href)||
  /[\u0000-\u001f\u007f]/.test(href))return false;
 try{
  const url=new URL(href);
  return ['http:','https:'].includes(url.protocol)&&!!url.hostname&&
   !url.username&&!url.password&&url.href.length<=2100;
 }catch{return false;}
}
export function validateDocumentBlocks(blocks){
 if(!Array.isArray(blocks)||blocks.length>250)throw fault();
 let count=0;
 function styledText(item){
  if(!plain(item)||item.type!=='text'||!limitedString(item.text,10000)||
   !plain(item.styles)||Object.keys(item).some(key=>!['type','text','styles'].includes(key)))
   throw fault();
  for(const [key,value] of Object.entries(item.styles)){
   if(!STYLE_KEYS.has(key)||
    !(key==='textColor'||key==='backgroundColor'?
     safeProp(value):typeof value==='boolean'))throw fault();
  }
 }
 function inline(content){
  if(!Array.isArray(content)||content.length>300)throw fault();
  for(const item of content){
   if(!plain(item))throw fault();
   if(item.type==='text'){styledText(item);continue;}
   if(item.type==='link'){
    if(!safeDocumentLink(item.href)||!Array.isArray(item.content)||
     item.content.length>100||
     Object.keys(item).some(key=>!['type','href','content'].includes(key)))
     throw fault();
    item.content.forEach(styledText);
    continue;
   }
   if(item.type==='math'){
    if(!limitedString(item.content,6000)||!plain(item.props)||
     Object.keys(item.props).length!==0||
     Object.keys(item).some(key=>!['type','content','props'].includes(key)))throw fault();
    continue;
   }
   throw fault();
  }
 }
 function visit(items,depth){
  if(depth>6||!Array.isArray(items))throw fault();
  for(const item of items){
   count++;
   if(count>700||!plain(item)||!BLOCK_TYPES.has(item.type)||
    Object.keys(item).some(key=>!['id','type','props','content','children'].includes(key))||
    (item.id!==undefined&&(!limitedString(item.id,100)||!/^[A-Za-z0-9_-]+$/.test(item.id)))||
    (item.props!==undefined&&!plain(item.props))||
    !Array.isArray(item.children))throw fault();
   for(const [key,value] of Object.entries(item.props??{})){
    if(!PROP_KEYS.has(key))throw fault();
    if(key==='level'){
     // Older BlockNote versions expose six levels. Read all old documents,
     // while the new editing toolbar intentionally offers just two.
     if(![1,2,3,4,5,6].includes(value))throw fault();
    }else if(key==='checked'||key==='isToggleable'){
     if(typeof value!=='boolean')throw fault();
    }else if(key==='textAlignment'){
     if(!['left','right','center','justify'].includes(value))throw fault();
    }else if(!safeProp(value))throw fault();
   }
   if(item.type==='mathBlock'){
    if(!limitedString(item.content,6000)||Object.keys(item.props??{}).length)throw fault();
   }else if(item.type==='codeBlock'){
    if(!limitedString(item.content,20000))throw fault();
   }else inline(item.content);
   visit(item.children,depth+1);
  }
 }
 visit(blocks,0);
 if(Buffer.byteLength(JSON.stringify(blocks),'utf8')>200000)throw fault();
 return blocks;
}
// PostgreSQL jsonb changes object key order. Compare canonical values after
// uncertain document creation, never only serialization order.
export function canonicalDocumentJSON(value){
 if(Array.isArray(value))return '['+value.map(canonicalDocumentJSON).join(',')+']';
 if(value&&typeof value==='object')
  return '{'+Object.keys(value).sort().map(k=>
   JSON.stringify(k)+':'+canonicalDocumentJSON(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
