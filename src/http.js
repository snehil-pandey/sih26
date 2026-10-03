import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERR, P, J } from './util.js';
import { demoManager } from './demo-session.js';

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
// Static files are served from a fixed allow-list only (no path traversal possible).
const STATIC = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/app.css': ['app.css', 'text/css; charset=utf-8'] };
const HEADERS = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };
const ALL = ['SENDER', 'RECIPIENT', 'INVESTIGATOR', 'ADMIN'], MAX_BODY = 1_000_000;

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

export function createRequestHandler(app, { log = console.error } = {}) {
  const routes = [];
  const R = (m, p, roles, h) => routes.push([m, new RegExp('^' + p.replace(/:\w+/g, '([^/]+)') + '$'), roles, h]);

  // ---- routes: every handler receives (auth, params, body, token, req, res) ----
  R('POST', '/api/auth/register', null, (_, __, b, ___, req, res) => {
    const out = app.register(b);
    if (res && out?.token) {
      const isSecure = req.headers['x-forwarded-proto'] === 'https' || req.socket?.encrypted;
      res.setHeader('Set-Cookie', `sih_token=${out.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${480 * 60}${isSecure ? '; Secure' : ''}`);
    }
    return out;
  });
  R('POST', '/api/auth/login', null, (_, __, b, ___, req, res) => {
    const out = app.login(b.username, b.password);
    if (res && out?.token) {
      const isSecure = req.headers['x-forwarded-proto'] === 'https' || req.socket?.encrypted;
      res.setHeader('Set-Cookie', `sih_token=${out.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${480 * 60}${isSecure ? '; Secure' : ''}`);
    }
    return out;
  });
  R('POST', '/api/auth/logout', ALL, (a, _, __, tok, req, res) => {
    app.logout(tok);
    if (res) {
      const isSecure = req.headers['x-forwarded-proto'] === 'https' || req.socket?.encrypted;
      res.setHeader('Set-Cookie', `sih_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${isSecure ? '; Secure' : ''}`);
    }
    return { ok: true };
  });
  R('POST', '/api/auth/change-password', ALL, (a, _, b) => app.changePassword(a.user, a.kek, b));
  R('GET', '/api/me', ALL, a => ({ id: a.user.id, name: a.user.name, role: a.user.role }));
  R('GET', '/api/environment', null, () => app.environment());
  R('GET', '/api/dashboard', ALL, () => app.dashboard());
  R('GET', '/api/documents', ['SENDER', 'RECIPIENT', 'ADMIN'], a => app.listDocuments(a.user));
  R('POST', '/api/documents', ['SENDER'], (a, _, b) => app.createDocument(a.user, a.kek, b));
  R('POST', '/api/documents/:id/decrypt', ['RECIPIENT'], (a, [id], b) => app.decrypt(a.user, a.kek, id, b?.clientSignedRecord));
  R('POST', '/api/documents/:id/revoke', ['SENDER', 'ADMIN'], (a, [id], b) => app.revokeAuthorization(a.user, a.kek, { documentId: id, recipientId: b.recipientId, reason: b.reason }));
  R('GET', '/api/sessions', ALL, a => app.listSessions(a.user));
  R('POST', '/api/leaks', ['SENDER', 'RECIPIENT', 'ADMIN'], (a, _, b) => app.createLeak(a.user, b.sessionId));
  R('GET', '/api/leaks', ['INVESTIGATOR', 'ADMIN'], () => app.listLeaks());
  R('POST', '/api/investigations', ['INVESTIGATOR', 'ADMIN'], (a, _, b) => app.investigate(a.user, b));
  R('GET', '/api/investigations', ['INVESTIGATOR', 'ADMIN'], a => app.listInvestigations(a.user));
  R('GET', '/api/ledger/blocks', ALL, () => app.ledgerBlocks());
  R('GET', '/api/ledger/keys', ALL, () => app.ledgerKeys());
  R('POST', '/api/ledger/validate', ALL, () => app.validateLedger());
  R('POST', '/api/ledger/verify', ['SENDER', 'INVESTIGATOR', 'ADMIN'], (a, _, b) => app.txEvidence(String(b.txId), b.overrides && typeof b.overrides === 'object' ? b.overrides : undefined));
  R('GET', '/api/validators', ALL, () => app.validators());
  R('POST', '/api/validators/:id/toggle', ['ADMIN'], (a, [id]) => app.toggleValidator(a.user, a.kek, id));
  R('POST', '/api/validators/:id/resync', ['ADMIN'], (a, [id]) => app.resyncValidator(a.user, a.kek, id));
  R('POST', '/api/lab/compromise', ['ADMIN'], (a, _, b) => {
    if (!app.demoMode) throw ERR(403, 'Attack simulation is disabled outside demo mode');
    return app.compromise(a.user, b.nodeId, b.kind);
  });
  R('GET', '/api/lab/run', ['INVESTIGATOR', 'ADMIN'], () => app.lab());
  R('GET', '/api/identities', ALL, a => app.identities(a.user));
  R('POST', '/api/identity/rotate', ALL, a => app.rotateKey(a.user, a.kek));
  R('POST', '/api/identity/revoke', ['ADMIN'], (a, _, b) => app.revokeKey(a.user, a.kek, b.userId, b.reason));
  R('GET', '/api/users', ['ADMIN'], a => app.listUsers(a.user));
  R('POST', '/api/users', ['ADMIN'], (a, _, b) => app.createUser(a.user, a.kek, b));
  R('POST', '/api/users/:id/toggle', ['ADMIN'], (a, [id]) => app.toggleUserStatus(a.user, id));
  R('GET', '/api/audit', ['SENDER', 'INVESTIGATOR', 'ADMIN'], () => app.audit());
  R('POST', '/api/reset', null, (a, _, __, ___, req) => {
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
    if (a?.user?.role !== 'ADMIN' && (!app.demoMode || !loopback)) throw ERR(403, 'Reset is limited to administrators or local demo use');
    app.reset(); return { ok: true };
  });

  // ---- Isolated Ephemeral Interactive Demo Endpoints ----
  R('POST', '/api/demo/start', null, () => {
    const sessionId = demoManager.createSession();
    return { ok: true, sessionId };
  });
  R('POST', '/api/demo/execute', null, async (_, __, b) => {
    const sessionId = b?.sessionId;
    const targetStep = parseInt(b?.step || 1, 10);
    if (!sessionId) throw ERR(400, 'Demo sessionId required');
    const session = demoManager.getSession(sessionId);
    if (!session) throw ERR(404, 'Demo session expired or not found');
    const res = await session.executeStep(targetStep);
    return res;
  });
  R('POST', '/api/demo/stop', null, (_, __, b) => {
    const sessionId = b?.sessionId;
    if (sessionId) demoManager.destroySession(sessionId);
    return { ok: true };
  });

  return (req, res) => {
    let body = '', size = 0, dead = false;
    const send = (code, obj, type = 'application/json') => {
      if (dead) return;
      res.writeHead(code, { ...HEADERS, 'content-type': type });
      res.end(type === 'application/json' ? J(obj) : obj);
    };
    req.on('data', d => {
      size += d.length;
      if (size > MAX_BODY && !dead) {
        dead = true;
        res.writeHead(413, { ...HEADERS, 'content-type': 'application/json', connection: 'close' });
        res.end(J({ error: 'Payload too large' }));
        req.resume();
      } else if (!dead) body += d;
    });
    req.on('end', async () => {
      if (dead) return;
      try {
        const url = req.url.split('?')[0];
        if (!url.startsWith('/api')) {
          const f = STATIC[url]; if (!f || req.method !== 'GET') return send(404, { error: 'Not found' });
          return send(200, fs.readFileSync(path.join(PUB, f[0])), f[1]);
        }
        const cookies = parseCookies(req.headers.cookie);
        const token = req.headers['x-token'] || cookies.sih_token;
        const auth = app.authenticate(token);
        for (const [m, re, roles, h] of routes) {
          const x = re.exec(url); if (m !== req.method || !x) continue;
          if (roles && !auth) throw ERR(401, 'Authentication required');
          if (roles && !roles.includes(auth.user.role)) throw ERR(403, `Role ${auth.user.role} is not permitted to perform this action`);
          let b = {}; if (body) { try { b = P(body); } catch { throw ERR(400, 'Malformed JSON'); } if (b === null || typeof b !== 'object' || Array.isArray(b)) throw ERR(400, 'JSON object expected'); }
          const resObj = await h(auth, x.slice(1).map(decodeURIComponent), b, token, req, res);
          return send(200, resObj);
        }
        throw ERR(404, 'Not found');
      } catch (e) {
        const dup = /UNIQUE/.test(String(e.message));
        if (e.status) return send(e.status, { error: e.message });
        log('internal error:', e.message); send(dup ? 409 : 500, { error: dup ? 'Duplicate submission rejected' : 'Internal error' });
      }
    });
  };
}

export function createHttpServer(app, { log = console.error, tls = null } = {}) {
  const tlsConfig = tls || (process.env.TLS_CERT_PATH && process.env.TLS_KEY_PATH ? {
    cert: fs.readFileSync(process.env.TLS_CERT_PATH),
    key: fs.readFileSync(process.env.TLS_KEY_PATH)
  } : null);

  const requestHandler = createRequestHandler(app, { log });
  return tlsConfig ? https.createServer(tlsConfig, requestHandler) : http.createServer(requestHandler);
}
