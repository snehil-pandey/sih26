// Provenance engine: builds signed ledger transactions and derives verification results from ledger state.
import { sha, canon, rid, now } from './util.js';
import { sigKeypair, sigSign, sigVerify, SIG_ALG, nodeVerify } from './pq.js';
import { blockHash, QUORUM } from './ledger.js';

export const identityIdFor = uid => 'CID-' + uid.slice(-4);
export const keyIdFor = (identityId, ver) => `KEY-${identityId.slice(4)}-V${ver}`;

export function keyRegistration(identityId, ver, prev, role = 'RECIPIENT', subjectId = identityId, crypto = null) {
  const kp = crypto ? crypto.generateSigningKeyPair() : sigKeypair();
  const alg = crypto ? crypto.algorithmInfo().signatureAlgorithm : SIG_ALG;
  const payload = { identityId, keyId: keyIdFor(identityId, ver), keyVersion: ver, algorithm: alg, publicKey: kp.pub, role, subjectId, status: 'ACTIVE', registeredAt: now() };
  const signFn = (priv, data) => crypto ? crypto.sign(priv, data) : sigSign(priv, data);
  const tx = { id: rid('TX'), type: 'PUBLIC_KEY_REGISTRATION', payload, proof: signFn(kp.priv, canon(payload)) };
  if (prev) tx.endorsement = signFn(prev.priv, canon(payload));
  return { kp, tx, keyId: payload.keyId };
}
export function authorizationTx(actor, a, crypto = null) {
  const payload = { ...a, ts: now(), actorIdentityId: actor.identityId, actorKeyId: actor.keyId };
  const sig = crypto ? crypto.sign(actor.priv, canon(payload)) : sigSign(actor.priv, canon(payload));
  return { id: rid('TX'), type: 'AUTHORIZATION', payload, sig };
}
export function authorizationRevocationTx(actor, a, crypto = null) {
  const payload = { ...a, status: 'REVOKED', revokedAt: now(), actorIdentityId: actor.identityId, actorKeyId: actor.keyId };
  const sig = crypto ? crypto.sign(actor.priv, canon(payload)) : sigSign(actor.priv, canon(payload));
  return { id: rid('TX'), type: 'AUTHORIZATION_REVOCATION', payload, sig };
}
export const provenanceTx = (record, priv, crypto = null) => ({
  id: rid('TX'),
  type: 'PROVENANCE',
  payload: { record },
  sig: crypto ? crypto.sign(priv, canon(record)) : sigSign(priv, canon(record))
});
export function statusChangeTx(actor, keyId, reason) {
  const payload = { keyId, status: 'REVOKED', effectiveAt: now(), actorIdentityId: actor.identityId, actorKeyId: actor.keyId, reason };
  return { id: rid('TX'), type: 'KEY_STATUS_CHANGE', payload, sig: sigSign(actor.priv, canon(payload)) };
}
export function adminOpTx(actor, operation, target, detail = '') {
  const payload = { operation, target, detail, ts: now(), actorIdentityId: actor.identityId, actorKeyId: actor.keyId };
  return { id: rid('TX'), type: 'ADMIN_OPERATION', payload, sig: sigSign(actor.priv, canon(payload)) };
}
export const approvalCount = (block, state) => (block.approvals || []).filter(a => { const p = state.validators.get(a.node); return p && nodeVerify(p, block.hash, a.sig); }).length;

// Everything below is COMPUTED from the ledger view; nothing is a stored verdict.
export function evidenceFor(tx, block, view, presented) {
  const rec = presented || tx.payload.record, key = view.state.keys.get(rec.keyId);
  const signatureValid = !!key && key.identityId === rec.identityId && key.subjectId === rec.recipientId && key.keyVersion === rec.keyVersion && sigVerify(key.publicKey, canon(rec), tx.sig);
  const approvals = approvalCount(block, view.state);
  const blockValid = blockHash(block) === block.hash && approvals >= QUORUM;
  const inChain = view.canonical?.[block.idx]?.hash === block.hash;
  return {
    signatureValid, transactionValid: signatureValid && inChain, blockValid, chainValid: !!view.canonical && inChain,
    validatorAgreement: { agreed: view.quorum, inSync: view.inSync, total: view.total, quorum: QUORUM, diverged: view.diverged },
    key: key ? { keyId: key.keyId, identityId: key.identityId, keyVersion: key.keyVersion, algorithm: key.algorithm, status: key.status, revokedAt: key.revokedAt, history: key.history } : null,
    approvals,
  };
}
