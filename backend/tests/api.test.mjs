import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../src/index.mjs';

function request(path, method = 'GET', headers = {}) {
  return handler.fetch(new Request('https://api.dayframe.invalid' + path, { method, headers }));
}

test('public health is deliberately non-sensitive and no-cache', async () => {
  const response = await request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { service: 'dayframe', status: 'ok', stage: 'foundation' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('all future application routes deny anonymous and forged bearer credentials', async () => {
  for (const headers of [{}, { authorization: 'Bearer fabricated' }, { 'x-user-id': 'admin' }]) {
    for (const path of ['/v1/tasks', '/v1/workspaces', '/v1/me', '/v1/tasks/anything']) {
      const result = await request(path, 'GET', headers);
      assert.equal(result.status, 401, path + ': should fail closed');
    }
  }
});

test('CORS preflight only grants the exact published frontend origin', async () => {
  const allowed = await request('/v1/tasks', 'OPTIONS', { origin: 'https://azmath25.github.io' });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://azmath25.github.io');
  const other = await request('/v1/tasks', 'OPTIONS', { origin: 'https://evil.example' });
  assert.equal(other.status, 403);
  assert.equal(other.headers.get('access-control-allow-origin'), null);
  const missing = await request('/v1/tasks', 'OPTIONS');
  assert.equal(missing.status, 403);
});

test('nonexistent paths and invalid health method are not executable', async () => {
  assert.equal((await request('/unknown')).status, 404);
  assert.equal((await request('/health', 'POST')).status, 405);
  assert.equal((await request('/v1/tasks', 'DELETE')).status, 401);
});
