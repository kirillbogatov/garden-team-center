export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

export async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* noop */ }
    throw new ApiError(data?.error || `${method} ${url}: ${res.status}`, res.status, data);
  }
  if (res.status === 204) return true;
  return res.json();
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  resource(name) {
    const base = `/api/${name}`;
    return {
      list: () => request('GET', base),
      get: (id) => request('GET', `${base}/${encodeURIComponent(id)}`),
      create: (body) => request('POST', base, body),
      update: (id, body) => request('PUT', `${base}/${encodeURIComponent(id)}`, body),
      remove: (id) => request('DELETE', `${base}/${encodeURIComponent(id)}`),
    };
  },
};
