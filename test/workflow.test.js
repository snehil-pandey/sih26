import test from 'node:test';
import assert from 'node:assert/strict';
import { ctx, PW } from './helpers.js';
import { stripInvisible, extractWatermark, embedWatermark, generateWatermarkId } from '../src/watermark.js';
import { verifyChain, blockHash } from '../src/ledger.js';
import { provenanceTx, keyRegistration } from '../src/provenance.js';
import { evidenceFor } from '../src/provenance.js';

const M = ctx(); const { app, u, kek, dec, counts } = M;

test('authorization is enforced by the backend: unauthorized decrypt creates nothing', () => {
  const before = counts(); const wmBefore = app.db.all('select wm from sessions').length;
  assert.throws(() => app.decrypt(u('REC-0319'), kek('REC-0319'), 'DOC-0002x'), e => e.status === 400, 'malformed id rejected');
  assert.throws(() => app.decrypt(u('REC-0319'), kek('REC-0319'), 'DOC-0001'), e => e.status === 403);
  assert.throws(() => app.decrypt(u('REC-0319'), kek('REC-0319'), 'DOC-0099'), e => e.status === 403, 'unknown document is indistinguishable from unauthorized');
  assert.deepEqual(counts(), before); assert.equal(app.db.all('select wm from sessions').length, wmBefore);
});
test('multiple decryptions: sessions, watermarks and provenance all differ; visible text is equivalent', () => {
  const a1 = dec('REC-0192'), a2 = dec('REC-0192'), b1 = dec('REC-0217');
  assert.equal(new Set([a1.sessionId, a2.sessionId, b1.sessionId]).size, 3);
  assert.equal(new Set([a1.watermarkId, a2.watermarkId, b1.watermarkId]).size, 3);
  assert.equal(new Set([a1.transactionId, a2.transactionId, b1.transactionId]).size, 3);
  assert.notEqual(a1.representation, a2.representation);
  assert.equal(stripInvisible(a1.representation), stripInvisible(b1.representation), 'visible content identical');
  assert.match(a1.representation, /^OPERATION FALCON/);
  for (const r of [a1, a2, b1]) { assert.equal(extractWatermark(r.representation).id, r.watermarkId); assert.equal(r.evidence.signatureValid, true); assert.equal(r.evidence.chainValid, true); }
  assert.ok(!/REC-|Sharma|Mehta|CID-/.test(a1.representation.replace(/[^\x20-\x7e\n]/g, '')), 'watermark carries no identity text');
});
test('watermark: survives loss of one copy, rejects corrupted checksum, absent mark yields nothing', () => {
  const id = generateWatermarkId(), t = embedWatermark('h\nb\nc\nd\ne', id);
  assert.equal(extractWatermark(t.replace(/\u2060[\u200b\u200c]+\u2060/, '')).id, id);
  assert.equal(extractWatermark(stripInvisible(t)).id, null);
  const other = embedWatermark('h\nb\nc', generateWatermarkId()); assert.notEqual(extractWatermark(other).id, id);
  const bad = t.replace(/\u2060([\u200b\u200c])/g, (m, z) => '\u2060' + (z === '\u200b' ? '\u200c' : '\u200b')); assert.equal(extractWatermark(bad).id, null);
});
test('ledger: block hashing, linking, approvals and full-chain validation are computed', () => {
  const v = app.net.view(), bl = v.canonical; assert.ok(bl.length >= 7);
  for (let i = 1; i < bl.length; i++) { assert.equal(bl[i].prev, bl[i - 1].hash); assert.equal(blockHash(bl[i]), bl[i].hash); assert.ok(bl[i].approvals.length >= 3); }
  assert.equal(verifyChain(bl).ok, true);
  const t = structuredClone(bl); t[3].ts = 'x'; assert.equal(verifyChain(t).error.why, 'block hash mismatch');
});
test('ledger replay protection: same session, same watermark and same transaction are all rejected by validators', () => {
  const r = dec('REC-0281'); const f = app.net.findTx(r.transactionId); const rec = f.tx.payload.record;
  assert.throws(() => app.net.submit([f.tx]), /duplicate transaction id|replayed/i, 'resubmitting the identical transaction');
  const key = app.db.get("select * from keys where user_id='REC-0281' and status='ACTIVE'");
  const priv = app.unlockKey(key, kek('REC-0281'));
  assert.throws(() => app.net.submit([provenanceTx({ ...rec, watermarkId: generateWatermarkId() }, priv)]), /replayed decryption session/);
  assert.throws(() => app.net.submit([provenanceTx({ ...rec, sessionId: 'SES-0F0F0F0F' }, priv)]), /duplicate watermark/);
  assert.throws(() => app.db.run('insert into sessions(id,wm) values(?,?)', 'SES-FFFFFFFF', rec.watermarkId), /UNIQUE/, 'database uniqueness backs it up');
});
test('validators reject provenance signed by a key that is not the recipient identity key', () => {
  const rec = { ...app.net.findTx(dec('REC-0192').transactionId).tx.payload.record, sessionId: 'SES-ABCDEF01', watermarkId: generateWatermarkId() };
  const other = app.unlockKey(app.db.get("select * from keys where user_id='REC-0217'"), kek('REC-0217'));
  assert.throws(() => app.net.submit([provenanceTx(rec, other)]), /signature invalid/);
  const rogue = keyRegistration('CID-0192', 1); assert.throws(() => app.net.submit([rogue.tx]), /already registered|unexpected key version/);
});
test('service layer enforces roles itself (not only the HTTP routes)', () => {
  assert.throws(() => app.createDocument(u('REC-0192'), kek('REC-0192'), { name: 'x', content: 'y' }), e => e.status === 403);
  assert.throws(() => app.decrypt(u('USR-0001'), kek('USR-0001'), 'DOC-0001'), e => e.status === 403);
  assert.throws(() => app.investigate(u('REC-0192'), { text: 'x' }), e => e.status === 403);
  assert.throws(() => app.toggleValidator(u('REC-0192'), kek('REC-0192'), 'NODE-01'), e => e.status === 403);
  assert.throws(() => app.compromise(u('USR-0002'), 'NODE-01', 'modify-block'), e => e.status === 403);
  assert.deepEqual(app.net.view().diverged, []);
});
test('quorum: losing validators stops decryption atomically (no session row, no partial state)', () => {
  const adm = u('USR-0003'), ak = kek('USR-0003'); const before = counts();
  app.toggleValidator(adm, ak, 'NODE-05'); app.toggleValidator(adm, ak, 'NODE-04');
  assert.equal(app.validators().agreed, true);
  const c1 = counts(); dec('REC-0192'); assert.equal(counts().sessions, c1.sessions + 1, 'still works with 3/5');
  app.toggleValidator(adm, ak, 'NODE-03');
  const c2 = counts(); assert.equal(app.validators().agreed, false);
  assert.throws(() => dec('REC-0192'), e => e.status === 503); assert.deepEqual(counts(), c2, 'nothing persisted without consensus');
  app.toggleValidator(adm, ak, 'NODE-03'); app.toggleValidator(adm, ak, 'NODE-04'); app.toggleValidator(adm, ak, 'NODE-05');
  const v = app.validators(); assert.ok(v.nodes.every(n => n.sync === 'IN_SYNC'), 'returning validators catch up: ' + JSON.stringify(v.nodes.map(n => n.sync)));
  dec('REC-0192');
});
test('watermark checksum is enforced: a well-formed id with a wrong checksum is rejected', () => {
  const id = generateWatermarkId(), good = embedWatermark('h\nb', id);
  const enc = payload => '\u2060' + [...payload].map(ch => ch.charCodeAt(0).toString(2).padStart(8, '0')).join('').replace(/./g, b => ['\u200b', '\u200c'][+b]) + '\u2060';
  const forged = 'h' + enc(`${id}|0000`) + '\nb'; assert.equal(extractWatermark(forged).id, null); assert.match(extractWatermark(forged).reason, /checksum/);
  assert.equal(extractWatermark(good).id, id);
});
test('provenance must match a sender-signed authorization anchored on the ledger', () => {
  const r = dec('REC-0192'), rec = app.net.findTx(r.transactionId).tx.payload.record;
  const priv = app.unlockKey(app.db.get("select * from keys where user_id='REC-0192' and status='ACTIVE'"), kek('REC-0192'));
  const fresh = () => ({ sessionId: 'SES-' + Math.floor(Math.random() * 0xffffffff).toString(16).toUpperCase().padStart(8, '0'), watermarkId: generateWatermarkId() });
  assert.throws(() => app.net.submit([provenanceTx({ ...rec, ...fresh(), authorizationId: 'AUT-00000000' }, priv)]), /authorization is not recorded/);
  assert.throws(() => app.net.submit([provenanceTx({ ...rec, ...fresh(), documentHash: '0'.repeat(64) }, priv)]), /does not match its ledger authorization/);
  assert.throws(() => app.net.submit([provenanceTx({ ...rec, ...fresh(), documentId: 'DOC-0002' }, priv)]), /does not match its ledger authorization/);
  assert.equal(app.net.view().state.auths.size, app.db.get('select count(*) n from auth').n, 'every authorization row is anchored on the ledger');
  assert.ok([...app.net.view().state.auths.values()].every(a => a.documentHash.length === 64));
});
