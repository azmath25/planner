import test from 'node:test';
import assert from 'node:assert/strict';
import {
 assertDocumentBlocks,emptyDocumentBlocks
} from '../web/src/domain/documentBlocks.ts';
const good=(text='Text')=>[{
 id:'block_1',type:'paragraph',
 props:{backgroundColor:'default',textColor:'default',textAlignment:'left'},
 content:[{type:'text',text,styles:{bold:true}}],children:[]
}];
test('M6.2b safe text blocks and default editor paragraphs are accepted',()=>{
 assert.doesNotThrow(()=>assertDocumentBlocks(good()));
 assert.doesNotThrow(()=>assertDocumentBlocks(emptyDocumentBlocks()));
 assert.doesNotThrow(()=>assertDocumentBlocks([{
  id:'header_1',type:'heading',props:{level:2},
  content:[{type:'text',text:'Heading',styles:{italic:true}}],children:good()
 }]));
});
test('M6.2b browser text-only schema rejects links, embed URLs and arbitrary markup',()=>{
 for(const invalid of [
  [{id:'a',type:'image',props:{url:'https://example.com/x.png'},content:[],children:[]}],
  [{id:'a',type:'paragraph',props:{html:'<script>'},content:[],children:[]}],
  [{id:'a',type:'paragraph',props:{},content:[{type:'link',href:'javascript:alert(1)',content:[]}],children:[]}],
  [{id:'bad<script>',type:'paragraph',props:{},content:[],children:[]}],
  good('X'.repeat(10001))
 ])assert.throws(()=>assertDocumentBlocks(invalid));
});
test('M6.2b browser size and depth checks reject oversized documents',()=>{
 assert.throws(()=>assertDocumentBlocks(Array.from({length:251},()=>good()[0])));
 let deep=good();
 for(let i=0;i<7;i++)deep=[{id:'node_'+i,type:'paragraph',props:{},content:[],children:deep}];
 assert.throws(()=>assertDocumentBlocks(deep));
});
