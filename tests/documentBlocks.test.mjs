import test from 'node:test';
import assert from 'node:assert/strict';
import {
 assertDocumentBlocks,emptyDocumentBlocks,canonicalDocumentJSON,documentTitleFromBlocks,safeDocumentLink
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

test('M6.3a canonical equality ignores postgres JSONB key reordering',()=>{
 const a={id:'one',type:'paragraph',props:{textColor:'default',textAlignment:'left'},
  content:[{text:'Draft',styles:{italic:true,bold:false},type:'text'}],children:[]};
 const b={children:[],content:[{type:'text',styles:{bold:false,italic:true},text:'Draft'}],
  props:{textAlignment:'left',textColor:'default'},type:'paragraph',id:'one'};
 assert.equal(canonicalDocumentJSON(a),canonicalDocumentJSON(b));
 assert.notEqual(canonicalDocumentJSON(a),canonicalDocumentJSON({...b,content:[]}));
});

test('Document editor saves safe links, LaTeX, code and existing long headings',()=>{
 const contents=[
  {id:'b-link',type:'paragraph',props:{},children:[],content:[
   {type:'text',text:'Read ',styles:{}},
   {type:'link',href:'https://example.org/a?x=1',content:[
    {type:'text',text:'our notes',styles:{underline:true}}]},
   {type:'math',props:{},content:'x^2+\\\\frac{1}{2}'}
  ]},
  {id:'b-math',type:'mathBlock',props:{},content:'\\\\int_0^1 x\\\\,dx',children:[]},
  {id:'b-code',type:'codeBlock',props:{language:'javascript'},content:'console.log(1)',children:[]},
  {id:'b-heading',type:'heading',props:{level:6},content:[],children:[]}
 ];
 assert.doesNotThrow(()=>assertDocumentBlocks(contents));
 assert.equal(safeDocumentLink('https://example.org'),true);
 for(const unsafe of ['javascript:alert(1)','data:text/html,foo','https://user:pw@example.org',
  'file:///etc/passwd','https://example.org/\\nhello'])assert.equal(safeDocumentLink(unsafe),false);
});
test('LaTeX and links cannot bypass bounded, text-only persistence',()=>{
 const base=good()[0];
 for(const bad of [
  {...base,content:[{type:'link',href:'javascript:alert(1)',content:[]}]},
  {...base,content:[{type:'math',props:{html:'<script>'},content:'x'}]},
  {...base,content:[{type:'math',props:{},content:'x'.repeat(6001)}]},
  {...base,content:[{type:'link',href:'https://example.org',content:[{type:'image'}]}]},
  {id:'bad',type:'mathBlock',props:{html:'evil'},content:'x',children:[]}
 ])assert.throws(()=>assertDocumentBlocks([bad]));
});
test('New page title defaults to the first sentence without requiring naming',()=>{
 const first=[{id:'b',type:'paragraph',props:{},content:[
  {type:'text',text:'My research plan. Next steps follow.',styles:{}}],
  children:[]}];
 assert.equal(documentTitleFromBlocks(first),'My research plan.');
 assert.equal(documentTitleFromBlocks(good('A short heading')),'A short heading');
 assert.equal(documentTitleFromBlocks([]),'');
});
