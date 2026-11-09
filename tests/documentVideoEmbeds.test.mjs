import test from 'node:test';
import assert from 'node:assert/strict';
import {videoEmbedSource,videoToStoredBlock,videoFromStoredBlock} from '../web/src/domain/documentVideoEmbeds.ts';
const sample='https://www.youtube.com/watch?v=dQw4w9WgXcQ';
test('video URLs are allowlisted and rewritten to privacy-enhanced player',()=>{
 assert.equal(videoEmbedSource(sample),'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 assert.equal(videoEmbedSource('https://vimeo.com/12345678'),'https://player.vimeo.com/video/12345678');
 for(const bad of ['javascript:alert(1)','http://youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
  'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ',
  'https://example.com/iframe','https://youtube.com/watch?v=<script>']){
  assert.equal(videoEmbedSource(bad),null,bad);
 }
});
test('video embeds round trip as ordinary allowed BlockNote paragraph',()=>{
 const editor={id:'video-1',type:'videoEmbed',props:{url:sample},children:[]};
 const stored=videoToStoredBlock(editor);
 assert.equal(stored.type,'paragraph');
 assert.equal(stored.content[1].href,sample);
 const restored=videoFromStoredBlock(stored);
 assert.deepEqual(restored,editor);
});
test('untrusted or regular paragraphs are not promoted to embeds',()=>{
 const value={id:'p',type:'paragraph',props:{},content:[{type:'text',text:'just prose',styles:{}}],children:[]};
 assert.equal(videoFromStoredBlock(value),value);
 assert.throws(()=>videoToStoredBlock({id:'bad',type:'videoEmbed',props:{url:'https://bad.example/'}}),/Unsupported/);
});
