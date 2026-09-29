import test from 'node:test';
import assert from 'node:assert/strict';
import { ctx, PW } from './helpers.js';
import { evidenceFor, provenanceTx, statusChangeTx } from '../src/provenance.js';
import { extractWatermark, embedWatermark, generateWatermarkId, stripInvisible } from '../src/watermark.js';
import { canon } from '../src/util.js';

const { app, u, kek, dec, counts } = ctx();
const ev = txId => app.txEvidence(txId);

test('key rotation: record 1 verifies with V1, record 2 with V2; V1 can no longer sign', () => {
  const r1 = dec('REC-0192'); const rot = app.rotateKey(u('REC-0192'), kek('REC-0192')); const r2 = dec('REC-0192');
  assert.equal(r1.keyId, 'KEY-0192-V1'); assert.equal(r2.keyId, 'KEY-0192-V2'); assert.equal(rot.newKey, 'KEY-0192-V2');
  const e1 = ev(r1.transactionId), e2 = ev(r2.transactionId);
  assert.equal(e1.signatureValid, true); assert.equal(e1.key.keyVersion, 1); assert.equal(e1.key.status, 'ROTATED');
  assert.equal(e2.signatureValid, true); assert.equal(e2.key.keyVersion, 2); assert.equal(e2.key.status, 'ACTIVE');
  const st = app.net.view().state; assert.deepEqual(st.ids.get('CID-0192'), ['KEY-0192-V1', 'KEY-0192-V2']);
  const v1 = app.db.get("select * from keys where id='KEY-0192-V1'"), priv = app.unlockKey(v1, kek('REC-0192'));
  const rec = { ...app.net.findTx(r2.transactionId).tx.payload.record, keyId: v1.id, keyVersion: 1, sessionId: 'SES-11111111', watermarkId: generateWatermarkId() };
  assert.throws(() => app.net.submit([provenanceTx(rec, priv)]), /not active \(ROTATED\)/, 'ledger refuses new signatures from a rotated key');
  const invOld = app.investigate(u('USR-0002'), { text: r1.representation }); assert.equal(invOld.attributionStatus, 'VERIFIED_PROVENANCE_MATCH'); assert.equal(invOld.keyVersion, 1);
});
test('key revocation: new signing rejected everywhere; historical records still verify', () => {
  const before = dec('REC-0281'); const adm = u('USR-0003');
  assert.throws(() => app.revokeKey(u('REC-0217'), kek('REC-0217'), 'REC-0281'), e => e.status === 403, 'service layer refuses a non-admin');
  const riyaKey = app.db.get("select * from keys where user_id='REC-0217' and status='ACTIVE'");
  const forged = statusChangeTx({ identityId: riyaKey.identity_id, keyId: riyaKey.id, priv: app.unlockKey(riyaKey, kek('REC-0217')) }, 'KEY-0281-V1', 'forged');
  assert.throws(() => app.net.submit([forged]), /not authorised to revoke/, 'validators refuse a non-admin revocation even if it is validly signed');
  assert.equal(app.net.view().state.keys.get('KEY-0281-V1').status, 'ACTIVE');
  app.revokeKey(adm, kek('USR-0003'), 'REC-0281');
  const c = counts(); assert.throws(() => dec('REC-0281'), e => e.status === 403 && /revoked/.test(e.message)); assert.deepEqual(counts(), c);
  const st = app.net.view().state; assert.equal(st.keys.get('KEY-0281-V1').status, 'REVOKED'); assert.ok(st.keys.get('KEY-0281-V1').revokedAt);
  const priv = app.unlockKey(app.db.get("select * from keys where id='KEY-0281-V1'"), kek('REC-0281'));
  const rec = { ...app.net.findTx(before.transactionId).tx.payload.record, sessionId: 'SES-22222222', watermarkId: generateWatermarkId() };
  assert.throws(() => app.net.submit([provenanceTx(rec, priv)]), /not active \(REVOKED\)/, 'even with the raw key, the ledger rejects it');
  const e = ev(before.transactionId); assert.equal(e.signatureValid, true, 'historical record still verifies'); assert.equal(e.key.status, 'REVOKED');
  assert.ok(app.audit().ledger.some(x => x.type === 'KEY_STATUS_CHANGE'), 'revocation is on the ledger');
});

test('end-to-end: A and B decrypt, leak of B is attributed to B via extraction -> ledger -> key -> signature -> chain -> validators', () => {
  const A = dec('REC-0192', 'DOC-0002'), B = dec('REC-0319', 'DOC-0002'); assert.notEqual(A.watermarkId, B.watermarkId);
  const sess = app.listSessions(u('REC-0319')).find(s => s.id === B.sessionId); const leak = app.createLeak(u('REC-0319'), sess.id);
  assert.throws(() => app.createLeak(u('REC-0192'), B.sessionId), e => e.status === 403, 'cannot leak someone else\'s session');
  const inv = app.investigate(u('USR-0002'), { leakId: leak.id });
  assert.equal(inv.attributionStatus, 'VERIFIED_PROVENANCE_MATCH'); assert.equal(inv.recipientId, 'REC-0319'); assert.equal(inv.sessionId, B.sessionId); assert.equal(inv.watermarkId, B.watermarkId);
  assert.equal(inv.transactionId, B.transactionId); assert.equal(inv.blockId, B.block); assert.equal(inv.keyId, 'KEY-0319-V1');
  for (const k of ['signatureValid', 'transactionValid', 'blockValid', 'chainValid', 'ledgerValid']) assert.equal(inv[k], true, k);
  assert.equal(inv.validatorAgreement.agreed, true); assert.deepEqual(inv.steps.map(s => s.ok), inv.steps.map(() => true));
  assert.match(inv.statement, /does not by itself prove who physically disclosed/);
  assert.ok(app.listInvestigations().some(i => i.id === inv.id), 'persisted');
  const invA = app.investigate(u('USR-0002'), { text: A.representation }); assert.equal(invA.recipientId, 'REC-0192', 'different copy resolves to a different recipient');
  globalThis.__B = { B, leak };
});
test('investigation input is only the artefact: no recipient parameter influences the outcome', () => {
  const { B } = globalThis.__B; const inv = app.investigate(u('USR-0002'), { text: B.representation, recipientId: 'REC-0192', recipient: 'REC-0192' });
  assert.equal(inv.recipientId, 'REC-0319');
});
test('attacks on the watermark: stripped, forged-but-well-formed and truncated artefacts never yield attribution', () => {
  const { B } = globalThis.__B;
  const stripped = app.investigate(u('USR-0002'), { text: stripInvisible(B.representation) }); assert.equal(stripped.attributionStatus, 'NO_ATTRIBUTION'); assert.equal(stripped.watermarkRecovered, false);
  const forged = app.investigate(u('USR-0002'), { text: embedWatermark(stripInvisible(B.representation), generateWatermarkId()) });
  assert.equal(forged.attributionStatus, 'NO_ATTRIBUTION'); assert.equal(forged.watermarkRecovered, true); assert.equal(forged.provenanceFound, false);
  assert.throws(() => app.investigate(u('USR-0002'), { text: '' }), e => e.status === 400);
});
test('tamper: one modified validator is detected, evidence still verifies from the majority, and attribution warns', () => {
  const { B } = globalThis.__B;
  for (const kind of ['modify-transaction', 'modify-block', 'modify-previous-hash', 'delete-block', 'replace-public-key', 'rewrite-consistently']) {
    const v = app.net.compromise('NODE-04', kind), n = v.nodes.find(x => x.id === 'NODE-04');
    assert.equal(n.divergence, true, kind); assert.ok(['INVALID', 'DIVERGED'].includes(n.sync), kind + ' ' + n.sync); assert.equal(v.diverged.join(), 'NODE-04', kind);
    assert.equal(v.nodes.filter(x => x.sync === 'IN_SYNC').length, 4, kind);
    const inv = app.investigate(u('USR-0002'), { text: B.representation });
    assert.equal(inv.attributionStatus, 'VERIFIED_PROVENANCE_MATCH'); assert.deepEqual(inv.validatorAgreement.diverged, ['NODE-04']); assert.match(inv.statement, /NODE-04 diverge/);
    assert.equal(app.validateLedger().ok, false, 'validate endpoint reports divergence');
    app.resyncValidator(u('USR-0003'), kek('USR-0003'), 'NODE-04'); assert.deepEqual(app.net.view().diverged, [], 'resync repairs ' + kind);
  }
});
test('specific failure reasons for each ledger attack', () => {
  const want = { 'modify-transaction': 'transaction integrity failure', 'modify-block': 'block hash mismatch', 'modify-previous-hash': 'previous-hash link broken', 'delete-block': 'ledger continuity failure', 'replace-public-key': 'transaction integrity failure', 'rewrite-consistently': 'insufficient valid validator approvals' };
  for (const [k, w] of Object.entries(want)) { const n = app.net.compromise('NODE-02', k).nodes.find(x => x.id === 'NODE-02'); assert.ok(n.reason.includes(w), `${k}: ${n.reason}`); app.resyncValidator(u('USR-0003'), kek('USR-0003'), 'NODE-02'); }
});
test('tamper with a majority of validators: the system fails closed (no attribution, no commits)', () => {
  const { B } = globalThis.__B;
  for (const id of ['NODE-01', 'NODE-02', 'NODE-03']) app.net.compromise(id, 'modify-transaction');
  const v = app.net.view(); assert.equal(v.quorum, false);
  const inv = app.investigate(u('USR-0002'), { text: B.representation });
  assert.equal(inv.attributionStatus, 'EVIDENCE_INVALID', 'unverifiable evidence is never presented as attribution'); assert.equal(inv.validatorAgreement.agreed, false); assert.equal(inv.ledgerValid, false); assert.match(inv.statement, /NOT sufficient/);
  const c = counts(); assert.throws(() => dec('REC-0192'), e => e.status === 503); assert.deepEqual(counts(), c);
  for (const id of ['NODE-01', 'NODE-02', 'NODE-03']) assert.throws(() => app.net.resync(id), e => e.status === 503, 'cannot legitimately repair without a verified majority');
});
