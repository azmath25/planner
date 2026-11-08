import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Execute a fresh Node process: staging config is resolved at module import,
// not per-request. A unit test importing under production could miss a crash.
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const ORIGIN='https://dayframe-h44-staging-git-feature-dayf-e2f364-azmath25s-projects.vercel.app';
const AUTH='https://ep-wispy-surf-b94f834t.neonauth.c-7.eu-central-1.aws.neon.tech/dayframe/auth';
const LIVE_TEST=`
import app from './backend/src/index.mjs';
const h=await app.fetch(new Request('https://api.invalid/health'));
if(h.status!==200)throw Error('staging health returned '+h.status);
const good=await app.fetch(new Request('https://api.invalid/v1/me',{
 method:'OPTIONS',headers:{origin:process.env.CHECK_ORIGIN,'access-control-request-method':'GET'}
}));
const expected=process.env.CHECK_ALLOWED==='true'?204:403;
if(good.status!==expected)throw Error('staging CORS '+good.status+' expected '+expected);
if(expected===204&&good.headers.get('access-control-allow-origin')!==process.env.CHECK_ORIGIN)
 throw Error('missing exact staging CORS origin');
const bad=await app.fetch(new Request('https://api.invalid/v1/me',{
 method:'OPTIONS',headers:{origin:'https://other.example','access-control-request-method':'GET'}
}));
if(bad.status!==403||bad.headers.get('access-control-allow-origin')!==null)
 throw Error('untrusted origin was allowed');
`;
function probe(extra={}){
 return spawnSync(process.execPath,['--input-type=module','-e',LIVE_TEST],{
  cwd:ROOT,encoding:'utf8',timeout:15000,env:{
   ...process.env,DAYFRAME_ENV:'staging',NEON_AUTH_BASE_URL:AUTH,
   DAYFRAME_STAGING_ORIGIN:ORIGIN,CHECK_ORIGIN:ORIGIN,CHECK_ALLOWED:'true',...extra
  }
 });
}
test('H4.4 staging loads successfully and allows only the exact preview origin',()=>{
 const r=probe();
 assert.equal(r.status,0,r.stderr||r.stdout);
});
test('H4.4 blocked staging bootstrap rejects every real browser origin',()=>{
 const r=probe({DAYFRAME_STAGING_ORIGIN:'blocked',CHECK_ALLOWED:'false'});
 assert.equal(r.status,0,r.stderr||r.stdout);
});
test('H4.4 staging import rejects wrong Auth, absent origin and non-Vercel origin',()=>{
 for(const env of [
  {NEON_AUTH_BASE_URL:'https://untrusted.example/auth'},
  {DAYFRAME_STAGING_ORIGIN:''},
  {DAYFRAME_STAGING_ORIGIN:'https://example.invalid'},
 ]){
  const r=probe(env);
  assert.notEqual(r.status,0,'bad staging configuration must never load');
  assert.match(r.stderr,/Refusing staging origin/);
 }
});
