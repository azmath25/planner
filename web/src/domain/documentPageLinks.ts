// Dayframe's private document links are same-origin app links, never public access grants.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function documentPageUrl(id:string,originUrl:string):string{
 if(!UUID.test(id))throw Error('Invalid document link ID');
 const url=new URL(originUrl);
 if(!['https:','http:'].includes(url.protocol))throw Error('Invalid document URL');
 url.hash='';
 url.searchParams.set('dayframeDocument',id);
 return url.href;
}
export function linkedDocumentId(href:string,appUrl:string):string|null{
 try{
  const url=new URL(href,appUrl),app=new URL(appUrl);
  if(url.origin!==app.origin||url.pathname!==app.pathname||
   url.username||url.password)return null;
  const values=url.searchParams.getAll('dayframeDocument');
  return values.length===1&&UUID.test(values[0])?values[0]:null;
 }catch{return null;}
}
