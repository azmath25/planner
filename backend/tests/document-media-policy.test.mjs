import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDocumentMedia,MEDIA_LIMITS} from '../src/document-media-policy.mjs';
const png=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
const jpg=new Uint8Array([0xff,0xd8,0xff,0xd9]);
const webp=new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]);
const pdf=new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x37]);
test('M6.3c allowlisted media signatures are recognized only for future reviewed storage',()=>{
 for(const [type,name,bytes] of [
  ['image/png','diagram.png',png],
  ['image/jpeg','photo.jpeg',jpg],
  ['image/webp','sketch.webp',webp],
  ['application/pdf','notes.pdf',pdf]
 ]){
  const v=validateDocumentMedia({type,name,size:bytes.length,bytes});
  assert.equal(v.type,type);assert.equal(v.name,name);
  assert.ok(bytes.length<=MEDIA_LIMITS[type]);
 }
});
test('M6.3c reject scripted, SVG/HTML, false MIME and unsafe names before storage',()=>{
 for(const data of [
  {type:'image/svg+xml',name:'vector.svg',size:png.length,bytes:png},
  {type:'text/html',name:'x.html',size:pdf.length,bytes:pdf},
  {type:'application/pdf',name:'pdf.pdf',size:png.length,bytes:png},
  {type:'image/png',name:'../escape.png',size:png.length,bytes:png},
  {type:'image/jpeg',name:'bad\\name.jpg',size:jpg.length,bytes:jpg},
  {type:'application/pdf',name:'notes.pdf',size:0,bytes:pdf},
  {type:'application/pdf',name:'notes.pdf',size:11*1024*1024,bytes:pdf},
  {type:'image/png',name:'diagram.png',size:png.length+1,bytes:png}
 ])assert.throws(()=>validateDocumentMedia(data),/Unsupported or unsafe document media/);
});
