import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ctx, serve, PW } from './helpers.js';

const M = ctx(); let S, tok = {};
before(async () => { S = await serve(M.app); for (const n of ['sender', 'aarav', 'riya', 'nisha', 'forensic', 'admin']) tok[n] = await S.login(n); });
after(() => S.close());
const get = (p, t) => S.call('GET', p, undefined, tok[t]), post = (p, b, t) => S.call('POST', p, b, tok[t]);

test('authentication: bad credentials give a generic 401; success gives an opaque token; logout invalidates it', async () => {
  const bad = await S.call('POST', '/api/auth/login', { username: 'riya', password: 'wrong-password' }); assert.equal(bad.status, 401);
  const nouser = await S.call('POST', '/api/auth/login', { username: 'nobody', password: 'wrong-password' }); assert.equal(nouser.body.error, bad.body.error, 'no user enumeration');
  const ok = await S.call('POST', '/api/auth/login', { username: 'kabir', password: PW }); assert.equal(ok.status, 200); assert.match(ok.body.token, /^[0-9a-f]{64}$/); assert.ok(!('pw_hash' in ok.body.user));
  assert.equal((await S.call('GET', '/api/me', undefined, ok.body.token)).status, 200);
  await S.call('POST', '/api/auth/logout', {}, ok.body.token); assert.equal((await S.call('GET', '/api/me', undefined, ok.body.token)).status, 401);
  assert.equal((await S.call('GET', '/api/me', undefined, 'x'.repeat(64))).status, 401);
});
test('login throttling: repeated failures are rate limited', async () => {
  let last; for (let i = 0; i < 7; i++) last = await S.call('POST', '/api/auth/login', { username: 'kabir', password: 'bad-bad-bad' });
  assert.equal(last.status, 429);
  const r = await S.call('POST', '/api/auth/login', { username: 'kabir', password: PW }); assert.equal(r.status, 429, 'even the right password is refused while throttled');
});
test('route authorization: missing token 401, wrong role 403 (enforced server-side)', async () => {
  assert.equal((await S.call('GET', '/api/dashboard')).status, 401);
  assert.equal((await get('/api/investigations', 'riya')).status, 403); assert.equal((await get('/api/lab/run', 'aarav')).status, 403);
  assert.equal((await post('/api/documents/DOC-0001/decrypt', {}, 'sender')).status, 403); assert.equal((await get('/api/documents', 'forensic')).status, 403);
  assert.equal((await post('/api/validators/NODE-01/toggle', {}, 'forensic')).status, 403); assert.equal((await post('/api/lab/compromise', { nodeId: 'NODE-01', kind: 'modify-block' }, 'riya')).status, 403);
  assert.equal((await post('/api/identity/revoke', { userId: 'REC-0192' }, 'riya')).status, 403); assert.equal((await post('/api/documents', { name: 'x', content: 'y' }, 'riya')).status, 403);
  assert.equal((await get('/api/users', 'sender')).status, 403); assert.equal((await post('/api/users', { name: 'x' }, 'riya')).status, 403);
  assert.equal((await post('/api/users/REC-0192/toggle', {}, 'forensic')).status, 403);
  assert.equal((await get('/api/audit', 'riya')).status, 403);
});
test('unauthorized decrypt over HTTP: 403 and nothing created', async () => {
  const d0 = (await get('/api/dashboard', 'admin')).body; const r = await post('/api/documents/DOC-0001/decrypt', {}, 'nisha'); assert.equal(r.status, 403); assert.match(r.body.error, /No session, watermark/);
  const d1 = (await get('/api/dashboard', 'admin')).body; assert.equal(d1.sessions, d0.sessions); assert.equal(d1.provenance, d0.provenance); assert.equal(d1.blocks, d0.blocks);
  const ok = await post('/api/documents/DOC-0001/decrypt', {}, 'aarav'); assert.equal(ok.status, 200); assert.equal(ok.body.evidence.signatureValid, true);
  assert.equal((await get('/api/dashboard', 'admin')).body.sessions, d0.sessions + 1);
});
test('IDOR: recipients only see their own documents/sessions and cannot leak others\' sessions', async () => {
  const docs = (await get('/api/documents', 'nisha')).body.docs.map(d => d.id); assert.deepEqual(docs, ['DOC-0002']);
  const mine = (await get('/api/sessions', 'riya')).body; assert.ok(mine.length && mine.every(s => s.user_id === 'REC-0217'));
  const other = (await get('/api/sessions', 'admin')).body.find(s => s.user_id === 'REC-0192');
  assert.equal((await post('/api/leaks', { sessionId: other.id }, 'riya')).status, 403); assert.equal((await post('/api/leaks', { sessionId: other.id }, 'aarav')).status, 200);
  const ids = (await get('/api/identities', 'riya')).body; assert.ok(ids.every(i => i.user_id === 'REC-0217'));
  assert.equal((await get('/api/leaks', 'sender')).status, 403);
  const invLeaks = (await get('/api/leaks', 'forensic')).body; assert.ok(invLeaks.length && invLeaks.every(l => !('session_id' in l) && !('content' in l)), 'investigator cannot see which session a leak came from');
});
test('input validation and injection attempts', async () => {
  assert.equal((await S.call('POST', '/api/auth/login', { username: "' OR 1=1 --", password: "x' OR '1'='1" })).status, 401);
  assert.equal((await post("/api/documents/DOC-0001'%20OR%20'1'='1/decrypt", {}, 'aarav')).status, 400);
  assert.equal((await post('/api/investigations', { leakId: "LEAK-1' OR 1=1--" }, 'forensic')).status, 400);
  assert.equal((await post('/api/leaks', { sessionId: { $ne: 1 } }, 'aarav')).status, 400);
  assert.equal((await post('/api/documents', { name: 'x'.repeat(500), content: 'c', recipients: [] }, 'sender')).status, 400);
  assert.equal((await post('/api/documents', { name: 'n', cls: 'TOPSECRET', content: 'c' }, 'sender')).status, 400);
  assert.equal((await post('/api/documents', { name: 'n', content: 'c', recipients: ['REC-9999'] }, 'sender')).status, 400);
  assert.equal((await S.call('POST', '/api/documents', undefined, tok.sender, '{not json')).status, 400);
  assert.equal((await S.call('POST', '/api/documents', undefined, tok.sender, '[1,2]')).status, 400);
  assert.equal((await S.call('POST', '/api/investigations', undefined, tok.forensic, JSON.stringify({ text: 'a'.repeat(1_100_000) }))).status, 413);
  assert.equal((await post('/api/ledger/verify', { txId: 'TX-NOPE0000' }, 'forensic')).status, 404);
  assert.equal((await M.app.db.get('select count(*) n from users')).n, 7, 'users table intact');
});
test('static serving is allow-listed: traversal and source/data files are not reachable', async () => {
  for (const p of ['/../server.js', '/%2e%2e/server.js', '/src/app.js', '/data/app.db', '/package.json', '/public/../server.js', '/app.js/../../server.js']) { const r = await S.call('GET', p); assert.equal(r.status, 404, p); }
  for (const p of ['/', '/app.js', '/app.css']) assert.equal((await S.call('GET', p)).status, 200, p);
  const idx = await S.call('GET', '/'); assert.match(idx.headers.get('content-security-policy'), /default-src 'self'/); assert.equal(idx.headers.get('x-frame-options'), 'DENY'); assert.equal(idx.headers.get('x-content-type-options'), 'nosniff');
});
test('no CORS: cross-origin browsers get no allow headers, preflight is refused', async () => {
  const r = await S.call('GET', '/api/me', undefined, tok.sender); assert.equal(r.headers.get('access-control-allow-origin'), null);
  const pre = await fetch(S.base + '/api/me', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } }); assert.equal(pre.status, 404); assert.equal(pre.headers.get('access-control-allow-origin'), null);
});
test('no API response anywhere contains private key material or sealed envelopes', async () => {
  const paths = ['/api/dashboard', '/api/documents', '/api/sessions', '/api/leaks', '/api/investigations', '/api/ledger/blocks', '/api/ledger/keys', '/api/validators', '/api/identities', '/api/audit', '/api/lab/run', '/api/me'];
  for (const p of paths) { const r = await get(p, 'admin'); if (r.status === 200) { assert.ok(!/BEGIN [A-Z ]*PRIVATE KEY|"sealed"|"priv"|"kek"|pw_hash|pw_salt/.test(r.text), p); } }
  const dec = await post('/api/documents/DOC-0002/decrypt', {}, 'nisha'); assert.ok(!/BEGIN [A-Z ]*PRIVATE KEY|"sealed"|"priv"/.test(dec.text));
});
test('no ledger-mutating HTTP surface exists (edit/delete of history is not an API operation)', async () => {
  for (const m of ['PUT', 'PATCH', 'DELETE']) for (const p of ['/api/ledger/blocks', '/api/ledger/blocks/1', '/api/ledger/tx', '/api/ledger/delete-tx', '/api/ledger/tamper', '/api/ledger/restore', '/api/sessions/SES-00000000']) assert.equal((await S.call(m, p, {}, tok.admin)).status, 404, m + ' ' + p);
  assert.equal((await post('/api/ledger/delete-tx', { txId: 'TX-00000000' }, 'admin')).status, 404);
});
test('reset and attack simulation are gated', async () => {
  const strict = ctx({ demoMode: false }); const S2 = await serve(strict.app);
  try {
    const nt = await S2.login('riya'), at = await S2.login('admin');
    assert.equal((await S2.call('POST', '/api/reset', {}, nt)).status, 403); assert.equal((await S2.call('POST', '/api/reset', {})).status, 403);
    assert.equal((await S2.call('POST', '/api/lab/compromise', { nodeId: 'NODE-01', kind: 'modify-block' }, at)).status, 403);
    assert.equal((await S2.call('POST', '/api/reset', {}, at)).status, 200);
  } finally { await S2.close(); }
});
test('validators/lab endpoints return computed results', async () => {
  const v = (await get('/api/validators', 'riya')).body; assert.equal(v.nodes.length, 5); assert.match(v.consensus, /Simulated permissioned consensus/);
  for (const n of v.nodes) { assert.equal(n.sync, 'IN_SYNC'); assert.equal(n.validation, 'VALID'); assert.match(n.latestBlockHash, /^[0-9a-f]{64}$/); }
  const lab = (await get('/api/lab/run', 'forensic')).body; assert.ok(lab.length >= 32, 'lab rows: ' + lab.length); assert.deepEqual(lab.filter(t => !t.pass), []);
  const c = await post('/api/lab/compromise', { nodeId: 'NODE-05', kind: 'modify-block' }, 'admin'); assert.equal(c.status, 200); assert.equal(c.body.nodes[4].sync, 'INVALID');
  assert.equal((await post('/api/ledger/validate', {}, 'sender')).body.ok, false);
  assert.equal((await post('/api/validators/NODE-05/resync', {}, 'admin')).status, 200); assert.equal((await post('/api/ledger/validate', {}, 'sender')).body.ok, true);
});
