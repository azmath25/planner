// Restricted rich video embeds are editor-only projections of ordinary safe
// paragraphs. The API continues storing its existing BlockNote schema.
export const VIDEO_MARKER='▶ Embedded video: ';
const ID=/^[A-Za-z0-9_-]{11}$/;
export function videoEmbedSource(value:unknown):string|null{
 if(typeof value!=='string'||value.length>2048)return null;
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password)return null;
  const host=u.hostname.toLowerCase();
  if(['youtu.be','www.youtu.be'].includes(host)){
   const id=u.pathname.slice(1);
   return ID.test(id)?'https://www.youtube-nocookie.com/embed/'+id:null;
  }
  if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)){
   const id=u.pathname==='/watch'?u.searchParams.get('v'):
    /^\/(?:embed|shorts)\//.test(u.pathname)?u.pathname.split('/')[2]:null;
   return id&&ID.test(id)?'https://www.youtube-nocookie.com/embed/'+id:null;
  }
  if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)){
   const id=u.pathname.split('/').filter(Boolean).at(-1);
   return id&&/^\d{5,12}$/.test(id)?'https://player.vimeo.com/video/'+id:null;
  }
  return null;
 }catch{return null;}
}
function object(v:unknown):v is Record<string,unknown>{
 return !!v&&typeof v==='object'&&!Array.isArray(v);
}
export function videoToStoredBlock(value:unknown):unknown{
 if(!object(value)||value.type!=='videoEmbed')return value;
 const props=object(value.props)?value.props:{};
 const url=String(props.url??'');
 if(!videoEmbedSource(url))throw Error('Unsupported video URL');
 return {
  id:value.id,type:'paragraph',props:{},
  content:[
   {type:'text',text:VIDEO_MARKER,styles:{}},
   {type:'link',href:url,content:[{type:'text',text:'Open video',styles:{}}]}
  ],children:[]
 };
}
export function videoFromStoredBlock(value:unknown):unknown{
 if(!object(value)||value.type!=='paragraph'||!Array.isArray(value.content)||
  value.content.length!==2||!object(value.content[0])||!object(value.content[1]))return value;
 const [first,second]=value.content;
 if(first.type!=='text'||first.text!==VIDEO_MARKER||second.type!=='link'||
  !videoEmbedSource(second.href))return value;
 return {id:value.id,type:'videoEmbed',props:{url:second.href},children:[]};
}
