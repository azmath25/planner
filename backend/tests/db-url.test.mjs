import test from 'node:test';
import assert from 'node:assert/strict';
import {secureDatabaseConnectionUrl} from '../src/db-url.mjs';
test('explicit PostgreSQL full verification survives SSL mode compatibility changes',()=>{
 for(const mode of ['require','prefer','verify-ca']){
  const url=new URL(secureDatabaseConnectionUrl('postgres://user:password@example.com:5432/dayframe?sslmode='+mode+'&application_name=dayframe'));
  assert.equal(url.searchParams.get('sslmode'),'verify-full');
  assert.equal(url.searchParams.get('application_name'),'dayframe');
  assert.equal(url.username,'user');
 }
 assert.equal(new URL(secureDatabaseConnectionUrl('postgresql://user:pass@example.com/test?sslmode=verify-full')).searchParams.get('sslmode'),'verify-full');
 assert.equal(new URL(secureDatabaseConnectionUrl('postgres://audit:pass@127.0.0.1:5432/dayframe_audit')).searchParams.get('sslmode'),null);
 assert.throws(()=>secureDatabaseConnectionUrl('https://not-a-db.example'));
});
