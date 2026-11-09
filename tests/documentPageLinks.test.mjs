import test from 'node:test';
import assert from 'node:assert/strict';
import {documentPageUrl,linkedDocumentId} from '../web/src/domain/documentPageLinks.ts';
const id='123e4567-e89b-42d3-a456-426614174000';
const other='123e4567-e89b-42d3-a456-426614174001';
const base='https://dayframe.example/app/?mode=writing#dayframe-documents';
test('document link preserves site origin and uses a single private ID',()=>{
 const link=documentPageUrl(id,base);
 assert.equal(linkedDocumentId(link,base),id);
 assert.equal(new URL(link).hash,'');
 assert.equal(new URL(link).searchParams.get('mode'),'writing');
});
test('external, credential, missing and ambiguous links never route privately',()=>{
 assert.equal(linkedDocumentId('https://phishing.example/app/?dayframeDocument='+id,base),null);
 assert.equal(linkedDocumentId('/wrong/?dayframeDocument='+id,base),null);
 assert.equal(linkedDocumentId('/app/?dayframeDocument=not-a-uuid',base),null);
 assert.equal(linkedDocumentId('/app/?dayframeDocument='+id+'&dayframeDocument='+other,base),null);
 assert.equal(linkedDocumentId('https://evil@dayframe.example/app/?dayframeDocument='+id,base),null);
});
test('invalid ids are rejected before generating a link',()=>{
 assert.throws(()=>documentPageUrl('bad',base),/Invalid document/);
});
