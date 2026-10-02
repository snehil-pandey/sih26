import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApp } from '../src/app.js';
import { createRequestHandler } from '../src/http.js';
import { openDb } from '../src/db.js';
import { createStorageProvider } from '../src/storage.js';

test('Account Registration: successful self-registration for Recipient, Sender, Investigator', async () => {
  const app = createApp({ demoMode: true });

  // Register Recipient
  const r1 = app.register({ name: 'Alice Recipient', username: 'alice_rec', role: 'RECIPIENT', password: 'password1234' });
  assert.ok(r1.token, 'Token returned');
  assert.equal(r1.user.role, 'RECIPIENT');
  assert.match(r1.user.id, /^REC-\d{4}$/);

  // Authenticate session immediately works
  const auth1 = app.authenticate(r1.token);
  assert.ok(auth1, 'Session authenticated');
  assert.equal(auth1.user.id, r1.user.id);

  // Register Sender
  const s1 = app.register({ name: 'Bob Sender', username: 'bob_snd', role: 'SENDER', password: 'password1234' });
  assert.ok(s1.token);
  assert.equal(s1.user.role, 'SENDER');
  assert.match(s1.user.id, /^USR-\d{4}$/);

  // Register Investigator
  const i1 = app.register({ name: 'Carol Investigator', username: 'carol_inv', role: 'INVESTIGATOR', password: 'password1234' });
  assert.ok(i1.token);
  assert.equal(i1.user.role, 'INVESTIGATOR');
  assert.match(i1.user.id, /^USR-\d{4}$/);

  // Re-login with registered user credentials
  const relogin = app.login('alice_rec', 'password1234');
  assert.ok(relogin.token);
  assert.equal(relogin.user.id, r1.user.id);
});

test('Account Registration: rejects Admin self-registration and enforces validation', async () => {
  const app = createApp({ demoMode: true });

  // Cannot self-register as ADMIN
  assert.throws(() => {
    app.register({ name: 'Malicious Admin', username: 'evil_admin', role: 'ADMIN', password: 'password1234' });
  }, /Administrator accounts cannot be self-registered/);

  // Short password
  assert.throws(() => {
    app.register({ name: 'Short PW', username: 'short_pw', role: 'RECIPIENT', password: '123' });
  }, /Password must be between 8 and 128 characters/);

  // Duplicate username
  app.register({ name: 'User One', username: 'userone', role: 'RECIPIENT', password: 'password1234' });
  assert.throws(() => {
    app.register({ name: 'User Two', username: 'userone', role: 'RECIPIENT', password: 'password1234' });
  }, /Username already exists/);
});

test('Data Isolation: non-admin investigators cannot see other investigators records', async () => {
  const app = createApp({ demoMode: true });

  // Register two independent investigators
  const inv1 = app.register({ name: 'Investigator One', username: 'inv_one', role: 'INVESTIGATOR', password: 'password1234' });
  const inv2 = app.register({ name: 'Investigator Two', username: 'inv_two', role: 'INVESTIGATOR', password: 'password1234' });

  // Run an investigation as inv1
  const authInv1 = app.authenticate(inv1.token);
  const authInv2 = app.authenticate(inv2.token);
  const admin = app.login('admin', 'demo1234');
  const authAdmin = app.authenticate(admin.token);

  app.investigate(authInv1.user, { text: 'Sample leaked document with no watermark', label: 'Case 101' });

  // Inv1 sees their investigation
  const list1 = app.listInvestigations(authInv1.user);
  assert.equal(list1.length, 1);
  assert.equal(list1[0].label, 'Case 101');

  // Inv2 sees 0 investigations (isolated)
  const list2 = app.listInvestigations(authInv2.user);
  assert.equal(list2.length, 0);

  // Admin sees all investigations
  const listAdmin = app.listInvestigations(authAdmin.user);
  assert.ok(listAdmin.length >= 1);
});

test('HTTP Serverless & Cookie Authentication', async () => {
  const app = createApp({ demoMode: true });
  const handler = createRequestHandler(app);

  // Mock req & res for POST /api/auth/register
  const mockReq = (method, url, body, headers = {}) => {
    const raw = body ? JSON.stringify(body) : '';
    const stream = new Readable({
      read() {
        if (raw) this.push(raw);
        this.push(null);
      }
    });
    stream.method = method;
    stream.url = url;
    stream.headers = { 'content-type': 'application/json', ...headers };
    stream.socket = { encrypted: false };
    return stream;
  };

  const mockRes = () => {
    return {
      statusCode: null,
      headers: {},
      body: '',
      writeHead(code, h) {
        this.statusCode = code;
        Object.assign(this.headers, h);
      },
      setHeader(k, v) {
        this.headers[k.toLowerCase()] = v;
      },
      end(chunk) {
        this.body += chunk || '';
      }
    };
  };

  // 1. Register via HTTP
  const regReq = await mockReq('POST', '/api/auth/register', {
    name: 'Cookie User',
    username: 'cookie_user',
    role: 'RECIPIENT',
    password: 'cookie_pw123'
  });
  const regRes = mockRes();
  handler(regReq, regRes);
  await new Promise(r => regReq.on('end', r));
  await new Promise(r => setTimeout(r, 50));

  assert.equal(regRes.statusCode, 200);
  const regData = JSON.parse(regRes.body);
  assert.ok(regData.token);
  assert.ok(regRes.headers['set-cookie'], 'Set-Cookie header present');
  assert.match(regRes.headers['set-cookie'], /sih_token=/);

  // 2. Access protected endpoint using Cookie
  const meReq = await mockReq('GET', '/api/me', null, {
    cookie: `sih_token=${regData.token}`
  });
  const meRes = mockRes();
  handler(meReq, meRes);
  await new Promise(r => meReq.on('end', r));
  await new Promise(r => setTimeout(r, 50));

  assert.equal(meRes.statusCode, 200);
  const meData = JSON.parse(meRes.body);
  assert.equal(meData.id, regData.user.id);
});

test('Deployment Profiles: local vs hosted', async () => {
  const localApp = createApp({ deploymentProfile: 'local', demoMode: true });
  assert.equal(localApp.deploymentProfile, 'LOCAL');
  const envLocal = localApp.environment();
  assert.equal(envLocal.deploymentProfile, 'LOCAL');

  const hostedApp = createApp({ deploymentProfile: 'hosted', demoMode: true });
  assert.equal(hostedApp.deploymentProfile, 'HOSTED');
  const envHosted = hostedApp.environment();
  assert.equal(envHosted.deploymentProfile, 'HOSTED');
});

test('Storage Provider Abstraction', async () => {
  const memStorage = createStorageProvider({ profile: 'hosted' });
  memStorage.write('test.txt', Buffer.from('hello world'));
  assert.equal(memStorage.exists('test.txt'), true);
  const data = memStorage.read('test.txt');
  assert.equal(data.toString(), 'hello world');
  memStorage.delete('test.txt');
  assert.equal(memStorage.exists('test.txt'), false);
});
