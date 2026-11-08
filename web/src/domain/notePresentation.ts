/** Escape and linkify only HTTP(S) URLs. Never interpret note HTML as markup. */
export function escapeNoteHtml(value:string):string{
 return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
export function noteLinksHtml(text:string):string{
 const urlPattern=/(https?:\/\/|www\.)[^\s<>"']+/gi;
 let output='',position=0,match:RegExpExecArray|null;
 while((match=urlPattern.exec(text))!==null){
  output+=escapeNoteHtml(text.slice(position,match.index));
  const raw=match[0],trailing=raw.match(/[.,;!?)]+$/)?.[0]||'';
  const link=raw.slice(0,raw.length-trailing.length);
  const href=link.startsWith('www.')?'https://'+link:link;
  try{
   const url=new URL(href);
   if(['http:','https:'].includes(url.protocol)&&url.hostname){
    output+='<a href="'+escapeNoteHtml(url.href)+'" target="_blank" rel="noopener noreferrer">'+
     escapeNoteHtml(link)+'</a>';
   }else output+=escapeNoteHtml(link);
  }catch{output+=escapeNoteHtml(link);}
  output+=escapeNoteHtml(trailing);
  position=match.index+raw.length;
 }
 return output+escapeNoteHtml(text.slice(position));
}
export type NoteDownload={title:string;content:string;photo?:string|null;workspace?:string};
export function noteDownloadHtml(note:NoteDownload):string{
 const safeTitle=escapeNoteHtml(note.title||'Untitled note');
 const safePhoto=note.photo&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(note.photo)&&note.photo.length<250000
  ?'<figure><img alt="Attached note photo" src="'+note.photo+'"/></figure>':'';
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"/>'+
  '<meta name="viewport" content="width=device-width, initial-scale=1"/>'+
  '<title>'+safeTitle+'</title><style>'+
  'body{font:16px/1.6 system-ui,sans-serif;max-width:780px;margin:45px auto;padding:0 20px;color:#111;background:#fff}'+
  'h1{font-size:2em;overflow-wrap:anywhere}p{white-space:pre-wrap;overflow-wrap:anywhere}'+
  'a{color:inherit;text-decoration:underline}img{max-width:100%;height:auto;display:block;margin:24px 0}'+
  '</style></head><body><article><h1>'+safeTitle+'</h1><p>'+noteLinksHtml(note.content)+
  '</p>'+safePhoto+'</article></body></html>';
}
export function noteFilename(title:string,extension='html'):string{
 const slug=(title||'note').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,65)||'note';
 return 'dayframe-'+slug+'.'+extension;
}
