import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ctx, PW } from './helpers.js';
import { createApp } from '../src/app.js';
import { sigKeypair, sigSign, sigVerify, kemKeypair, kemEncap, kemDecap, aeadEnc, aeadDec, SIG_ALG, KEM_ALG } from '../src/pq.js';
import { canon } from '../src/util.js';
import { evidenceFor } from '../src/provenance.js';

const { app, u, kek, dec } = ctx();
const liveTx = id => { const v = app.net.view(); for (const b of v.canonical) for (const t of b.txs) if (t.id === id) return [t, b, v]; };

test('key generation: every user has a versioned identity with a unique key id, labelled as SIMULATED PQC', () => {
  const ks = app.db.all('select * from keys'); assert.equal(ks.length, 7);
  assert.equal(new Set(ks.map(k => k.id)).size, 7);
  for (const k of ks) { assert.match(k.alg, /SIMULATED/); assert.equal(k.ver, 1); assert.equal(k.status, 'ACTIVE'); }
  assert.match(SIG_ALG, /SIMULATED/); assert.match(KEM_ALG, /SIMULATED/);
});
test('public-key registration: all keys are registered on the ledger with matching public key, version and status', () => {
  const st = app.net.view().state;
  for (const k of app.db.all('select * from keys')) {
    const reg = st.keys.get(k.id); assert.ok(reg, k.id + ' registered');
    assert.equal(reg.publicKey, k.pub); assert.equal(reg.identityId, k.identity_id); assert.equal(reg.keyVersion, k.ver); assert.equal(reg.status, 'ACTIVE');
  }
});
test('private-key protection: sealed in the DB, absent from ledger, API-facing views and every on-disk file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sih-disk-'));
  const d = createApp({ dataDir: dir }); const kk = id => d.kekFor(id, PW);
  d.decrypt(d.user('REC-0192'), kk('REC-0192'), 'DOC-0001'); d.rotateKey(d.user('REC-0192'), kk('REC-0192'));
  const secrets = [];
  for (const k of d.db.all('select * from keys')) {
    assert.ok(JSON.parse(k.sealed).ct, 'sealed AEAD envelope'); assert.ok(!k.sealed.includes('PRIVATE KEY'));
    const priv = d.unlockKey(k, kk(k.user_id)); secrets.push(priv, Buffer.from(priv.toString('base64')), Buffer.from(priv.toString('hex')));
  }
  // negative control: the scan below must actually be able to find key material if it were present
  const ctl = path.join(dir, 'control.bin'); fs.writeFileSync(ctl, Buffer.concat([Buffer.from('x'), secrets[0], Buffer.from('y')]));
  assert.ok(fs.readFileSync(ctl).includes(secrets[0]), 'scan control'); fs.rmSync(ctl);
  const files = []; (function walk(p) { for (const f of fs.readdirSync(p, { withFileTypes: true })) f.isDirectory() ? walk(path.join(p, f.name)) : files.push(path.join(p, f.name)); })(dir);
  for (const f of files) if (!/master\.(key|salt)$/.test(f)) { const buf = fs.readFileSync(f); for (const s of secrets) assert.ok(!buf.includes(s), 'private key material found in ' + f); assert.ok(!buf.includes('BEGIN PRIVATE KEY'), f); }
  const exposed = JSON.stringify([d.identities(d.user('USR-0003')), d.ledgerBlocks(), d.ledgerKeys(), d.audit(), d.listSessions(d.user('USR-0003'))]);
  assert.ok(!/priv|BEGIN/i.test(exposed.replace(/privateKey":"SEALED[^"]*"/g, '')), 'no private material in API-facing data');
  for (const s of secrets) assert.ok(!exposed.includes(s.toString()));
});
test('signature generation + verification succeed; every signed field is protected', () => {
  const r = dec('REC-0192'); const [tx, blk, v] = liveTx(r.transactionId), rec = tx.payload.record;
  assert.equal(evidenceFor(tx, blk, v).signatureValid, true);
  const mods = { recipientId: 'REC-0217', identityId: 'CID-0217', documentId: 'DOC-0002', documentVersion: '2.0', documentHash: '0'.repeat(64), sessionId: 'SES-00000000', watermarkId: 'WM-0000000000000000', keyId: 'KEY-0217-V1', keyVersion: 2, authorizationId: 'AUT-00000000', timestamp: '2001-01-01T00:00:00.000Z', signatureAlgorithm: 'ML-DSA-65' };
  assert.deepEqual(Object.keys(mods).sort(), Object.keys(rec).sort(), 'test covers every field of the record');
  for (const [k, val] of Object.entries(mods)) assert.equal(evidenceFor(tx, blk, v, { ...rec, [k]: val }).signatureValid, false, 'field ' + k + ' must be signature-protected');
  assert.equal(evidenceFor(tx, blk, v, { ...rec, extra: 'x' }).signatureValid, false, 'added fields break the signature');
});
test('signature primitive: wrong key, altered data and altered signature all fail', () => {
  const a = sigKeypair(), b = sigKeypair(), data = canon({ x: 1, y: [2, 3] }), sig = sigSign(a.priv, data);
  assert.ok(sigVerify(a.pub, data, sig)); assert.ok(!sigVerify(b.pub, data, sig)); assert.ok(!sigVerify(a.pub, data + ' ', sig));
  assert.ok(!sigVerify(a.pub, data, sig.slice(0, -4) + 'AAAA')); assert.ok(!sigVerify(a.pub, data, 'garbage'));
});
test('canonical serialisation is order-independent and recursive', () => { assert.equal(canon({ b: 1, a: { d: 1, c: 2 } }), canon({ a: { c: 2, d: 1 }, b: 1 })); assert.notEqual(canon({ a: 1 }), canon({ a: '1' })); });
test('ML-KEM slot is key establishment only; signatures and bulk encryption are separate primitives', () => {
  const k = kemKeypair(), e = kemEncap(k.pub), key2 = kemDecap(k.priv, e.ct); assert.deepEqual(e.key, key2);
  assert.notDeepEqual(kemDecap(kemKeypair().priv, e.ct), e.key, 'wrong recipient key cannot recover the shared secret');
  assert.throws(() => sigSign(k.priv, 'x'), 'a KEM key cannot sign');
  assert.ok(!sigVerify(k.pub, 'x', 'AAAA'));
  const box = aeadEnc(e.key, Buffer.from('secret'), 'aad'); assert.equal(aeadDec(e.key, box, 'aad').toString(), 'secret');
  assert.throws(() => aeadDec(e.key, box, 'other-aad')); assert.throws(() => aeadDec(Buffer.alloc(32), box, 'aad'));
});
test('database layout keeps signing keys and KEM keys in separate tables/columns with separate algorithms', () => {
  const s = app.db.get('select * from keys limit 1'), k = app.db.get('select * from kem limit 1');
  assert.match(s.alg, /ML-DSA/); assert.match(k.alg, /ML-KEM/); assert.notEqual(s.pub, k.pub);
});
