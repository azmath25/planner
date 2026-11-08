import test from 'node:test';
import assert from 'node:assert/strict';
import {noteLinksHtml,noteDownloadHtml,noteFilename} from '../web/src/domain/notePresentation.ts';
test('notes linkify only real HTTP/S and escape injected HTML',()=>{
 const actual=noteLinksHtml('Visit https://example.com/a?q=1&x=2. <img onerror="alert(1)"> www.example.org!');
 assert.match(actual,/href="https:\/\/example\.com\/a\?q=1&amp;x=2"/);
 assert.match(actual,/href="https:\/\/www\.example\.org\/"/);
 assert.doesNotMatch(actual,/<img/);
 assert.match(actual,/&lt;img/);
 assert.match(actual,/rel="noopener noreferrer"/);
});
test('a downloaded note contains its text, safe links and bounded photo',()=>{
 const photo='data:image/png;base64,'+'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XCPsAAAAASUVORK5CYII=';
 const html=noteDownloadHtml({title:'<Draft>',content:'2+2=5\nSee https://example.org',photo});
 assert.match(html,/<h1>&lt;Draft&gt;<\/h1>/);
 assert.match(html,/2\+2=5/);
 assert.match(html,/alt="Attached note photo"/);
 assert.match(html,/href="https:\/\/example\.org\/"/);
 assert.doesNotMatch(html,/<script>/);
 assert.equal(noteFilename('Hello world!'),'dayframe-Hello-world.html');
});
test('invalid image sources are never embedded in exports',()=>{
 assert.doesNotMatch(noteDownloadHtml({title:'test',content:'link',photo:'javascript:alert(1)'}),/<img/);
});
