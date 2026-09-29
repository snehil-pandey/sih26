import c from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from './db.js';
import { sha, canon, rid, now, ERR, J, P } from './util.js';
import { sigKeypair, sigSign, kemKeypair, kemEncap, kemDecap, aeadEnc, aeadDec, SIG_ALG, KEM_ALG } from './pq.js';
import { createKeystore, deriveKek, volatileKeystore } from './keystore.js';
import { Network, QUORUM, NODE_IDS, verifyChain } from './ledger.js';
import { generateWatermarkId, embedWatermark, extractWatermark, WM_RE } from './watermark.js';
import { identityIdFor, keyRegistration, provenanceTx, statusChangeTx, adminOpTx, authorizationTx, evidenceFor, keyIdFor } from './provenance.js';

const ROLES = ['SENDER', 'RECIPIENT', 'INVESTIGATOR', 'ADMIN'];
const CLASSES = ['RESTRICTED', 'CONFIDENTIAL', 'SECRET'];
const ID_RE = { doc: /^DOC-\d{4}$/, ses: /^SES-[0-9A-F]{8}$/, tx: /^TX-[0-9A-F]{8}$/, leak: /^LEAK-[0-9A-F]{8}$/, node: /^NODE-0[1-5]$/, user: /^(REC|USR)-\d{4}$/ };
const need = (ok, msg) => { if (!ok) throw ERR(400, msg); };
const allow = (u, ...roles) => { if (!u || !roles.includes(u.role)) throw ERR(403, `Role ${u?.role} is not permitted to perform this action`); };

export function createApp({ dataDir = null, demoMode = true, demoPassword = process.env.SIH_DEMO_PASSWORD || 'demo1234', sessionMinutes = 480 } = {}) {
  const mem = !dataDir;
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = openDb(mem ? ':memory:' : path.join(dataDir, 'app.db'));
  const ksDir = mem ? fs.mkdtempSync(path.join(os.tmpdir(), 'sih-ks-')) : path.join(dataDir, 'keystore');
  const ks = createKeystore(ksDir, mem ? c.randomBytes(16).toString('hex') : undefined);
  let net = null;
  const sessions = new Map(), fails = new Map(); // in-memory login sessions (hold each user's unlocked KEK) and throttling
  const op = (actor, type, detail = '') => db.run('insert into oplog(ts,actor,type,detail) values(?,?,?,?)', now(), actor, type, String(detail).slice(0, 400));

  function schema() {
    for (const t of ['users', 'keys', 'kem', 'documents', 'auth', 'sessions', 'leaks', 'inv', 'oplog']) db.exec('drop table if exists ' + t);
    db.exec(`create table users(id text primary key,name,username text unique,role,status,pw_hash,pw_salt,kek_salt,created);
    create table keys(id text primary key,user_id,identity_id,ver integer,alg,pub,sealed,status,created,revoked_at);
    create table kem(user_id text primary key,alg,pub,sealed);
    create table documents(id text primary key,name,cls,version,owner,hash,enc,created);
    create table auth(id text primary key,doc_id,user_id,kem_ct,wrapped,created,unique(doc_id,user_id));
    create table sessions(id text primary key,doc_id,doc_ver,user_id,auth_id,wm text unique,ts,status,repr_sealed,tx_id,block_idx integer);
    create table leaks(id text primary key,session_id,content,ts);
    create table inv(id text primary key,ts,by,result);
    create table oplog(id integer primary key autoincrement,ts,actor,type,detail);`);
  }
  const user = id => db.get('select * from users where id=?', id);
  const nameOf = id => user(id)?.name || id;

  // ---------------- identities & users ----------------
  function makeUser({ id, name, username, role, password }) {
    need(ROLES.includes(role), 'bad role'); need(ID_RE.user.test(id), 'bad id'); need(typeof password === 'string' && password.length >= 8, 'password too short');
    const pwSalt = c.randomBytes(16).toString('hex'), kekSalt = c.randomBytes(16).toString('hex'), kek = deriveKek(password, kekSalt);
    const identityId = identityIdFor(id), reg = keyRegistration(identityId, 1, undefined, role, id), kem = kemKeypair();
    db.run('insert into users values(?,?,?,?,?,?,?,?,?)', id, name, username, role, 'ACTIVE', c.scryptSync(password, Buffer.from(pwSalt, 'hex'), 32).toString('hex'), pwSalt, kekSalt, now());
    db.run('insert into keys values(?,?,?,?,?,?,?,?,?,?)', reg.keyId, id, identityId, 1, SIG_ALG, reg.kp.pub, J(aeadEnc(kek, reg.kp.priv, 'key:' + reg.keyId)), 'ACTIVE', now(), null);
    db.run('insert into kem values(?,?,?,?)', id, KEM_ALG, kem.pub, J(aeadEnc(kek, kem.priv, 'kem:' + id)));
    op('SYSTEM', 'USER_CREATED', id + ' ' + role);
    return reg.tx;
  }
  const activeKey = uid => { const k = db.get("select * from keys where user_id=? and status='ACTIVE' order by ver desc", uid); if (!k) throw ERR(403, 'Signing identity revoked or inactive'); return k; };
  function unlockKey(k, kek) { try { return aeadDec(kek, P(k.sealed), 'key:' + k.id); } catch { throw ERR(403, 'Private key cannot be unlocked by this caller'); } }
  const actorOf = (u, kek) => { const k = activeKey(u.id); return { identityId: k.identity_id, keyId: k.id, priv: unlockKey(k, kek) }; };

  function seed() {
    schema(); net = new Network(dataDir ? path.join(dataDir, 'validators') : null, ks, { fresh: true }); sessions.clear(); fails.clear();
    const U = [['USR-0001', 'Commander Arjun', 'sender', 'SENDER'], ['REC-0192', 'Aarav Sharma', 'aarav', 'RECIPIENT'], ['REC-0217', 'Riya Mehta', 'riya', 'RECIPIENT'], ['REC-0281', 'Kabir Rao', 'kabir', 'RECIPIENT'], ['REC-0319', 'Nisha Nair', 'nisha', 'RECIPIENT'], ['USR-0002', 'Forensic Officer', 'forensic', 'INVESTIGATOR'], ['USR-0003', 'System Administrator', 'admin', 'ADMIN']];
    net.submit(U.map(([id, name, username, role]) => makeUser({ id, name, username, role, password: demoPassword })));
    const kekOf = id => deriveKek(demoPassword, user(id).kek_salt), sender = user('USR-0001');
    createDocument(sender, kekOf('USR-0001'), { name: 'Operation Falcon', cls: 'RESTRICTED', content: 'OPERATION FALCON — v1.0\nOperational brief (demo content).\n1. Objective: secure the northern logistics corridor by Q4.\n2. Movement window: 14–18 October from three forward depots.\n3. Rotate channel keys every 48 hours.\nEnd of document.', recipients: ['REC-0192', 'REC-0217', 'REC-0281'] });
    createDocument(sender, kekOf('USR-0001'), { name: 'Project Trident', cls: 'CONFIDENTIAL', content: 'PROJECT TRIDENT — v1.0\nDemo content: maritime patrol schedule.\nEnd of document.', recipients: ['REC-0192', 'REC-0319'] });
    createDocument(sender, kekOf('USR-0001'), { name: 'Strategic Logistics Brief', cls: 'RESTRICTED', content: 'STRATEGIC LOGISTICS BRIEF — v1.0\nDemo content: fuel and supply forecast.\nEnd of document.', recipients: ['REC-0217', 'REC-0281'] });
    for (const r of ['REC-0192', 'REC-0192', 'REC-0217', 'REC-0281']) decrypt(user(r), kekOf(r), 'DOC-0001');
    op('SYSTEM', 'DEMO_RESET', 'environment seeded');
  }

  // ---------------- authentication ----------------
  function login(username, password) {
    need(typeof username === 'string' && typeof password === 'string' && username.length < 64 && password.length < 256, 'Invalid credentials');
    const recent = (fails.get(username) || []).filter(t => Date.now() - t < 600000);
    if (recent.length >= 5) throw ERR(429, 'Too many failed attempts. Try again later.');
    const u = db.get('select * from users where username=?', username);
    const ok = u && u.status === 'ACTIVE' && c.timingSafeEqual(c.scryptSync(password, Buffer.from(u.pw_salt, 'hex'), 32), Buffer.from(u.pw_hash, 'hex'));
    if (!ok) { fails.set(username, [...recent, Date.now()]); op(username, 'LOGIN_FAILED'); throw ERR(401, 'Invalid credentials'); }
    fails.delete(username);
    const token = c.randomBytes(32).toString('hex');
    sessions.set(sha(token), { userId: u.id, kek: deriveKek(password, u.kek_salt), exp: Date.now() + sessionMinutes * 60000 });
    op(u.id, 'LOGIN'); return { token, user: { id: u.id, name: u.name, role: u.role } };
  }
  function authenticate(token) {
    if (typeof token !== 'string') return null;
    const h = sha(token), s = sessions.get(h); if (!s) return null;
    if (s.exp < Date.now()) { sessions.delete(h); return null; }
    const u = user(s.userId); return u && u.status === 'ACTIVE' ? { user: u, kek: s.kek } : null;
  }
  const logout = token => { sessions.delete(sha(String(token))); };

  // ---------------- documents & decryption ----------------
  function createDocument(owner, kek, { name, cls = 'RESTRICTED', content, recipients = [] }) {
    allow(owner, 'SENDER');
    need(typeof name === 'string' && name.trim() && name.length <= 120, 'Name required (max 120 chars)');
    need(CLASSES.includes(cls), 'Invalid classification'); need(typeof content === 'string' && content.length > 0 && content.length <= 200000, 'Content required (max 200000 chars)');
    need(Array.isArray(recipients) && recipients.length <= 50, 'Invalid recipients');
    const rs = [...new Set(recipients)]; for (const r of rs) need(user(r)?.role === 'RECIPIENT', 'Unknown recipient ' + String(r).slice(0, 20));
    const n = db.get('select count(*) n from documents').n + 1, id = 'DOC-' + String(n).padStart(4, '0'), ver = '1.0', cek = c.randomBytes(32);
    const actor = actorOf(owner, kek), hash = sha(content), atx = [];
    try {
      db.tx(() => {
        db.run('insert into documents values(?,?,?,?,?,?,?,?)', id, name.trim(), cls, ver, owner.id, hash, J(aeadEnc(cek, Buffer.from(content), `doc:${id}:${ver}`)), now());
        for (const r of rs) {
          const { ct, key } = kemEncap(db.get('select pub from kem where user_id=?', r).pub), aid = rid('AUT');
          db.run('insert into auth values(?,?,?,?,?,?)', aid, id, r, ct, J(aeadEnc(key, cek, `wrap:${id}:${r}`)), now());
          atx.push(authorizationTx(actor, { authorizationId: aid, documentId: id, documentVersion: ver, documentHash: hash, recipientId: r }));
        }
        if (atx.length) net.submit(atx); // authorizations are anchored on the ledger, signed by the sender
      });
    } finally { actor.priv.fill(0); cek.fill(0); } op(owner.id, 'DOCUMENT_ENCRYPTED', `${id} AES-256-GCM, ${rs.length} recipients`); return { id };
  }
  function listDocuments(u) {
    let rows = db.all('select * from documents order by id');
    if (u.role === 'RECIPIENT') rows = rows.filter(d => db.get('select 1 x from auth where doc_id=? and user_id=?', d.id, u.id));
    if (u.role === 'SENDER') rows = rows.filter(d => d.owner === u.id);
    return {
      recipients: u.role === 'SENDER' ? db.all("select id,name from users where role='RECIPIENT'") : [],
      docs: rows.map(d => ({ id: d.id, name: d.name, cls: d.cls, version: d.version, hash: d.hash, created: d.created, enc: 'AES-256-GCM', decryptions: db.get('select count(*) n from sessions where doc_id=?', d.id).n,
        authorized: u.role === 'RECIPIENT' ? [] : db.all('select user_id id from auth where doc_id=?', d.id).map(a => ({ id: a.id, name: nameOf(a.id) })) }))
    };
  }
  function decrypt(u, kek, docId) {
    allow(u, 'RECIPIENT');
    need(typeof docId === 'string' && ID_RE.doc.test(docId), 'Invalid document id');
    const d = db.get('select * from documents where id=?', docId), a = d && db.get('select * from auth where doc_id=? and user_id=?', docId, u.id);
    if (!a) { op(u.id, 'DECRYPTION_DENIED', docId); throw ERR(403, 'ACCESS DENIED: this identity is not authorized to decrypt this document. No session, watermark, signature or ledger transaction was created.'); }
    const key = activeKey(u.id); op(u.id, 'DECRYPTION_STARTED', docId);
    let kp = null, cek = null;
    try {
      const kemRow = db.get('select * from kem where user_id=?', u.id);
      try { kp = aeadDec(kek, P(kemRow.sealed), 'kem:' + u.id); } catch { throw ERR(403, 'Private key cannot be unlocked by this caller'); }
      cek = aeadDec(kemDecap(kp, a.kem_ct), P(a.wrapped), `wrap:${docId}:${u.id}`);
      const text = aeadDec(cek, P(d.enc), `doc:${d.id}:${d.version}`).toString();
      const sessionId = rid('SES'), wm = generateWatermarkId(), rep = embedWatermark(text, wm);
      const record = { documentId: d.id, documentVersion: d.version, documentHash: d.hash, recipientId: u.id, identityId: key.identity_id, sessionId, watermarkId: wm, keyId: key.id, keyVersion: key.ver, authorizationId: a.id, timestamp: now(), signatureAlgorithm: SIG_ALG };
      const priv = unlockKey(key, kek); let tx; try { tx = provenanceTx(record, priv); } finally { priv.fill(0); }
      const res = db.tx(() => {
        const r = net.submit([tx]); // throws (and rolls back the session row) if validators reject or quorum is missing
        db.run('insert into sessions values(?,?,?,?,?,?,?,?,?,?,?)', sessionId, d.id, d.version, u.id, a.id, wm, record.timestamp, 'COMPLETED', J(ks.seal(Buffer.from(rep), 'repr:' + sessionId)), tx.id, r.block);
        return r;
      });
      for (const t of ['DECRYPTION_COMPLETED', 'WATERMARK_GENERATED', 'SIGNATURE_CREATED', 'LEDGER_COMMIT']) op(u.id, t, `${sessionId} ${wm} ${tx.id}`);
      const ev = txEvidence(tx.id);
      return { sessionId, watermarkId: wm, transactionId: tx.id, block: res.block, approvals: res.approvals, keyId: key.id, evidence: ev, representation: rep };
    } finally { kp?.fill(0); cek?.fill(0); }
  }
  const reprOf = s => ks.open(P(s.repr_sealed), 'repr:' + s.id).toString();
  function listSessions(u) {
    let rows = db.all('select * from sessions order by rowid');
    if (u.role === 'RECIPIENT') rows = rows.filter(s => s.user_id === u.id);
    if (u.role === 'SENDER') rows = rows.filter(s => db.get('select owner from documents where id=?', s.doc_id)?.owner === u.id);
    return rows.map(s => ({ id: s.id, doc_id: s.doc_id, user_id: s.user_id, name: nameOf(s.user_id), wm: s.wm, ts: s.ts, status: s.status, auth_id: s.auth_id, txid: s.tx_id, block: s.block_idx }));
  }

  // ---------------- leaks & investigation ----------------
  function createLeak(u, sessionId) {
    allow(u, 'SENDER', 'RECIPIENT', 'ADMIN');
    need(typeof sessionId === 'string' && ID_RE.ses.test(sessionId), 'Invalid session id');
    const s = db.get('select * from sessions where id=?', sessionId);
    const owns = s && (u.role === 'ADMIN' || (u.role === 'RECIPIENT' && s.user_id === u.id) || (u.role === 'SENDER' && db.get('select owner from documents where id=?', s.doc_id)?.owner === u.id));
    if (!owns) throw ERR(403, 'Session not available to this account');
    const id = rid('LEAK'); db.run('insert into leaks values(?,?,?,?)', id, s.id, reprOf(s), now()); op(u.id, 'LEAK_SIMULATED', id); return { id };
  }
  const listLeaks = () => db.all('select id,ts,length(content) bytes from leaks order by rowid');
  function investigate(u, { leakId, text, label }) {
    allow(u, 'INVESTIGATOR', 'ADMIN');
    let art = text, lab = typeof label === 'string' ? label.slice(0, 80) : 'uploaded artefact';
    if (leakId !== undefined) { need(ID_RE.leak.test(String(leakId)), 'Invalid artefact id'); const l = db.get('select * from leaks where id=?', leakId); if (!l) throw ERR(404, 'Artefact not found'); art = l.content; lab = l.id; }
    need(typeof art === 'string' && art.length > 0 && art.length <= 500000, 'Artefact must be text (max 500000 chars)');
    const id = 'INV-' + String(db.get('select count(*) n from inv').n + 1).padStart(4, '0'), steps = [], step = (name, ok, detail = '') => steps.push({ name, ok, detail });
    op(u.id, 'INVESTIGATION_STARTED', id);
    const r = { id, label: lab, ts: now(), steps, watermarkRecovered: false, watermarkId: null, provenanceFound: false, transactionId: null, blockId: null, recipientId: null, recipientName: null, sessionId: null, documentId: null, keyId: null, keyVersion: null,
      signatureValid: false, transactionValid: false, blockValid: false, chainValid: false, validatorAgreement: null, ledgerValid: false, attributionStatus: 'NO_ATTRIBUTION', reason: null, statement: null, evidence: null };
    const save = () => { db.run('insert into inv values(?,?,?,?)', id, r.ts, u.id, J(r)); return r; };
    step('Read artefact', true, art.length + ' characters');
    const ex = extractWatermark(art); step('Extract watermark', !!ex.id, ex.id ? `${ex.copies} copies recovered` : ex.reason);
    if (!ex.id) { r.reason = ex.reason; r.statement = 'No forensic watermark could be recovered from this artefact, so no attribution is possible. This is not evidence about any recipient.'; return save(); }
    r.watermarkRecovered = true; r.watermarkId = ex.id; op('SYSTEM', 'WATERMARK_EXTRACTED', ex.id); step('Validate watermark structure', WM_RE.test(ex.id), 'format and checksum');
    const { view, found } = net.findProvenance(ex.id);
    step('Search ledger', !!found, found ? 'provenance transaction located' : (view.canonical ? 'no transaction carries this watermark' : 'no verified ledger majority'));
    if (!found) { r.reason = view.canonical ? 'watermark not present in ledger' : 'ledger unavailable'; r.statement = 'A watermark identifier was recovered but the ledger holds no provenance record for it. No attribution is made.'; return save(); }
    const rec = found.tx.payload.record, ev = evidenceFor(found.tx, found.block, view);
    Object.assign(r, { provenanceFound: true, transactionId: found.tx.id, blockId: found.block.idx, recipientId: rec.recipientId, recipientName: nameOf(rec.recipientId), sessionId: rec.sessionId, documentId: rec.documentId, keyId: rec.keyId, keyVersion: rec.keyVersion,
      signatureValid: ev.signatureValid, transactionValid: ev.transactionValid, blockValid: ev.blockValid, chainValid: ev.chainValid, validatorAgreement: ev.validatorAgreement, evidence: { record: rec, key: ev.key, block: { idx: found.block.idx, hash: found.block.hash, prev: found.block.prev, approvals: found.block.approvals.map(a => a.node) }, signature: found.tx.sig.slice(0, 40) + '…' } });
    step('Resolve historical public key', !!ev.key, ev.key ? `${ev.key.keyId} (${ev.key.status})` : 'key not registered on ledger');
    step('Verify signature', ev.signatureValid); step('Verify transaction', ev.transactionValid); step('Verify block', ev.blockValid, `${ev.approvals} valid validator approvals`);
    step('Verify chain', ev.chainValid); step('Verify validator agreement', ev.validatorAgreement.agreed, `${ev.validatorAgreement.inSync}/${ev.validatorAgreement.total} in sync` + (ev.validatorAgreement.diverged.length ? `; diverged: ${ev.validatorAgreement.diverged.join(', ')}` : ''));
    r.ledgerValid = ev.blockValid && ev.chainValid && ev.validatorAgreement.agreed;
    const ok = ev.signatureValid && ev.transactionValid && r.ledgerValid;
    r.attributionStatus = ok ? 'VERIFIED_PROVENANCE_MATCH' : 'EVIDENCE_INVALID';
    r.statement = ok ? `The leaked representation contains a forensic watermark associated with ${r.recipientName} (${r.recipientId}) decryption session ${r.sessionId}, and the corresponding signed provenance record and ledger evidence were successfully verified. This identifies a decryption event; it does not by itself prove who physically disclosed the document.${ev.validatorAgreement.diverged.length ? ' Warning: validator(s) ' + ev.validatorAgreement.diverged.join(', ') + ' diverge from the verified majority.' : ''}`
      : 'A watermark was recovered and matched a ledger record, but one or more verification checks failed. The evidence is NOT sufficient for attribution.';
    op(u.id, ok ? 'PROVENANCE_VERIFIED' : 'TAMPER_DETECTED', id); return save();
  }
  const listInvestigations = () => db.all('select result from inv order by rowid desc').map(x => P(x.result));

  // ---------------- ledger views ----------------
  function txEvidence(txId, overrides) {
    const f = net.findTx(txId); if (!f || f.tx.type !== 'PROVENANCE') throw ERR(404, 'Provenance transaction not found on the verified ledger');
    const presented = overrides ? { ...f.tx.payload.record, ...overrides } : undefined;
    const ev = evidenceFor(f.tx, f.block, f.view, presented);
    return { ...ev, changed: presented ? Object.keys(overrides).filter(k => presented[k] !== f.tx.payload.record[k]) : [] };
  }
  function ledgerBlocks() {
    const v = net.view(); if (!v.canonical) throw ERR(503, 'No verified ledger majority');
    return { quorum: v.quorum, blocks: [...v.canonical].reverse().map(b => ({ idx: b.idx, ts: b.ts, prev: b.prev, hash: b.hash, proposer: b.proposer, approvals: b.approvals.map(a => a.node),
      txs: b.txs.map(t => ({ id: t.id, type: t.type, payload: t.type === 'PROVENANCE' ? t.payload.record : t.payload, sig: (t.sig || t.proof || '').slice(0, 24) })) })) };
  }
  function ledgerKeys() {
    const v = net.view(); if (!v.state) throw ERR(503, 'No verified ledger majority');
    return [...v.state.keys.values()].map(k => ({ keyId: k.keyId, identityId: k.identityId, keyVersion: k.keyVersion, algorithm: k.algorithm, status: k.status, registeredAt: k.registeredAt, revokedAt: k.revokedAt, publicKey: k.publicKey.slice(0, 32) + '…' }));
  }
  const validators = () => { const v = net.view(); return { consensus: 'Simulated permissioned consensus for prototype demonstration', quorum: QUORUM, agreed: v.quorum, height: v.height, nodes: v.nodes }; };
  function validateLedger() { const v = net.view(); return { ok: v.quorum && !v.diverged.length, agreed: v.quorum, height: v.height, head: v.head, inSync: v.inSync, total: v.total, nodes: v.nodes.map(n => ({ id: n.id, sync: n.sync, reason: n.reason })) }; }

  // ---------------- key lifecycle ----------------
  function rotateKey(u, kek) {
    const old = activeKey(u.id), priv = unlockKey(old, kek), reg = keyRegistration(old.identity_id, old.ver + 1, { priv }, u.role, u.id);
    priv.fill(0);
    db.tx(() => {
      net.submit([reg.tx]);
      db.run("update keys set status='ROTATED' where id=?", old.id);
      db.run('insert into keys values(?,?,?,?,?,?,?,?,?,?)', reg.keyId, u.id, old.identity_id, old.ver + 1, SIG_ALG, reg.kp.pub, J(aeadEnc(kek, reg.kp.priv, 'key:' + reg.keyId)), 'ACTIVE', now(), null);
    });
    op(u.id, 'KEY_ROTATED', `${old.id} -> ${reg.keyId}`); return { previousKey: old.id, newKey: reg.keyId };
  }
  function revokeKey(actor, kek, targetUserId, reason = 'administrative revocation') {
    allow(actor, 'ADMIN');
    need(ID_RE.user.test(String(targetUserId)) && user(targetUserId), 'Unknown user');
    const k = activeKey(targetUserId), a = actorOf(actor, kek);
    try { db.tx(() => { net.submit([statusChangeTx(a, k.id, String(reason).slice(0, 120))]); db.run("update keys set status='REVOKED', revoked_at=? where id=?", now(), k.id); }); } finally { a.priv.fill(0); }
    op(actor.id, 'KEY_REVOKED', k.id); return { revoked: k.id };
  }
  function identities(u) {
    const rows = db.all(`select k.id,k.user_id,k.identity_id,k.ver,k.alg,k.status,k.created,k.revoked_at,substr(k.pub,1,24) pub,u.name from keys k join users u on u.id=k.user_id ${u.role === 'ADMIN' ? '' : 'where k.user_id=?'} order by k.user_id,k.ver`, ...(u.role === 'ADMIN' ? [] : [u.id]));
    return rows.map(r => ({ ...r, privateKey: 'SEALED (AES-256-GCM under owner-derived key)' }));
  }

  // ---------------- administrative operations (recorded on the ledger as ADMIN_OPERATION) ----------------
  function toggleValidator(actor, kek, nodeId) {
    allow(actor, 'ADMIN');
    need(ID_RE.node.test(String(nodeId)), 'Invalid node'); const n = net.node(nodeId), a = actorOf(actor, kek);
    try {
      if (n.status === 'ONLINE') { net.submit([adminOpTx(a, 'VALIDATOR_OFFLINE', nodeId)]); net.setStatus(nodeId, 'OFFLINE'); }
      else { net.setStatus(nodeId, 'ONLINE'); net.submit([adminOpTx(a, 'VALIDATOR_ONLINE', nodeId)]); }
    } finally { a.priv.fill(0); }
    op(actor.id, 'VALIDATOR_TOGGLED', nodeId); return validators();
  }
  function resyncValidator(actor, kek, nodeId) {
    allow(actor, 'ADMIN');
    need(ID_RE.node.test(String(nodeId)), 'Invalid node'); const a = actorOf(actor, kek);
    try { net.resync(nodeId); net.submit([adminOpTx(a, 'VALIDATOR_RESYNC', nodeId, 'storage replaced from verified majority')]); } finally { a.priv.fill(0); }
    op(actor.id, 'VALIDATOR_RESYNC', nodeId); return validators();
  }
  function compromise(actor, nodeId, kind) {
    allow(actor, 'ADMIN');
    if (!demoMode) throw ERR(403, 'Attack simulation is disabled outside demo mode');
    need(ID_RE.node.test(String(nodeId)) && typeof kind === 'string', 'Invalid request');
    op(actor.id, 'ATTACK_SIMULATION', `${nodeId} ${kind}`); net.compromise(nodeId, kind); return validators();
  }

  // ---------------- audit (two clearly separate sources) ----------------
  function audit() {
    const v = net.view(), ledger = [];
    for (const b of v.canonical || []) for (const t of b.txs) {
      if (t.type === 'PROVENANCE') ledger.push({ block: b.idx, tx: t.id, type: 'PROVENANCE', ts: t.payload.record.timestamp, summary: `${t.payload.record.recipientId} decrypted ${t.payload.record.documentId} (${t.payload.record.sessionId})` });
      else if (t.type === 'AUTHORIZATION') ledger.push({ block: b.idx, tx: t.id, type: t.type, ts: t.payload.ts, summary: `${t.payload.recipientId} authorized for ${t.payload.documentId}` });
      else if (t.type !== 'VALIDATOR_REGISTRATION') ledger.push({ block: b.idx, tx: t.id, type: t.type, ts: t.payload.registeredAt || t.payload.effectiveAt || t.payload.ts, summary: t.payload.keyId ? `${t.payload.keyId} ${t.payload.status}` : `${t.payload.operation} ${t.payload.target}` });
    }
    return { ledger: ledger.reverse().slice(0, 100), operational: db.all('select ts,actor,type,detail from oplog order by id desc limit 120'),
      note: 'The ledger list is authoritative provenance history. The operational log lives in the application database, is administrator-writable, and is NOT authoritative.' };
  }
  function dashboard() {
    const v = net.view(), provs = (v.canonical || []).flatMap(b => b.txs).filter(t => t.type === 'PROVENANCE').length, invs = listInvestigations();
    return { documents: db.get('select count(*) n from documents').n, recipients: db.get("select count(*) n from users where role='RECIPIENT'").n, sessions: db.get('select count(*) n from sessions').n, provenance: provs, blocks: v.height + 1,
      investigations: invs.length, verified: invs.filter(i => i.attributionStatus === 'VERIFIED_PROVENANCE_MATCH').length, validators: { inSync: v.inSync, total: v.total, quorum: QUORUM, agreed: v.quorum, diverged: v.diverged }, ledgerHead: v.head };
  }

  // ---------------- security lab: executes the real services on live data / throw-away sandboxes ----------------
  function lab() {
    const T = [], add = (name, expected, actual, pass) => T.push({ n: T.length + 1, name, expected, actual, pass: !!pass });
    const v = net.view(), pt = (v.canonical || []).flatMap(b => b.txs.map(t => [b, t])).find(([, t]) => t.type === 'PROVENANCE');
    if (!pt) { add('Live provenance record available', 'a record exists', 'none — decrypt a document first', false); return T; }
    const [blk, tx] = pt, rec = tx.payload.record, ev0 = evidenceFor(tx, blk, v);
    add('Valid record verifies', 'VALID', ev0.signatureValid ? 'VALID' : 'INVALID', ev0.signatureValid);
    const mods = { recipientId: 'REC-0217', identityId: 'CID-0217', documentId: 'DOC-0002', documentVersion: '9.9', sessionId: 'SES-DEADBEEF', watermarkId: 'WM-0000000000000000', keyId: 'KEY-0217-V1', timestamp: '2000-01-01T00:00:00.000Z', authorizationId: 'AUT-00000000', documentHash: '0'.repeat(64) };
    for (const [k, val] of Object.entries(mods)) { const ev = evidenceFor(tx, blk, v, { ...rec, [k]: val }); add(`Modify ${k}`, 'INVALID', ev.signatureValid ? 'VALID' : 'INVALID', !ev.signatureValid); }
    const attacks = [['Modify transaction in one validator', 'modify-transaction', 'transaction integrity failure'], ['Modify block contents in one validator', 'modify-block', 'block hash mismatch'], ['Modify previousBlockHash in one validator', 'modify-previous-hash', 'previous-hash link broken'],
      ['Delete a block in one validator', 'delete-block', 'ledger continuity failure'], ['Replace a registered public key in one validator', 'replace-public-key', 'transaction integrity failure'], ['Rewrite one validator consistently (hashes recomputed)', 'rewrite-consistently', 'insufficient valid validator approvals']];
    for (const [name, kind, want] of attacks) {
      const cl = net.clone(); try { const vw = cl.compromise('NODE-04', kind), n = vw.nodes.find(x => x.id === 'NODE-04'), others = vw.nodes.filter(x => x.id !== 'NODE-04' && x.sync === 'IN_SYNC').length;
        add(name, `divergence detected (${want}); 4 others in sync`, `${n.divergence ? 'divergence detected' : 'NOT detected'}: ${n.reason || '—'}; ${others} others in sync`, n.divergence && (n.reason || '').includes(want) && others === 4); } catch (e) { add(name, 'detected', 'error: ' + e.message, false); }
    }
    // sandbox: real ledger rules with throw-away identities (does not touch live state)
    const sb = new Network(null, volatileKeystore), mk = (idn, role = 'RECIPIENT', subj = idn) => { const r = keyRegistration(idn, 1, undefined, role, subj); return { ...r, identityId: idn }; };
    const A = mk('CID-A001', 'RECIPIENT', 'X1'), B = mk('CID-A002', 'RECIPIENT', 'X2'), ADM = mk('CID-A003', 'ADMIN'), SND = mk('CID-A004', 'SENDER'); sb.submit([A.tx, B.tx, ADM.tx, SND.tx]);
    const snd = { identityId: SND.identityId, keyId: SND.keyId, priv: SND.kp.priv }, DH = sha('sandbox-doc');
    const authFor = rid2 => authorizationTx(snd, { authorizationId: 'AUT-' + rid2, documentId: 'DOC-0001', documentVersion: '1.0', documentHash: DH, recipientId: rid2 });
    sb.submit([authFor('X1'), authFor('X2')]);
    const R = (i, id, key) => ({ documentId: 'DOC-0001', documentVersion: '1.0', documentHash: DH, recipientId: id, identityId: key.identityId, sessionId: 'SES-' + i, watermarkId: 'WM-' + i.repeat(16).slice(0, 16), keyId: key.keyId, keyVersion: 1, authorizationId: 'AUT-' + id, timestamp: now(), signatureAlgorithm: SIG_ALG });
    const tryTx = tx => { try { sb.submit([tx]); return null; } catch (e) { return e.message; } };
    const r1 = R('AAAAAAAA', 'X1', A); const t1 = provenanceTx(r1, A.kp.priv); tryTx(t1);
    let m = tryTx(provenanceTx({ ...R('BBBBBBBB', 'X1', A), sessionId: r1.sessionId }, A.kp.priv)); add('Replayed decryption session', 'rejected: replayed session', m || 'ACCEPTED', m && m.includes('replayed'));
    m = tryTx(provenanceTx({ ...R('CCCCCCCC', 'X1', A), watermarkId: r1.watermarkId }, A.kp.priv)); add('Duplicate watermark id', 'rejected: duplicate watermark', m || 'ACCEPTED', m && m.includes('duplicate watermark'));
    m = tryTx(provenanceTx(R('9999999A', 'X2', A), A.kp.priv)); add('Signing key not bound to the named recipient (framing attempt)', 'rejected: not bound to the named recipient', m || 'ACCEPTED', m && m.includes('not bound'));
    m = tryTx(provenanceTx({ ...R('9999999B', 'X1', A), authorizationId: 'AUT-NONE' }, A.kp.priv)); add('Provenance without a ledger authorization', 'rejected: authorization not recorded', m || 'ACCEPTED', m && m.includes('authorization is not recorded'));
    m = tryTx(provenanceTx({ ...R('9999999C', 'X1', A), documentHash: sha('other') }, A.kp.priv)); add('Provenance that differs from its authorization (document hash)', 'rejected: does not match authorization', m || 'ACCEPTED', m && m.includes('does not match its ledger authorization'));
    m = tryTx(authorizationTx({ identityId: A.identityId, keyId: A.keyId, priv: A.kp.priv }, { authorizationId: 'AUT-EVIL', documentId: 'DOC-0001', documentVersion: '1.0', documentHash: DH, recipientId: 'X1' })); add('Non-sender issuing an authorization', 'rejected: only a SENDER', m || 'ACCEPTED', m && m.includes('only a SENDER'));
    m = tryTx(provenanceTx(R('DDDDDDDD', 'X1', A), B.kp.priv)); add('Signed by a different identity\'s key', 'rejected: signature invalid', m || 'ACCEPTED', m && m.includes('signature invalid'));
    m = tryTx(statusChangeTx({ identityId: B.identityId, keyId: B.keyId, priv: B.kp.priv }, A.keyId, 'lab')); add('Non-admin identity revoking another identity\'s key', 'rejected: not authorised', m || 'ACCEPTED', m && m.includes('not authorised'));
    m = tryTx(adminOpTx({ identityId: B.identityId, keyId: B.keyId, priv: B.kp.priv }, 'VALIDATOR_OFFLINE', 'NODE-01')); add('Non-admin identity issuing an administrative operation', 'rejected: require an ADMIN identity', m || 'ACCEPTED', m && m.includes('ADMIN'));
    const adm = { identityId: ADM.identityId, keyId: ADM.keyId, priv: ADM.kp.priv }; sb.submit([statusChangeTx(adm, A.keyId, 'lab')]);
    m = tryTx(provenanceTx(R('EEEEEEEE', 'X1', A), A.kp.priv)); add('New signature with a revoked key', 'rejected: key not active', m || 'ACCEPTED', m && m.includes('not active'));
    const sv = sb.view(), f = sv.canonical.flatMap(b => b.txs.map(t => [b, t])).find(([, t]) => t.id === t1.id), hev = evidenceFor(f[1], f[0], sv);
    add('Historical record still verifies after key revocation', 'VALID, key REVOKED', `${hev.signatureValid ? 'VALID' : 'INVALID'}, key ${hev.key?.status}`, hev.signatureValid && hev.key?.status === 'REVOKED');
    const B2 = keyRegistration('CID-A002', 2, { priv: B.kp.priv }, 'RECIPIENT', 'X2'); sb.submit([B2.tx]); const rb1 = provenanceTx(R('FFFFFFFF', 'X2', B), B.kp.priv); m = tryTx(rb1);
    add('Old key rejected after rotation', 'rejected: key not active', m || 'ACCEPTED', m && m.includes('not active'));
    m = tryTx(keyRegistration('CID-A002', 3, { priv: A.kp.priv }, 'RECIPIENT', 'X2').tx); add('Rotation endorsed by the wrong key', 'rejected: endorsement invalid', m || 'ACCEPTED', m && m.includes('endorsement'));
    // live: authorization + admin cannot unlock a recipient's key
    const before = db.get('select count(*) n from sessions').n + v.height, nisha = user('REC-0319');
    let denied = null; try { decrypt(nisha, Buffer.alloc(32), 'DOC-0001'); } catch (e) { denied = e.status; }
    const after = db.get('select count(*) n from sessions').n + net.view().height; add('Unauthorized recipient (live backend)', 'HTTP 403; no session/watermark/tx created', `HTTP ${denied}; artefacts created: ${after - before}`, denied === 403 && after === before);
    let unlocked = true; try { unlockKey(db.get("select * from keys where user_id='REC-0217'"), c.randomBytes(32)); } catch { unlocked = false; }
    add("Another account cannot unlock a recipient's private key", 'refused', unlocked ? 'UNLOCKED' : 'refused', !unlocked);
    return T;
  }

  if (mem || !fs.existsSync(path.join(dataDir, 'app.db')) || !db.get("select name from sqlite_master where name='users'")) seed();
  else net = new Network(path.join(dataDir, 'validators'), ks);
  return { db, get net() { return net; }, reset: seed, login, logout, authenticate, makeUser, createDocument, listDocuments, decrypt, listSessions, createLeak, listLeaks, investigate, listInvestigations, txEvidence, ledgerBlocks, ledgerKeys, validators, validateLedger,
    rotateKey, revokeKey, identities, toggleValidator, resyncValidator, compromise, audit, dashboard, lab, user, demoMode, unlockKey, activeKey, demoPassword, kekFor: (id, pw) => deriveKek(pw, user(id).kek_salt) };
}
