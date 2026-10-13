// Перенаправляет запросы клиента к /api/* в браузерный бэкенд (серверный код Garden,
// собранный esbuild-ом). Остальные запросы идут в настоящий fetch.

const SESSION_COOKIE_NAME = /^([^=;\s]+)=([^;]*)/;
const PHOTO_ROUTE = /^\/api\/people\/[^/]+\/photo$/;

const jsonResponse = (status, payload) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

export function installApiBridge({ app, initialCookie = '', onWrite }) {
  const nativeFetch = window.fetch.bind(window);
  const jar = new Map();
  if (initialCookie) {
    const [, name, value] = SESSION_COOKIE_NAME.exec(initialCookie) || [];
    if (name) jar.set(name, value);
  }

  const readCookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');

  // Серверный код ставит сессию через Set-Cookie; в браузере Response не отдаёт
  // этот заголовок, поэтому ведём собственный cookie jar.
  const storeCookie = (setCookie) => {
    const match = SESSION_COOKIE_NAME.exec(String(setCookie || ''));
    if (!match) return;
    const [, name, value] = match;
    if (!value || /max-age=0/i.test(setCookie)) jar.delete(name);
    else jar.set(name, value);
  };

  window.fetch = async (input, init = {}) => {
    const request = typeof input === 'string' || input instanceof URL ? null : input;
    const url = new URL(request ? request.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return nativeFetch(input, init);

    const method = String(init.method || request?.method || 'GET').toUpperCase();
    if (PHOTO_ROUTE.test(url.pathname) && method !== 'GET') {
      return jsonResponse(403, { error: 'demo_disabled' });
    }
    if (url.pathname === '/api/auth/logout') {
      // Выход в демо бессмыслен: сессию не трогаем, страница просто перезагружается.
      setTimeout(() => window.location.reload(), 0);
      return new Response(null, { status: 204 });
    }

    let body;
    const rawBody = init.body ?? (request ? await request.clone().text() : undefined);
    if (typeof rawBody === 'string' && rawBody) {
      try { body = JSON.parse(rawBody); } catch { body = undefined; }
    }

    const result = await app.request({
      method,
      url: url.pathname + url.search,
      headers: { cookie: readCookieHeader() },
      body,
    });
    storeCookie(result.headers['set-cookie']);
    if (method !== 'GET') onWrite?.();

    const empty = result.status === 204 || result.status === 304;
    return new Response(empty ? null : result.body, {
      status: result.status,
      headers: result.headers['content-type'] ? { 'content-type': result.headers['content-type'] } : undefined,
    });
  };

  return { cookie: () => readCookieHeader() };
}
