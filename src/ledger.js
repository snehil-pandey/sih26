// LOCAL PERMISSIONED DLT SIMULATOR. Simulated permissioned consensus for prototype demonstration — NOT a BFT protocol.
// Each validator keeps its OWN copy of the chain in its OWN SQLite database and independently validates every
// transaction against its OWN ledger state before signing (Ed25519) an approval. A block commits only with
// >= QUORUM valid approvals. All five validators run inside one process under one master key (see KNOWN_LIMITATIONS).
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db.js';
import { sha, canon, J, P, now, ERR } from './util.js';
import { volatileKeystore } from './keystore.js';
import { nodeKeypair, nodeSign, nodeVerify, sigVerify } from './pq.js';

export const QUORUM = 3;
export const NODE_IDS = ['NODE-01', 'NODE-02', 'NODE-03', 'NODE-04', 'NODE-05'];
const ZERO = '0'.repeat(64);
export const blockHash = b => sha(canon({ idx: b.idx, ts: b.ts, prev: b.prev, txs: b.txs, proposer: b.proposer }));

// ---------- ledger state machine (transaction validity rules) ----------
export const newState = () => ({ keys: new Map(), ids: new Map(), sessions: new Set(), wms: new Set(), txids: new Set(), prov: new Map(), auths: new Map(), validators: new Map(), ops: [] });
function actorCheck(st, tx) {
  const p = tx.payload, k = st.keys.get(p.actorKeyId);
  if (!k || k.status !== 'ACTIVE') throw new Error('actor key not active');
  if (k.identityId !== p.actorIdentityId) throw new Error('actor key does not belong to actor identity');
  if (!sigVerify(k.publicKey, canon(p), tx.sig)) throw new Error('actor signature invalid');
}
export function applyTx(st, tx, bi) {
  if (!tx || !tx.id || !tx.type || !tx.payload) throw new Error('malformed transaction');
  if (st.txids.has(tx.id)) throw new Error('duplicate transaction id');
  const p = tx.payload;
  switch (tx.type) {
    case 'VALIDATOR_REGISTRATION':
      if (bi !== 0) throw new Error('validators may only be registered in the genesis block');
      st.validators.set(p.nodeId, p.publicKey); break;
    case 'PUBLIC_KEY_REGISTRATION': {
      if (st.keys.has(p.keyId)) throw new Error('key id already registered');
      if (!sigVerify(p.publicKey, canon(p), tx.proof)) throw new Error('proof of possession invalid');
      const list = st.ids.get(p.identityId) || [];
      if (!['SENDER', 'RECIPIENT', 'INVESTIGATOR', 'ADMIN'].includes(p.role)) throw new Error('invalid identity role');
      if (p.keyVersion !== list.length + 1) throw new Error('unexpected key version');
      if (list.length) {
        const prev = st.keys.get(list[list.length - 1]);
        if (prev.status !== 'ACTIVE') throw new Error('previous key is not active');
        if (prev.role !== p.role) throw new Error('role cannot change on rotation');
        if (prev.subjectId !== p.subjectId) throw new Error('subject cannot change on rotation');
        if (!sigVerify(prev.publicKey, canon(p), tx.endorsement)) throw new Error('rotation endorsement by previous key invalid');
        prev.status = 'ROTATED'; prev.history.push({ status: 'ROTATED', at: p.registeredAt, block: bi });
      }
      st.keys.set(p.keyId, { ...p, status: 'ACTIVE', revokedAt: null, history: [{ status: 'ACTIVE', at: p.registeredAt, block: bi }] });
      list.push(p.keyId); st.ids.set(p.identityId, list); break;
    }
    case 'KEY_STATUS_CHANGE': {
      const k = st.keys.get(p.keyId);
      if (!k) throw new Error('unknown key'); if (p.status !== 'REVOKED') throw new Error('unsupported status change');
      if (k.status === 'REVOKED') throw new Error('key already revoked');
      actorCheck(st, tx);
      if (st.keys.get(p.actorKeyId).role !== 'ADMIN' && p.actorIdentityId !== k.identityId) throw new Error('actor is not authorised to revoke this key');
      k.status = 'REVOKED'; k.revokedAt = p.effectiveAt; k.history.push({ status: 'REVOKED', at: p.effectiveAt, block: bi }); break;
    }
    case 'ADMIN_OPERATION': actorCheck(st, tx); if (st.keys.get(p.actorKeyId).role !== 'ADMIN') throw new Error('administrative operations require an ADMIN identity'); st.ops.push({ ...p, txId: tx.id, block: bi }); break;
    case 'AUTHORIZATION': {
      actorCheck(st, tx); if (st.keys.get(p.actorKeyId).role !== 'SENDER') throw new Error('only a SENDER identity may issue authorizations');
      if (st.auths.has(p.authorizationId)) throw new Error('authorization id already recorded');
      st.auths.set(p.authorizationId, { documentId: p.documentId, documentVersion: p.documentVersion, documentHash: p.documentHash, recipientId: p.recipientId }); break;
    }
    case 'PROVENANCE': {
      const r = p.record; if (!r) throw new Error('missing record');
      const k = st.keys.get(r.keyId);
      if (!k) throw new Error('signing key is not registered on the ledger');
      if (k.identityId !== r.identityId) throw new Error('signing key does not belong to the recipient identity');
      if (k.subjectId !== r.recipientId) throw new Error('signing key is not bound to the named recipient');
      if (k.role !== 'RECIPIENT') throw new Error('only RECIPIENT identities may sign provenance');
      if (k.keyVersion !== r.keyVersion) throw new Error('key version mismatch');
      if (k.status !== 'ACTIVE') throw new Error('signing key is not active (' + k.status + ')');
      if (!sigVerify(k.publicKey, canon(r), tx.sig)) throw new Error('signature invalid');
      const au = st.auths.get(r.authorizationId);
      if (!au) throw new Error('authorization is not recorded on the ledger');
      if (au.documentId !== r.documentId || au.documentVersion !== r.documentVersion || au.documentHash !== r.documentHash || au.recipientId !== r.recipientId) throw new Error('record does not match its ledger authorization');
      if (st.sessions.has(r.sessionId)) throw new Error('replayed decryption session');
      if (st.wms.has(r.watermarkId)) throw new Error('duplicate watermark id');
      st.sessions.add(r.sessionId); st.wms.add(r.watermarkId); st.prov.set(r.watermarkId, { txId: tx.id, block: bi }); break;
    }
    default: throw new Error('unknown transaction type ' + tx.type);
  }
  st.txids.add(tx.id);
}

// ---------- chain verification (pure function over a block list) ----------
export function verifyChain(blocks) {
  const st = newState(); let prev = ZERO;
  const fail = (idx, why) => ({ ok: false, height: blocks.length - 1, head: null, error: { block: idx, why }, state: null });
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.idx !== i) return fail(i, `ledger continuity failure: expected block #${i}, found #${b.idx}`);
    if (b.prev !== prev) return fail(i, 'previous-hash link broken');
    try { for (const tx of b.txs) applyTx(st, tx, i); } catch (e) { return fail(i, 'transaction integrity failure: ' + e.message); }
    if (blockHash(b) !== b.hash) return fail(i, 'block hash mismatch');
    const good = new Set();
    for (const a of b.approvals || []) { const pub = st.validators.get(a.node); if (pub && nodeVerify(pub, b.hash, a.sig)) good.add(a.node); }
    if (good.size < QUORUM) return fail(i, `insufficient valid validator approvals (${good.size}/${QUORUM})`);
    prev = b.hash;
  }
  return { ok: true, height: blocks.length - 1, head: prev, error: null, state: st };
}

// ---------- validator ----------
class Validator {
  constructor(id, file, keystore) {
    this.id = id; this.status = 'ONLINE'; this.db = openDb(file);
    this.db.exec('create table if not exists blocks(idx integer primary key, hash text, body text); create table if not exists meta(k text primary key, v text)');
    const m = this.db.get("select v from meta where k='key'");
    if (m) { const o = P(m.v); this.pub = o.pub; this.priv = keystore.open(o.sealed, 'validator:' + id); }
    else { const kp = nodeKeypair(); this.pub = kp.pub; this.priv = kp.priv; this.db.run("insert into meta values('key',?)", J({ pub: kp.pub, sealed: keystore.seal(kp.priv, 'validator:' + id) })); }
  }
  blocks() { return this.db.all('select body from blocks order by idx').map(r => P(r.body)); }
  append(b) { this.db.run('insert into blocks values(?,?,?)', b.idx, b.hash, J(b)); }
  wipe() { this.db.run('delete from blocks'); }
  close() { try { this.db.close(); } catch {} }
  verify() { return verifyChain(this.blocks()); }
}

export class Network {
  constructor(dir, keystore, { fresh = false } = {}) {
    this.dir = dir; this.ks = keystore; this.nodes = [];
    if (dir) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    for (const id of NODE_IDS) {
      const f = dir ? path.join(dir, id + '.db') : ':memory:';
      if (dir && fresh) for (const s of ['', '-wal', '-shm']) fs.rmSync(f + s, { force: true });
      this.nodes.push(new Validator(id, f, keystore));
    }
    if (!this.nodes[0].blocks().length) this.#genesis();
  }
  close() { for (const n of this.nodes) n.close(); }
  node(id) { const n = this.nodes.find(x => x.id === id); if (!n) throw ERR(404, 'Unknown validator'); return n; }
  #genesis() {
    const txs = this.nodes.map(n => ({ id: 'TX-GENESIS-' + n.id, type: 'VALIDATOR_REGISTRATION', payload: { nodeId: n.id, publicKey: n.pub, algorithm: 'Ed25519' } }));
    const b = { idx: 0, ts: now(), prev: ZERO, txs, proposer: 'NODE-01' }; b.hash = blockHash(b);
    b.approvals = this.nodes.map(n => ({ node: n.id, sig: nodeSign(n.priv, b.hash) }));
    for (const n of this.nodes) n.append(b);
  }
  // Compare every validator's independently verified chain and derive a consensus view.
  view() {
    const res = this.nodes.map(n => ({ n, v: n.verify() }));
    const groups = new Map();
    for (const { n, v } of res) if (v.ok && n.status === 'ONLINE') { const k = v.height + ':' + v.head; (groups.get(k) || groups.set(k, []).get(k)).push({ n, v }); }
    let best = null;
    for (const g of groups.values()) if (!best || g.length > best.length || (g.length === best.length && g[0].v.height > best[0].v.height)) best = g;
    const canonical = best ? best[0].n.blocks() : null, state = best ? best[0].v.state : null;
    const height = best ? best[0].v.height : -1, head = best ? best[0].v.head : null;
    const nodes = res.map(({ n, v }) => {
      let sync, why = null;
      if (n.status === 'OFFLINE') sync = 'OFFLINE';
      else if (!v.ok) { sync = 'INVALID'; why = `block #${v.error.block}: ${v.error.why}`; }
      else if (!best) sync = 'UNKNOWN';
      else if (v.head === head) sync = 'IN_SYNC';
      else if (v.height < height && v.head === canonical[v.height].hash) sync = 'BEHIND';
      else { sync = 'DIVERGED'; why = 'valid chain but different from the majority'; }
      return { id: n.id, status: n.status, ledgerHeight: v.ok ? v.height : (v.height ?? -1), latestBlockHash: v.ok ? v.head : null, validation: v.ok ? 'VALID' : 'INVALID', sync, divergence: sync === 'INVALID' || sync === 'DIVERGED', reason: why, publicKey: n.pub };
    });
    const inSync = nodes.filter(x => x.sync === 'IN_SYNC').length;
    return { canonical, state, height, head, nodes, inSync, total: this.nodes.length, quorum: inSync >= QUORUM, diverged: nodes.filter(x => x.divergence).map(x => x.id) };
  }
  submit(txs) {
    const view = this.view();
    if (!view.quorum) throw ERR(503, `Consensus not reached: only ${view.inSync} validators are online and in sync (quorum ${QUORUM}). Nothing committed.`);
    const b = { idx: view.height + 1, ts: now(), prev: view.head, txs, proposer: view.nodes.find(x => x.sync === 'IN_SYNC').id }; b.hash = blockHash(b);
    const approvals = [], approvers = []; let lastErr = null;
    for (const nv of view.nodes.filter(x => x.sync === 'IN_SYNC')) {
      const n = this.node(nv.id), v = n.verify();
      try { if (!v.ok || v.head !== b.prev) throw new Error('local chain check failed'); for (const tx of txs) applyTx(v.state, tx, b.idx); approvals.push({ node: n.id, sig: nodeSign(n.priv, b.hash) }); approvers.push(n); }
      catch (e) { lastErr = e; }
    }
    if (approvals.length < QUORUM) throw ERR(422, `Transaction rejected by validators (${approvals.length}/${QUORUM} approvals): ${lastErr?.message || 'invalid'}`);
    b.approvals = approvals; for (const n of approvers) n.append(b);
    return { block: b.idx, hash: b.hash, approvals: approvals.length, txIds: txs.map(t => t.id) };
  }
  setStatus(id, status) { const n = this.node(id); n.status = status; if (status === 'ONLINE') this.catchUp(id); return this.view(); }
  catchUp(id) { // legitimate sync of a valid-but-behind validator from the verified majority chain
    const n = this.node(id), v = this.view(), mine = v.nodes.find(x => x.id === id);
    if (mine.sync !== 'BEHIND' || !v.canonical) return false;
    const have = n.blocks().length; for (const b of v.canonical.slice(have)) n.append(b); return true;
  }
  resync(id) { // legitimate administrative repair: replace one validator's storage with the verified majority chain
    const v = this.view(); if (!v.quorum) throw ERR(503, 'Cannot resync: no verified majority');
    const n = this.node(id); n.wipe(); for (const b of v.canonical) n.append(b); n.status = 'ONLINE'; return this.view();
  }
  // ATTACK SIMULATION on one validator's storage (demo/testing only). Never touches other validators.
  compromise(id, kind, arg = {}) {
    const n = this.node(id), bl = n.blocks(); if (bl.length < 3) throw ERR(400, 'Ledger too short');
    const idx = arg.idx ?? bl.findIndex(b => b.txs.some(t => t.type === 'PROVENANCE'));
    const target = bl[idx] || bl[bl.length - 1], save = b => n.db.run('update blocks set body=?, hash=? where idx=?', J(b), b.hash, b.idx);
    switch (kind) {
      case 'modify-transaction': { const t = target.txs.find(t => t.type === 'PROVENANCE'); if (!t) throw ERR(400, 'No provenance tx in that block'); t.payload.record.recipientId = 'REC-0217'; save(target); break; }
      case 'modify-block': target.ts = '2000-01-01T00:00:00.000Z'; save(target); break;
      case 'modify-previous-hash': target.prev = 'f'.repeat(64); save(target); break;
      case 'delete-block': n.db.run('delete from blocks where idx=?', target.idx); break;
      case 'replace-public-key': { const t = bl.flatMap(b => b.txs.map(x => [b, x])).find(([, x]) => x.type === 'PUBLIC_KEY_REGISTRATION'); t[1].payload.publicKey = 'AAAA' + t[1].payload.publicKey.slice(4); save(t[0]); break; }
      case 'rewrite-consistently': { // attacker also recomputes every hash on THIS node; cannot forge other validators' approvals
        let prev = bl[target.idx - 1]?.hash ?? ZERO;
        for (let i = target.idx; i < bl.length; i++) { const b = bl[i]; if (i === target.idx) b.ts = '2000-01-01T00:00:00.000Z'; b.prev = prev; b.hash = blockHash(b); prev = b.hash; save(b); }
        break;
      }
      default: throw ERR(400, 'Unknown attack kind');
    }
    return this.view();
  }
  // Read-only in-memory copy for the Security Lab (never shares storage with real validators).
  clone() {
    const c = new Network(null, volatileKeystore); c.nodes.forEach(n => n.wipe());
    const v = this.view(); for (const n of c.nodes) for (const b of v.canonical) n.append(b);
    return c;
  }
  findProvenance(wm) {
    const v = this.view(); if (!v.canonical) return { view: v, found: null };
    for (const b of v.canonical) for (const tx of b.txs) if (tx.type === 'PROVENANCE' && tx.payload.record.watermarkId === wm) return { view: v, found: { tx, block: b } };
    return { view: v, found: null };
  }
  findTx(id) { const v = this.view(); if (!v.canonical) return null; for (const b of v.canonical) for (const tx of b.txs) if (tx.id === id) return { tx, block: b, view: v }; return null; }
}
