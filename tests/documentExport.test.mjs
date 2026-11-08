import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['web/src/domain/documentExport.ts'],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {documentDownloadHtml,documentDownloadFilename}=await import(
 'data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
test('readable document exports headings, paragraphs, links, incomplete math and code safely',()=>{
 const blocks=[
  {type:'heading',props:{level:2},content:[{type:'text',text:'Research notes',styles:{bold:true}}],children:[]},
  {type:'paragraph',props:{},content:[
   {type:'text',text:'Some <script>alert(1)</script> text ',styles:{}},
   {type:'link',href:'https://example.com/?a=1&b=2',content:[{type:'text',text:'source',styles:{}}]}],children:[]},
  {type:'mathBlock',props:{},content:[{type:'text',text:'\\frac{unfinished',styles:{}}],children:[]},
  {type:'codeBlock',props:{},content:[{type:'text',text:'a < b',styles:{}}],children:[]}
 ];
 const html=documentDownloadHtml('Draft <paper>',blocks);
 assert.match(html,/<h1>Draft &lt;paper&gt;<\/h1>/);
 assert.match(html,/<h2><strong>Research notes<\/strong><\/h2>/);
 assert.match(html,/href="https:\/\/example\.com\/\?a=1&amp;b=2"/);
 assert.match(html,/\\frac\{unfinished/);
 assert.match(html,/a &lt; b/);
 assert.doesNotMatch(html,/<script>/);
 assert.equal(documentDownloadFilename('Paper draft!'),'dayframe-document-Paper-draft.html');
});
test('only validated private photo data is embedded in self-contained HTML',()=>{
 const photo='data:image/png;base64,'+'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XCPsAAAAASUVORK5CYII=';
 const out=documentDownloadHtml('Photos',[],[
  {slot:2,data:photo},{slot:0,data:'javascript:alert(1)'}]);
 assert.match(out,/data:image\/png;base64,/);
 assert.match(out,/alt="Document photo 1"/);
 assert.doesNotMatch(out,/javascript:/);
 assert.doesNotMatch(out,/<img[^>]*javascript:/);
});
