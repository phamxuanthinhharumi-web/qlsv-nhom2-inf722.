'use strict';
// Dùng chung cho các file kiểm thử API: khởi động máy chủ với CSDL trong bộ nhớ và tạo máy khách có cookie riêng.
const { createApp } = require('../server');

async function startApp(adminPassword) {
  const app = await createApp({ dbFile: ':memory:', adminPassword, secureCookie: false });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;

  function client() {
    let cookie = '';
    const c = {
      async call(method, url, body, extra = {}) {
        const headers = { 'X-Requested-With': 'fetch', ...extra };
        if (cookie) headers.Cookie = cookie;
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        const sc = res.headers.getSetCookie();
        if (sc.length) cookie = sc[0].split(';')[0].endsWith('=') ? '' : sc[0].split(';')[0];
        let data = null;
        try { data = await res.json(); } catch { /* không phải JSON */ }
        return { status: res.status, data, headers: res.headers };
      },
      get: (u) => c.call('GET', u),
      post: (u, b) => c.call('POST', u, b ?? undefined),
      put: (u, b) => c.call('PUT', u, b),
      del: (u) => c.call('DELETE', u),
    };
    return c;
  }
  async function login(username, password) {
    const c = client();
    const r = await c.post('/api/login', { username, password });
    return { c, r };
  }
  const close = () => new Promise((r) => app.server.close(r));
  return { app, base, client, login, close };
}

module.exports = { startApp };
