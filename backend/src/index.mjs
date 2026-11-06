// M2.1 foundation: no user-data routes are enabled before verified authentication.
const ALLOWED_ORIGIN = 'https://azmath25.github.io';
const BASE_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'vary': 'Origin',
});

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    const trusted = request.headers.get('origin') === ALLOWED_ORIGIN;
    const headers = {
      ...BASE_HEADERS,
      ...(trusted ? { 'access-control-allow-origin': ALLOWED_ORIGIN } : {}),
    };
    const knownPath = pathname === '/health' || pathname === '/' || pathname.startsWith('/v1/');

    if (request.method === 'OPTIONS') {
      if (!knownPath) return json({ error: 'Not found' }, 404, headers);
      if (!trusted) return json({ error: 'Origin not allowed' }, 403, headers);
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'access-control-allow-headers': 'authorization,content-type',
          'access-control-max-age': '600',
        },
      });
    }

    if ((pathname === '/health' || pathname === '/') && request.method === 'GET') {
      return json({ service: 'dayframe', status: 'ok', stage: 'foundation' }, 200, headers);
    }
    if (pathname === '/health' || pathname === '/') {
      return json({ error: 'Method not allowed' }, 405, { ...headers, allow: 'GET, OPTIONS' });
    }
    if (pathname.startsWith('/v1/')) {
      // Fail closed: even a bearer token must not authorize requests before M2.2.
      return json({ error: 'Authentication not configured' }, 401, headers);
    }
    return json({ error: 'Not found' }, 404, headers);
  },
};
