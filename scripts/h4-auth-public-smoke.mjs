#!/usr/bin/env node
// H4.2 read-only public API + Neon JWKS readiness smoke.
// Never signs in, mints tokens, sends credentials, reads user rows or modifies data.
// Does NOT establish real browser authentication or verify migration readiness.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

function check(name, fn) {
  return Promise.resolve().then(fn).then(()=>console.log('PASS '+name))
    .catch(error=>{console.error('FAIL '+name+': '+String(error.message||error));process.exitCode=1;});
}
const branch='feature/dayframe-m53-release-20261107';
const actual=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
assert.equal(actual,branch,'H4.2 must run from the Dayframe feature checkout.');
const apiSource=readFileSync('web/src/auth/api.ts','utf8');
const authSource=readFileSync('web/src/auth/client.ts','utf8');
const backend=readFileSync('backend/src/index.mjs','utf8');
const api=apiSource.match(/export const API_URL='(https:\/\/[^']+)'/)?.[1];
const auth=authSource.match(/'(https:\/\/[^']+\/dayframe\/auth)'/)?.[1];
const origin=backend.match(/const ORIGIN='(https:\/\/[^']+)'/)?.[1];
assert.ok(api&&auth&&origin,'Cannot find fixed frontend API/Auth URLs and backend origin.');
// Pin to known Neon/Pages domains before any request (never follow arbitrary
// user/env URLs). The URLs here are public service locations, not credentials.
assert.equal(new URL(api).hostname,'br-shiny-king-b9np2anx-dayframeapi.compute.c-7.eu-central-1.aws.neon.tech');
assert.equal(new URL(auth).hostname,'ep-blue-salad-b9534bb3.neonauth.c-7.eu-central-1.aws.neon.tech');
assert.equal(origin,'https://azmath25.github.io');
async function probe(url,opts={}) {
 const resp=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),...opts});
 return resp;
}
const tasks=[
 check('Dayframe API health is 200 and identifies the service',async()=>{
  const r=await probe(api+'/health');
  assert.equal(r.status,200,'Expected /health HTTP 200, got '+r.status);
  const d=await r.json();
  assert.equal(d.status,'ok');
  assert.equal(d.service,'dayframe');
 }),
 check('Unauthenticated account endpoint rejects access with 401',async()=>{
  const r=await probe(api+'/v1/me');
  assert.equal(r.status,401,'Expected unauthenticated 401; got '+r.status);
  const d=await r.json();
  assert.equal(d.error,'Unauthorized');
 }),
 check('Only the production Pages origin is allowed by CORS',async()=>{
  const ok=await probe(api+'/v1/me',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'GET'}});
  assert.equal(ok.status,204,'Expected trusted-origin preflight 204; got '+ok.status);
  assert.equal(ok.headers.get('access-control-allow-origin'),origin);
  const bad=await probe(api+'/v1/me',{method:'OPTIONS',headers:{Origin:'https://invalid.example','Access-Control-Request-Method':'GET'}});
  assert.equal(bad.status,403,'Expected untrusted-origin 403; got '+bad.status);
  assert.equal(bad.headers.get('access-control-allow-origin'),null);
 }),
 check('Neon Auth public EdDSA JWKS is reachable',async()=>{
  const r=await probe(auth+'/.well-known/jwks.json');
  assert.equal(r.status,200,'Expected JWKS 200; got '+r.status);
  const d=await r.json();
  assert.ok(Array.isArray(d.keys)&&d.keys.some(k=>k.kty==='OKP'&&k.crv==='Ed25519'&&k.x),'Expected public Ed25519 verification key');
 }),
];
await Promise.all(tasks);
if(process.exitCode) {
 console.error('H4.2 public service readiness FAILED; do not change production to bypass checks.');
 process.exitCode=1;
} else {
 console.log('PASS: H4.2 public service readiness (read-only).');
 console.log('NOT TESTED: signup, login, Safari cookies, protected API JWT flow, signout, migration 0013–0020, real feature deployment.');
}
