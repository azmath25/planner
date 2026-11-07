// Dayframe M6.2a: strict, text-only subset of BlockNote JSON.
// No HTML, embeds, links, images, file data, arbitrary props, or remote URLs.
// The M6.2 editor must use this subset until a reviewed media schema is added.
const BLOCK_TYPES=new Set(['paragraph','heading','bulletListItem','numberedListItem',
 'checkListItem','quote','codeBlock']);
const PROP_KEYS=new Set(['backgroundColor','textColor','textAlignment','level','checked','language']);
const STYLE_KEYS=new Set(['bold','italic','underline','strike','code',
 'textColor','backgroundColor']);
const fault=()=>Object.assign(new Error('Unsupported document blocks'),{status:400});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const limitedString=(value,max)=>typeof value==='string'&&value.length<=max;
export function validateDocumentBlocks(blocks){
 if(!Array.isArray(blocks)||blocks.length>250)throw fault();
 let count=0;
 function inline(content){
  if(!Array.isArray(content)||content.length>300)throw fault();
  for(const item of content){
   if(!plain(item)||item.type!=='text'||!limitedString(item.text,10000)||
    !plain(item.styles)||Object.keys(item).some(key=>!['type','text','styles'].includes(key)))
    throw fault();
   for(const [key,value] of Object.entries(item.styles)){
    if(!STYLE_KEYS.has(key)||!(typeof value==='boolean'||
     (['textColor','backgroundColor'].includes(key)&&limitedString(value,40)&&
      /^[#a-zA-Z0-9_-]+$/.test(value))))throw fault();
   }
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
    !Array.isArray(item.content)||!Array.isArray(item.children))throw fault();
   for(const [key,value] of Object.entries(item.props??{})){
    if(!PROP_KEYS.has(key))throw fault();
    if(key==='level'){
     if(![1,2,3].includes(value))throw fault();
    }else if(key==='checked'){
     if(typeof value!=='boolean')throw fault();
    }else if(key==='textAlignment'){
     if(!['left','right','center','justify'].includes(value))throw fault();
    }else if(!limitedString(value,40)||!(/^[#a-zA-Z0-9_-]+$/).test(value))throw fault();
   }
   inline(item.content);
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
