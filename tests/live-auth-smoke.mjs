import test from 'node:test';
import assert from 'node:assert/strict';

const SITE='https://azmath25.github.io';
const AUTH='https://ep-blue-salad-b9534bb3.neonauth.c-7.eu-central-1.aws.neon.tech/dayframe/auth';

function timeout(){return AbortSignal.timeout(15000);}
async function fetchAuth(path,options={}){
 return fetch(AUTH+path,{
  redirect:'manual',signal:timeout(),...options,
  headers:{origin:SITE,accept:'application/json',...options.headers},
 });
}
test('Neon Auth can be reached through the correct managed branch URL',async()=>{
 const response=await fetchAuth('/ok');
 assert.equal(response.status,200,'Managed Auth /ok should return 200');
 const body=await response.text();
 assert.ok(body.length<10000,'health response should be small');
});
test('GitHub Pages origin can send credentialed sign-in preflight',async()=>{
 const response=await fetchAuth('/sign-in/email',{
  method:'OPTIONS',
  headers:{
   'access-control-request-method':'POST',
   'access-control-request-headers':'content-type'
  }
 });
 assert.ok([200,204].includes(response.status),'preflight failed: '+response.status);
 assert.equal(response.headers.get('access-control-allow-origin'),SITE,'trusted origin missing');
 assert.equal(response.headers.get('access-control-allow-credentials'),'true','cookies are not permitted by CORS');
});
test('auth endpoint responds to a deliberately unregistered email',async()=>{
 // No user created and no real password is tested or logged.
 const response=await fetchAuth('/sign-in/email',{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({email:'dayframe-not-registered@example.invalid',password:'invalid-test-credentials'})
 });
 assert.ok([400,401,403,422].includes(response.status),
  'Unexpected sign-in response: HTTP '+response.status);
});
test('GitHub Pages returns an HTML app rather than a missing site',async()=>{
 const response=await fetch('https://azmath25.github.io/planner/',{
  signal:timeout(),redirect:'manual'
 });
 assert.equal(response.status,200);
 const html=await response.text();
 assert.ok(html.includes('dayframe')||html.includes('Dayframe'));
 assert.ok(html.includes('assets/'));
});
