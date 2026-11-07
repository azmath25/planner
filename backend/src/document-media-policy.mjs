// M6.3c file/media admission policy for a future private upload service.
// This module does not upload, store, scan, link to or serve any attachment.
// The current document API rejects binary uploads until private storage,
// malware scanning and authorization are integrated and verified.
export const MEDIA_LIMITS=Object.freeze({
 'image/jpeg':5*1024*1024,
 'image/png':5*1024*1024,
 'image/webp':5*1024*1024,
 'application/pdf':10*1024*1024
});
const reject=()=>Object.assign(new Error('Unsupported or unsafe document media'),{status:415});
function prefix(data,bytes){
 return bytes.every((b,i)=>data[i]===b);
}
// Pre-admission validation is not security scanning. Reject known executable
// and external-link types entirely; never trust MIME, extension or filename.
export function validateDocumentMedia({type,name,size,bytes}){
 if(typeof type!=='string'||!Object.hasOwn(MEDIA_LIMITS,type)||
    typeof name!=='string'||name.length<1||name.length>140||
    /[\\/\x00-\x1f\x7f]/.test(name)||/^\.+$/.test(name)||
    typeof size!=='number'||!Number.isSafeInteger(size)||size<=0||
    size>MEDIA_LIMITS[type]||!(bytes instanceof Uint8Array)||
    bytes.byteLength!==size)throw reject();
 const jpeg=prefix(bytes,[0xff,0xd8,0xff]);
 const png=prefix(bytes,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
 const webp=prefix(bytes,[0x52,0x49,0x46,0x46])&&
  prefix(bytes.subarray(8),[0x57,0x45,0x42,0x50]);
 const pdf=prefix(bytes,[0x25,0x50,0x44,0x46,0x2d]);
 const okay=(type==='image/jpeg'&&jpeg)||(type==='image/png'&&png)||
  (type==='image/webp'&&webp)||(type==='application/pdf'&&pdf);
 if(!okay)throw reject();
 return Object.freeze({type,size,name});
}
