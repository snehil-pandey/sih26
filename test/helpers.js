import { createApp } from '../src/app.js';
import { createHttpServer } from '../src/http.js';
export const PW = 'demo1234';
export function ctx(opts = {}) {
  const app = createApp({ demoMode: true, ...opts });
  const u = id => app.user(id), kek = id => app.kekFor(id, PW);
  return { app, u, kek, dec: (id, doc = 'DOC-0001') => app.decrypt(u(id), kek(id), doc), counts: () => ({ sessions: app.db.get('select count(*) n from sessions').n, height: app.net.view().height }) };
}
export async function serve(app) {
  const s = createHttpServer(app, { log() {} });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  const call = async (method, p, body, token, raw) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = text; } return { status: r.status, body: j, text, headers: r.headers };
  };
  const login = async name => (await call('POST', '/api/auth/login', { username: name, password: PW })).body.token;
  return { base, call, login, close: () => { s.closeAllConnections(); return new Promise(r => s.close(r)); } };
}
