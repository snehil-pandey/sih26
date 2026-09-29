import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ctx, PW } from './helpers.js';
import { createApp } from '../src/app.js';
import { provenanceTx, keyRegistration } from '../src/provenance.js';
import { generateWatermarkId } from '../src/watermark.js';
import { aeadDec } from '../src/pq.js';
import { deriveKek } from '../src/keystore.js';

const { app, u, kek, dec } = ctx();

test('admin cannot use recipient keys: unlocking needs the owner\'s credential-derived key', () => {
  const k = app.db.get("select * from keys where user_id='REC-0217'");
  assert.throws(() => app.unlockKey(k, kek('USR-0003')), e => e.status === 403, 'admin KEK cannot unseal');
  assert.doesNotThrow(() => app.unlockKey(k, kek('REC-0217')));
  const r = dec('REC-0217'), rec = { ...app.net.findTx(r.transactionId).tx.payload.record, sessionId: 'SES-77777777', watermarkId: generateWatermarkId() };
  const admKey = app.db.get("select * from keys where user_id='USR-0003'"), admPriv = app.unlockKey(admKey, kek('USR-0003'));
  assert.throws(() => app.net.submit([provenanceTx(rec, admPriv)]), /signature invalid/, 'admin signing as Riya is rejected by validators');
  assert.throws(() => app.net.submit([provenanceTx({ ...rec, identityId: admKey.identity_id, keyId: admKey.id, keyVersion: 1 }, admPriv)]), /not bound to the named recipient/, 'an insider cannot frame a recipient by signing a record that names them');
});
test('admin cannot silently replace a registered public key on the ledger', () => {
  const rogue = keyRegistration('CID-0217', 2, undefined, 'RECIPIENT', 'REC-0217'); assert.throws(() => app.net.submit([rogue.tx]), /rotation endorsement/);
  const dup = keyRegistration('CID-0217', 1, undefined, 'RECIPIENT', 'REC-0217'); assert.throws(() => app.net.submit([dup.tx]), /already registered|unexpected key version/);
  const admKey = app.db.get("select * from keys where user_id='USR-0003'"), adminPriv = app.unlockKey(admKey, kek('USR-0003'));
  const asAdmin = keyRegistration('CID-0217', 2, { priv: adminPriv }, 'RECIPIENT', 'REC-0217'); assert.throws(() => app.net.submit([asAdmin.tx]), /rotation endorsement/, 'endorsement must come from the identity\'s own previous key');
  const elevate = keyRegistration('CID-0217', 2, { priv: app.unlockKey(app.db.get("select * from keys where user_id='REC-0217' and status='ACTIVE'"), kek('REC-0217')) }, 'ADMIN', 'REC-0217'); assert.throws(() => app.net.submit([elevate.tx]), /role cannot change/);
});
test('operational-DB edits by an administrator do not change ledger-derived attribution', () => {
  const r = dec('REC-0192'), inv0 = app.investigate(u('USR-0002'), { text: r.representation }); assert.equal(inv0.recipientId, 'REC-0192');
  app.db.run("update sessions set user_id='REC-0217' where id=?", r.sessionId);
  app.db.run("update users set name='Somebody Else' where id='REC-0192'");
  app.db.run("update keys set pub='AAAA' where id='KEY-0192-V1'");
  const inv1 = app.investigate(u('USR-0002'), { text: r.representation });
  assert.equal(inv1.recipientId, 'REC-0192', 'recipient comes from the signed ledger record'); assert.equal(inv1.attributionStatus, 'VERIFIED_PROVENANCE_MATCH'); assert.equal(inv1.signatureValid, true, 'key comes from the ledger, not the app DB');
  assert.equal(inv1.evidence.key.keyId, 'KEY-0192-V1');
});
test('audit separation: wiping the operational log does not erase ledger history', () => {
  const before = app.audit().ledger.length; assert.ok(before > 5);
  app.db.run('delete from oplog'); const a = app.audit();
  assert.equal(a.operational.length, 0); assert.equal(a.ledger.length, before); assert.match(a.note, /NOT authoritative/);
});
test('legitimate administrative actions are recorded on the ledger as ADMIN_OPERATION, separate from provenance', () => {
  app.toggleValidator(u('USR-0003'), kek('USR-0003'), 'NODE-05'); app.toggleValidator(u('USR-0003'), kek('USR-0003'), 'NODE-05');
  const ops = app.net.view().state.ops.map(o => o.operation); assert.deepEqual(ops.slice(-2), ['VALIDATOR_OFFLINE', 'VALIDATOR_ONLINE']);
  assert.ok(app.audit().ledger.some(x => x.type === 'ADMIN_OPERATION'));
  assert.equal(app.net.view().state.prov.size, app.dashboard().provenance, 'admin operations are not counted as provenance');
});
test('persistence: state survives restart; old login sessions do not; keys still work', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sih-persist-'));
  const a = createApp({ dataDir: dir }), login = a.login('riya', PW), d1 = a.dashboard(), head1 = d1.ledgerHead;
  const r = a.decrypt(a.user('REC-0217'), a.kekFor('REC-0217', PW), 'DOC-0001'); const d2 = a.dashboard(); assert.equal(d2.sessions, d1.sessions + 1);
  const b = createApp({ dataDir: dir }); const d3 = b.dashboard();
  assert.equal(d3.sessions, d2.sessions); assert.equal(d3.blocks, d2.blocks); assert.equal(d3.ledgerHead, d2.ledgerHead); assert.notEqual(d3.ledgerHead, head1); assert.equal(d3.validators.agreed, true);
  assert.equal(b.authenticate(login.token), null, 'in-memory login sessions (which hold unlocked KEKs) do not survive a restart');
  const l2 = b.login('riya', PW); assert.ok(b.authenticate(l2.token));
  const r2 = b.decrypt(b.user('REC-0217'), b.kekFor('REC-0217', PW), 'DOC-0001'); assert.equal(r2.evidence.signatureValid, true);
  const inv = b.investigate(b.user('USR-0002'), { text: r.representation }); assert.equal(inv.attributionStatus, 'VERIFIED_PROVENANCE_MATCH', 'pre-restart artefact still attributes');
  for (const f of ['app.db', 'keystore/master.key', 'validators/NODE-01.db']) assert.ok(fs.existsSync(path.join(dir, f)), f);
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, 'keystore/master.key')).mode & 0o077, 0, 'master key file is owner-only');
});
test('validator signing keys are sealed in the validator store', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sih-vk-')); const a = createApp({ dataDir: dir });
  const raw = fs.readFileSync(path.join(dir, 'validators/NODE-01.db')); assert.ok(!raw.includes('BEGIN PRIVATE KEY'));
  assert.ok(a.net.nodes[0].priv.length > 30); const meta = a.net.nodes[0].db.get("select v from meta where k='key'").v; assert.ok(!meta.includes(a.net.nodes[0].priv.toString('base64')));
});
