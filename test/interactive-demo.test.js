import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createRequestHandler } from '../src/http.js';
import { demoManager } from '../src/demo-session.js';
import { Readable } from 'node:stream';

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

test('Interactive Demo: Isolated lifecycle over HTTP', async () => {
  const primaryApp = createApp({ demoMode: true });
  const handler = createRequestHandler(primaryApp);

  const initialUserCount = primaryApp.db.get('select count(*) n from users').n;
  const initialDocCount = primaryApp.db.get('select count(*) n from documents').n;
  const initialSessionCount = primaryApp.db.get('select count(*) n from sessions').n;

  // 1. Start Demo Session via HTTP
  const startReq = mockReq('POST', '/api/demo/start', {});
  const startRes = mockRes();
  handler(startReq, startRes);
  await new Promise(r => startReq.on('end', r));
  await new Promise(r => setTimeout(r, 50));

  assert.equal(startRes.statusCode, 200);
  const startData = JSON.parse(startRes.body);
  assert.ok(startData.sessionId);
  const sid = startData.sessionId;

  // 2. Execute Step 1 (Enter Sender Username)
  const step1Req = mockReq('POST', '/api/demo/execute', { sessionId: sid, step: 1 });
  const step1Res = mockRes();
  handler(step1Req, step1Res);
  await new Promise(r => step1Req.on('end', r));
  await new Promise(r => setTimeout(r, 50));

  assert.equal(step1Res.statusCode, 200);
  const step1Data = JSON.parse(step1Res.body);
  assert.equal(step1Data.step, 1);
  assert.equal(step1Data.meta.title, 'Enter Sender Username');
  const totalSteps = step1Data.totalSteps;
  assert.ok(totalSteps >= 30, 'Total steps should be at least 30 granular steps');

  // 3. Execute Final Step (Full Attribution)
  const finalStepReq = mockReq('POST', '/api/demo/execute', { sessionId: sid, step: totalSteps });
  const finalStepRes = mockRes();
  handler(finalStepReq, finalStepRes);
  await new Promise(r => finalStepReq.on('end', r));
  await new Promise(r => setTimeout(r, 100));

  assert.equal(finalStepRes.statusCode, 200);
  const finalStepData = JSON.parse(finalStepRes.body);
  assert.equal(finalStepData.step, totalSteps);
  assert.equal(finalStepData.evidence.attributionStatus, 'VERIFIED_PROVENANCE_MATCH');
  assert.equal(finalStepData.evidence.signatureValid, true);
  assert.equal(finalStepData.evidence.ledgerValid, true);
  assert.ok(finalStepData.evidence.recipientName);

  // 4. Stop Demo Session
  const stopReq = mockReq('POST', '/api/demo/stop', { sessionId: sid });
  const stopRes = mockRes();
  handler(stopReq, stopRes);
  await new Promise(r => stopReq.on('end', r));
  await new Promise(r => setTimeout(r, 50));

  assert.equal(stopRes.statusCode, 200);
  assert.equal(demoManager.getSession(sid), undefined);

  // 5. Verify Real Application Database Remains 100% Uncontaminated
  const postUserCount = primaryApp.db.get('select count(*) n from users').n;
  const postDocCount = primaryApp.db.get('select count(*) n from documents').n;
  const postSessionCount = primaryApp.db.get('select count(*) n from sessions').n;

  assert.equal(postUserCount, initialUserCount, 'User count unchanged in persistent app');
  assert.equal(postDocCount, initialDocCount, 'Doc count unchanged in persistent app');
  assert.equal(postSessionCount, initialSessionCount, 'Session count unchanged in persistent app');

  // 6. Test Repeatability: Run 2 must be completely independent with a new session and fresh IDs
  const startReq2 = mockReq('POST', '/api/demo/start', {});
  const startRes2 = mockRes();
  handler(startReq2, startRes2);
  await new Promise(r => startReq2.on('end', r));
  await new Promise(r => setTimeout(r, 50));

  const startData2 = JSON.parse(startRes2.body);
  const sid2 = startData2.sessionId;
  assert.notEqual(sid, sid2, 'Run 1 and Run 2 must have distinct session IDs');

  // Verify step 1 explanations (what, why, meaning)
  const step1Req2 = mockReq('POST', '/api/demo/execute', { sessionId: sid2, step: 1 });
  const step1Res2 = mockRes();
  handler(step1Req2, step1Res2);
  await new Promise(r => step1Req2.on('end', r));
  await new Promise(r => setTimeout(r, 50));
  const step1Data2 = JSON.parse(step1Res2.body);
  assert.ok(step1Data2.meta.what, 'What is happening must be present');
  assert.ok(step1Data2.meta.why, 'Why we are doing it must be present');
  assert.ok(step1Data2.meta.meaning, 'What the result means must be present');

  // Test midway exit / cleanup
  const stopReq2 = mockReq('POST', '/api/demo/stop', { sessionId: sid2 });
  const stopRes2 = mockRes();
  handler(stopReq2, stopRes2);
  await new Promise(r => stopReq2.on('end', r));
  await new Promise(r => setTimeout(r, 50));

  assert.equal(demoManager.getSession(sid2), undefined, 'Midway exit completely destroys session');
  assert.equal(primaryApp.db.get('select count(*) n from users').n, initialUserCount, 'Zero persistence after multiple runs');
  primaryApp.close();
});
