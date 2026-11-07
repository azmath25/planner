// M6.2b: explicitly limited, text-only BlockNote document bridge.
// The server is authoritative: this validator only gives immediate UX feedback.
const safeText=/^[#A-Za-z0-9_-]+$/;
const allowedBlocks=new Set(['paragraph','heading','bulletListItem','numberedListItem',
 'checkListItem','quote','codeBlock']);
const allowedProps=new Set(['backgroundColor','textColor','textAlignment','level','checked','language']);
const allowedStyles=new Set(['bold','italic','underline','strike','code','textColor','backgroundColor']);
function plain(value:unknown):value is Record<string,unknown>{
 return !!value&&typeof value==='object'&&!Array.isArray(value);
}
export function assertDocumentBlocks(value:unknown):asserts value is unknown[]{
 if(!Array.isArray(value)||value.length>250)throw Error('Too many document blocks');
 let total=0;
 const visit=(entries:unknown[],depth:number):void=>{
  if(depth>6)throw Error('Maximum document nesting is six levels');
  for(const value of entries){
   total++;
   if(total>700||!plain(value)||!allowedBlocks.has(String(value.type))||
    !Object.keys(value).every(k=>['id','type','props','content','children'].includes(k))||
    (value.id!==undefined&&(typeof value.id!=='string'||value.id.length>100||
      !/^[A-Za-z0-9_-]+$/.test(value.id)))||
    !plain(value.props)||!Array.isArray(value.content)||!Array.isArray(value.children))
    throw Error('Unsupported document block');
   for(const [key,v] of Object.entries(value.props)){
    if(!allowedProps.has(key))throw Error('Unsupported block formatting');
    if(key==='level'&&![1,2,3].includes(v as number))throw Error('Heading level must be 1, 2 or 3');
    if(key==='checked'&&typeof v!=='boolean')throw Error('Invalid checkbox');
    if(key==='textAlignment'&&!['left','right','center','justify'].includes(String(v)))
     throw Error('Invalid text alignment');
    if(!['level','checked','textAlignment'].includes(key)&&
     (typeof v!=='string'||v.length>40||!safeText.test(v)))throw Error('Unsupported block property');
   }
   if(value.content.length>300)throw Error('Too much text in one block');
   for(const run of value.content){
    if(!plain(run)||run.type!=='text'||typeof run.text!=='string'||run.text.length>10000||
     !plain(run.styles)||!Object.keys(run).every(k=>['type','text','styles'].includes(k)))
     throw Error('Only formatted plain text can be saved');
    for(const [k,v] of Object.entries(run.styles)){
     if(!allowedStyles.has(k)||!((typeof v==='boolean'&&k!=='textColor'&&k!=='backgroundColor')||
      (['textColor','backgroundColor'].includes(k)&&typeof v==='string'&&v.length<=40&&safeText.test(v))))
      throw Error('Unsupported text style');
    }
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
