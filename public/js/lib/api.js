// Тонкая обёртка над fetch для общения с сервером Garden.

const api = {
  async request(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body || {});
    }
    const res = await fetch(url, opts);
    if (res.status === 401 && !url.startsWith('/api/auth/login')) {
      if (window.Auth?.onUnauthorized) window.Auth.onUnauthorized();
    }
    if (res.status === 403 && window.toast) toast('Недостаточно прав для этого действия');
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch (_) {}
      const err = new Error(`${method} ${url} -> ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    if (res.status === 204) return true;
    return res.json();
  },
  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body) { return this.request('PUT', url, body); },
  del(url) { return this.request('DELETE', url); },
};

// Стандартный CRUD-клиент для ресурсов. View-слою больше не нужно собирать
// URL вручную для базовых операций.
api.resource = function resource(baseUrl) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  return {
    list: (query) => {
      if (!query) return api.get(base);
      if (typeof query === 'string') return api.get(`${base}${query.startsWith('?') ? query : `?${query}`}`);
      const entries = Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)]);
      const params = new URLSearchParams(entries);
      return api.get(`${base}?${params.toString()}`);
    },
    get: (id) => api.get(`${base}/${encodeURIComponent(id)}`),
    create: (data) => api.post(base, data),
    update: (id, data) => api.put(`${base}/${encodeURIComponent(id)}`, data),
    remove: (id) => api.del(`${base}/${encodeURIComponent(id)}`),
  };
};
