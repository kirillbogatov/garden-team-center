'use strict';

// Минимальная замена Express для запуска серверных роутов в браузере.
// Покрывает только то, что использует server/: маршруты с :params, use() с
// префиксом, цепочки middleware, req.body/query/params/headers, res.status/json/
// setHeader/end/sendStatus. Всё выполняется синхронно, как и серверные handlers,
// поэтому next() вызывается внутри того же стека (нужно для withWorkspace).

function compilePath(pattern) {
  const keys = [];
  const source = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)'; })
    .replace(/\*/g, '(.*)');
  return { regex: new RegExp(`^${source}/?$`), keys };
}

function createResponse(resolve) {
  const headers = {};
  let statusCode = 200;
  let finished = false;
  const finish = (body) => {
    if (finished) return;
    finished = true;
    resolve({ status: statusCode, headers, body });
  };
  const res = {
    get headersSent() { return finished; },
    status(code) { statusCode = code; return res; },
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; return res; },
    set(name, value) { return res.setHeader(name, value); },
    getHeader(name) { return headers[String(name).toLowerCase()]; },
    json(payload) {
      headers['content-type'] = 'application/json; charset=utf-8';
      finish(JSON.stringify(payload));
      return res;
    },
    send(payload) {
      if (payload !== null && typeof payload === 'object') return res.json(payload);
      finish(payload == null ? '' : String(payload));
      return res;
    },
    sendStatus(code) { statusCode = code; finish(''); return res; },
    sendFile() { statusCode = 404; finish(''); return res; },
    end() { finish(''); return res; },
  };
  return res;
}

function createApp() {
  const layers = [];

  const addLayer = (method, path, handlers) => {
    for (const handler of handlers) {
      if (typeof handler !== 'function') continue;
      const compiled = path && method ? compilePath(path) : null;
      layers.push({ method, path, compiled, handler });
    }
  };

  const matchLayer = (layer, req) => {
    if (layer.method && layer.method !== req.method) return null;
    if (!layer.path) return {};
    if (layer.method) {
      const match = layer.compiled.regex.exec(req.path);
      if (!match) return null;
      const params = {};
      layer.compiled.keys.forEach((key, index) => {
        try { params[key] = decodeURIComponent(match[index + 1]); } catch (_) { params[key] = match[index + 1]; }
      });
      return params;
    }
    return req.path === layer.path || req.path.startsWith(`${layer.path}/`) ? {} : null;
  };

  const app = (req, res) => app.handle(req, res);

  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    app[method] = (path, ...handlers) => { addLayer(method.toUpperCase(), path, handlers); return app; };
  }

  app.use = (...args) => {
    const path = typeof args[0] === 'string' ? args.shift() : null;
    addLayer(null, path, args);
    return app;
  };

  app.handle = (req, res, done) => {
    let index = 0;
    const next = (error) => {
      if (error) return done(error);
      while (index < layers.length) {
        const layer = layers[index++];
        const params = matchLayer(layer, req);
        if (!params) continue;
        req.params = params;
        try {
          const result = layer.handler(req, res, next);
          if (result && typeof result.catch === 'function') result.catch(done);
        } catch (err) {
          done(err);
        }
        return undefined;
      }
      return done();
    };
    next();
  };

  // Точка входа для fetch-моста: request = { method, url, headers, body }.
  app.request = ({ method, url, headers = {}, body }) => new Promise((resolve) => {
    const parsed = new URL(url, 'http://garden.local');
    const query = {};
    for (const [key, value] of parsed.searchParams) {
      query[key] = key in query ? [].concat(query[key], value) : value;
    }
    const req = {
      method: String(method || 'GET').toUpperCase(),
      url: parsed.pathname + parsed.search,
      path: parsed.pathname,
      query,
      params: {},
      body: body === undefined ? {} : body,
      headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
      ip: '127.0.0.1',
      get(name) { return this.headers[String(name).toLowerCase()]; },
    };
    const res = createResponse(resolve);
    app.handle(req, res, (error) => {
      if (res.headersSent) return;
      if (error) {
        console.error('[demo-api]', error);
        res.status(500).json({ error: 'internal_error' });
        return;
      }
      res.status(404).json({ error: 'not_found' });
    });
  });

  return app;
}

const passThrough = () => (req, res, next) => next();

function express() { return createApp(); }
express.json = passThrough;
express.static = passThrough;

module.exports = express;
