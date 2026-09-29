// Frontend: renders ONLY what the backend returns. Every verdict (VALID/INVALID, sync state, attribution) is a field of an API response.
'use strict';
let T = sessionStorage.getItem('t'), ME = JSON.parse(sessionStorage.getItem('me') || 'null'), V = 'dash', SEL = [], OUT = null, EV = null;
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sh = h => h ? String(h).slice(0, 8) + '…' + String(h).slice(-6) : '—';
const $ = id => document.getElementById(id);
const toast = m => { const t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => { t.style.display = 'none'; }, 5000); };
async function api(p, m = 'GET', b) {
  const r = await fetch('/api' + p, { method: m, headers: { 'content-type': 'application/json', 'x-token': T || '' }, body: b === undefined ? undefined : JSON.stringify(b) });
  const j = await r.json().catch(() => ({ error: 'Bad response' }));
  if (!r.ok) { if (r.status === 401 && ME) signout(); throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); }
  return j;
}
function signout() { T = null; ME = null; sessionStorage.clear(); draw(); }
const tag = (ok, a = 'VALID', b = 'INVALID') => `<span class="tag ${ok ? 'ok' : 'er'}">${ok ? a : b}</span>`;
const kv = (a, b) => `<tr><td class="l">${a}</td><td>${b}</td></tr>`;
const NAV = {
  SENDER: [['dash', 'Command center'], ['docs', 'Documents'], ['sess', 'Sessions'], ['led', 'Provenance ledger'], ['val', 'Validators'], ['aud', 'Audit']],
  RECIPIENT: [['dash', 'Command center'], ['docs', 'My documents'], ['sess', 'My sessions'], ['id', 'Cryptographic identity']],
  INVESTIGATOR: [['dash', 'Command center'], ['inv', 'Investigations'], ['led', 'Provenance ledger'], ['val', 'Validators'], ['lab', 'Security lab'], ['aud', 'Audit']],
  ADMIN: [['dash', 'Command center'], ['docs', 'Documents'], ['sess', 'Sessions'], ['led', 'Provenance ledger'], ['val', 'Validators'], ['id', 'Identities & keys'], ['lab', 'Security lab'], ['aud', 'Audit']],
};
const syncTag = n => `<span class="tag ${n.sync === 'IN_SYNC' ? 'ok' : n.sync === 'BEHIND' || n.sync === 'OFFLINE' ? 'wr' : 'er'}">${e(n.sync.replace('_', ' '))}</span>`;
const evBox = x => `<table>${kv('Signature (ML-DSA-65, simulated)', tag(x.signatureValid))}${kv('Transaction', tag(x.transactionValid))}${kv('Block + approvals', tag(x.blockValid, 'VALID', 'INVALID') + ` <span class="m mu">${x.approvals} valid approvals</span>`)}${kv('Chain', tag(x.chainValid))}${kv('Validator agreement', tag(x.validatorAgreement.agreed, 'AGREED', 'NO QUORUM') + ` <span class="m mu">${x.validatorAgreement.inSync}/${x.validatorAgreement.total} in sync${x.validatorAgreement.diverged.length ? ' · diverged: ' + e(x.validatorAgreement.diverged.join(', ')) : ''}</span>`)}${x.key ? kv('Key', `<span class="m">${e(x.key.keyId)} · ${e(x.key.status)}</span>`) : ''}</table>`;

const VIEW = {
  async dash() {
    const d = await api('/dashboard'), vs = d.validators;
    return `<h2>Command center</h2><p class="sub">Counts come from the application database and the verified ledger.</p>
    <div class="g">${[['Documents', d.documents], ['Recipients', d.recipients], ['Decryption sessions', d.sessions], ['Provenance records (ledger)', d.provenance], ['Ledger blocks', d.blocks], ['Investigations', d.investigations], ['Verified attributions', d.verified]].map(([a, b]) => `<div class="c"><div class="l">${a}</div><div class="n">${b}</div></div>`).join('')}</div>
    <div class="c"><div class="l">Ledger integrity (computed on request)</div><div class="n ${vs.agreed && !vs.diverged.length ? 'ok' : 'er'}">${vs.agreed ? (vs.diverged.length ? 'QUORUM OK · DIVERGENCE DETECTED' : 'VALIDATORS AGREE') : 'NO VALIDATOR QUORUM'}</div>
    <p class="m">${vs.inSync}/${vs.total} validators in sync (quorum ${vs.quorum})${vs.diverged.length ? ' · diverged: ' + e(vs.diverged.join(', ')) : ''}<br>head ${sh(d.ledgerHead)}</p><p class="mu">Simulated permissioned consensus for prototype demonstration.</p></div>`;
  },
  async docs() {
    const d = await api('/documents'), R = ME.role === 'RECIPIENT';
    return `<h2>${R ? 'My secure documents' : 'Documents'}</h2><p class="sub">Content is AES-256-GCM encrypted; per-recipient key establishment is ML-KEM-768 (simulated); authorizations are signed by the sender and recorded on the ledger.</p>
    ${OUT?.decrypt ? `<div class="res ok"><div class="l ok">Decryption complete</div><table>${kv('Session', `<span class="m">${e(OUT.decrypt.sessionId)}</span>`)}${kv('Watermark', `<span class="m">${e(OUT.decrypt.watermarkId)}</span> <span class="mu">(invisible, simulated)</span>`)}${kv('Transaction / block', `<span class="m">${e(OUT.decrypt.transactionId)} · #${OUT.decrypt.block} · ${OUT.decrypt.approvals} approvals</span>`)}${kv('Signing key', `<span class="m">${e(OUT.decrypt.keyId)}</span>`)}</table>${evBox(OUT.decrypt.evidence)}<pre>${e(OUT.decrypt.representation)}</pre></div>` : ''}
    ${OUT?.err ? `<div class="res er"><b class="er">${e(OUT.err)}</b></div>` : ''}
    ${ME.role === 'SENDER' ? `<div class="c"><h3>New document</h3><input id="dn" placeholder="Name" maxlength="120"> <select id="dc"><option>RESTRICTED</option><option>CONFIDENTIAL</option><option>SECRET</option></select><br><textarea id="dt" rows="4" style="width:100%;margin:8px 0" placeholder="Content"></textarea>${d.recipients.map(r => `<label><input type="checkbox" class="rc" value="${e(r.id)}"> ${e(r.name)} </label>`).join('')}<br><br><button class="p" data-a="newdoc">Encrypt, authorize &amp; anchor</button></div>` : ''}
    <div class="g2">${d.docs.map(x => `<div class="c"><div class="l wr">${e(x.cls)}</div><h3 style="font-size:16px;margin:4px 0">${e(x.name)}</h3><div class="m mu">${e(x.id)} · v${e(x.version)} · ${e(x.enc)}<br>content hash ${sh(x.hash)}</div><p>Decryptions: <b>${x.decryptions}</b></p>${R ? `<button class="p" data-a="dec" data-v="${e(x.id)}">Decrypt</button>` : `<div class="l">Authorized recipients</div>${x.authorized.map(a => `<div class="m">${e(a.id)} ${e(a.name)}</div>`).join('') || '<span class="mu">none</span>'}`}</div>`).join('') || '<div class="c mu">No documents available to this account.</div>'}</div>
    ${R ? `<div class="c"><h3>Access test</h3><p class="mu">Try to decrypt a document by ID. The backend decides; nothing is created on refusal.</p><input id="tid" placeholder="DOC-0001" maxlength="8"> <button data-a="try">Attempt decrypt</button></div>` : ''}`;
  },
  async sess() {
    const s = await api('/sessions'), sel = SEL.map(i => s.find(x => x.id === i)).filter(Boolean);
    return `<h2>Decryption sessions</h2><p class="sub">Tick two to compare. Each decryption has its own session, watermark and signed ledger record.</p>
    <div class="c wrapx"><table><tr><th></th><th>Session</th><th>Recipient</th><th>Doc</th><th>Watermark</th><th>Tx</th><th>Block</th><th></th></tr>${s.map(x => `<tr><td><input type="checkbox" data-a="sel" data-v="${e(x.id)}" ${SEL.includes(x.id) ? 'checked' : ''}></td><td class="m">${e(x.id)}</td><td>${e(x.name)}</td><td class="m">${e(x.doc_id)}</td><td class="m">${e(x.wm)}</td><td class="m">${e(x.txid)}</td><td>#${x.block}</td><td>${ME.role === 'INVESTIGATOR' ? '' : `<button class="s" data-a="leak" data-v="${e(x.id)}">Simulate leak</button>`}</td></tr>`).join('')}</table></div>
    ${sel.length === 2 ? `<div class="c"><div class="l">Comparison</div><table>${['name', 'id', 'wm', 'txid', 'ts'].map(k => `<tr><td class="mu">${k}</td><td class="m">${e(sel[0][k])}</td><td class="m">${e(sel[1][k])}</td><td>${sel[0][k] === sel[1][k] ? '<span class="wr">same</span>' : '<span class="ok">differs</span>'}</td></tr>`).join('')}</table></div>` : ''}`;
  },
  async led() {
    const [b, k] = await Promise.all([api('/ledger/blocks'), api('/ledger/keys')]);
    return `<h2>Provenance ledger</h2><p class="sub">Local permissioned DLT simulator · simulated permissioned consensus (not BFT). Blocks below are from the verified majority chain.</p>
    ${OUT?.validate ? `<div class="res ${OUT.validate.ok ? 'ok' : 'er'}"><b>${OUT.validate.ok ? 'ALL VALIDATORS AGREE' : 'PROBLEM DETECTED'}</b><div class="m">height ${OUT.validate.height} · ${OUT.validate.inSync}/${OUT.validate.total} in sync${OUT.validate.nodes.filter(n => n.reason).map(n => `<br>${e(n.id)}: ${e(n.reason)}`).join('')}</div></div>` : ''}
    ${OUT?.verify ? `<div class="res ${OUT.verify.signatureValid ? 'ok' : 'er'}"><b>${OUT.verify.signatureValid ? 'SIGNATURE VALID' : 'SIGNATURE INVALID — PROVENANCE REJECTED'}</b>${OUT.verify.changed.length ? `<div class="m">presented record differs in: ${e(OUT.verify.changed.join(', '))}</div>` : ''}</div>` : ''}
    <p><button class="p" data-a="validate">Validate all validators</button></p>
    <div class="c wrapx"><div class="l">Public-key registry (from ledger)</div><table><tr><th>Key</th><th>Identity</th><th>Ver</th><th>Status</th><th>Algorithm</th></tr>${k.map(x => `<tr><td class="m">${e(x.keyId)}</td><td class="m">${e(x.identityId)}</td><td>${x.keyVersion}</td><td class="${x.status === 'ACTIVE' ? 'ok' : x.status === 'REVOKED' ? 'er' : 'wr'}">${e(x.status)}</td><td class="m mu">${e(x.algorithm)}</td></tr>`).join('')}</table></div>
    ${b.blocks.map(x => `<div class="c"><b>BLOCK #${x.idx}</b> <span class="m mu">${e(x.ts)} · approvals ${x.approvals.length} (${e(x.approvals.join(' '))})</span><div class="m mu">prev ${sh(x.prev)} → hash ${sh(x.hash)}</div>${x.txs.map(t => `<div style="border-top:1px solid var(--bd);margin-top:8px;padding-top:8px" class="m"><span class="tag ac">${e(t.type)}</span> ${e(t.id)}<br>${t.type === 'PROVENANCE' ? `doc ${e(t.payload.documentId)} · recipient <b>${e(t.payload.recipientId)}</b> · ${e(t.payload.sessionId)} · ${e(t.payload.watermarkId)}<br>key ${e(t.payload.keyId)} · ${e(t.payload.signatureAlgorithm)}` : e(JSON.stringify(t.payload)).slice(0, 220)}
    ${t.type === 'PROVENANCE' && ME.role !== 'RECIPIENT' ? `<br><button class="s" data-a="vsig" data-v="${e(t.id)}">Verify signature</button> <button class="s" data-a="vmod" data-v="${e(t.id)}">Verify with recipient → REC-0217</button>` : ''}</div>`).join('')}</div>`).join('')}`;
  },
  async val() {
    const v = await api('/validators'), A = ME.role === 'ADMIN';
    return `<h2>Validators</h2><p class="sub">${e(v.consensus)}. Each validator keeps its own copy of the chain and validates independently; a block needs ${v.quorum} valid approvals.</p>
    <p class="${v.agreed ? 'ok' : 'er'}"><b>${v.agreed ? 'Verified majority present' : 'No verified majority'}</b> · height ${v.height}</p>
    <div class="c wrapx"><table><tr><th>Node</th><th>Status</th><th>Height</th><th>Latest block hash</th><th>Validation</th><th>Sync</th><th>Divergence</th><th></th></tr>${v.nodes.map(n => `<tr><td class="m">${e(n.id)}</td><td>${e(n.status)}</td><td>${n.ledgerHeight}</td><td class="m">${sh(n.latestBlockHash)}</td><td>${tag(n.validation === 'VALID', 'VALID', 'INVALID')}</td><td>${syncTag(n)}</td><td>${n.divergence ? `<span class="er">DIVERGED</span><div class="m mu">${e(n.reason)}</div>` : '<span class="mu">none</span>'}</td><td>${A ? `<button class="s" data-a="node" data-v="${e(n.id)}">${n.status === 'ONLINE' ? 'Take offline' : 'Bring online'}</button> <button class="s" data-a="resync" data-v="${e(n.id)}">Resync</button>` : ''}</td></tr>`).join('')}</table></div>
    ${A ? `<div class="c"><h3>Attack simulation (demo mode)</h3><p class="mu">Corrupts ONE validator's own storage. Others are untouched, so the divergence should be detected.</p><select id="ak">${['modify-transaction', 'modify-block', 'modify-previous-hash', 'delete-block', 'replace-public-key', 'rewrite-consistently'].map(x => `<option>${x}</option>`).join('')}</select> <select id="an">${v.nodes.map(n => `<option>${e(n.id)}</option>`).join('')}</select> <button class="d" data-a="attack">Apply to validator</button></div>` : ''}`;
  },
  async inv() {
    const [l, i] = await Promise.all([api('/leaks'), api('/investigations')]), r = OUT?.inv;
    return `<h2>Forensic investigation</h2><p class="sub">You supply only an artefact. The watermark is extracted, resolved on the ledger, and verified — you never pick a recipient.</p>
    <div class="c"><div class="l">Leaked artefacts</div>${l.map(x => `<div class="m" style="margin:6px 0">${e(x.id)} · ${e(x.ts)} · ${x.bytes} chars <button class="p s" data-a="run" data-v="${e(x.id)}">Run investigation</button></div>`).join('') || '<span class="mu">None yet. A recipient or sender can simulate a leak from a session.</span>'}<hr style="border-color:var(--bd)"><div class="l">Or analyse a text file</div><input type="file" id="f" accept=".txt,text/plain"> <button data-a="upl">Analyse file</button></div>
    ${r ? `<div class="res ${r.attributionStatus === 'VERIFIED_PROVENANCE_MATCH' ? 'ok' : r.attributionStatus === 'NO_ATTRIBUTION' ? 'wr' : 'er'}"><div class="l">${e(r.id)} · ${e(r.label)}</div><div class="n" style="font-size:22px">${e(r.attributionStatus.replace(/_/g, ' '))}</div><p>${e(r.statement)}</p>
    <div>${r.steps.map(s => `<div class="st">${s.ok ? '<span class="ok">✓</span>' : '<span class="er">✗</span>'} <span>${e(s.name)} <span class="m mu">${e(s.detail)}</span></span></div>`).join('')}</div>
    ${r.provenanceFound ? `<div class="ch">${[['Leaked artefact', r.label, 'a'], ['Watermark', r.watermarkId, 'w'], ['Ledger transaction', r.transactionId, 't'], ['Block', '#' + r.blockId, 'b'], ['Session', r.sessionId, 's'], ['Recipient', r.recipientId + ' ' + r.recipientName, 'r'], ['Historical public key', r.keyId + ' v' + r.keyVersion, 'k'], ['Signature', r.signatureValid ? 'VALID' : 'INVALID', 'g'], ['Chain + validators', r.ledgerValid ? 'VALID' : 'INVALID', 'h']].map(([a, b, k], x) => `${x ? '<div class="ln"></div>' : ''}<div class="c" data-a="ev" data-v="${k}"><div class="l">${a}</div><div class="m ${b === 'INVALID' ? 'er' : b === 'VALID' ? 'ok' : ''}">${e(b)}</div></div>`).join('')}</div><pre id="evd">Click a node in the chain to inspect its evidence.</pre>` : ''}</div>` : ''}
    <div class="c wrapx"><div class="l">Investigation history (persisted)</div><table>${i.map(x => `<tr><td class="m">${e(x.id)}</td><td class="m">${x.watermarkRecovered ? e(x.watermarkId) : 'no watermark'}</td><td>${e(x.attributionStatus.replace(/_/g, ' '))}</td><td class="m mu">${e(x.ts)}</td></tr>`).join('')}</table></div>`;
  },
  async id() {
    const k = await api('/identities'), A = ME.role === 'ADMIN';
    return `<h2>Cryptographic identities</h2><p class="sub">Signing: ML-DSA-65 (simulated). Key establishment: ML-KEM-768 (simulated). Private keys are sealed and never returned by the API.</p>
    <div class="c wrapx"><table><tr><th>Key</th><th>Owner</th><th>Identity</th><th>Ver</th><th>Status</th><th>Private key</th><th></th></tr>${k.map(x => `<tr><td class="m">${e(x.id)}</td><td>${e(x.name)}</td><td class="m">${e(x.identity_id)}</td><td>${x.ver}</td><td class="${x.status === 'ACTIVE' ? 'ok' : x.status === 'REVOKED' ? 'er' : 'wr'}">${e(x.status)}</td><td>🔒 <span class="m mu">SEALED</span></td><td>${x.status === 'ACTIVE' ? `${x.user_id === ME.id ? '<button class="s" data-a="rot">Rotate my key</button> ' : ''}${A ? `<button class="s d" data-a="rev" data-v="${e(x.user_id)}">Revoke</button>` : ''}` : ''}</td></tr>`).join('')}</table></div>
    <p class="mu">Rotated and revoked keys stay on the ledger, so historical records keep verifying against the key that signed them.</p>`;
  },
  async lab() {
    const t = OUT?.lab;
    return `<h2>Security test lab</h2><p class="sub">Runs the real services on live data and on throw-away in-memory sandboxes (your real ledger is never modified).</p><button class="p" data-a="lab">Run all tests</button>
    ${t ? `<p class="${t.every(x => x.pass) ? 'ok' : 'er'}"><b>${t.filter(x => x.pass).length}/${t.length} behaved as expected</b></p><div class="c wrapx"><table><tr><th>#</th><th>Test</th><th>Expected</th><th>Actual</th><th></th></tr>${t.map(x => `<tr><td>${x.n}</td><td>${e(x.name)}</td><td class="m">${e(x.expected)}</td><td class="m">${e(x.actual)}</td><td>${tag(x.pass, 'AS EXPECTED', 'UNEXPECTED')}</td></tr>`).join('')}</table></div>` : ''}`;
  },
  async aud() {
    const a = await api('/audit');
    return `<h2>System audit</h2><p class="sub">${e(a.note)}</p><div class="g2"><div class="c wrapx"><div class="l ok">Ledger events (authoritative)</div><table>${a.ledger.map(x => `<tr><td class="m mu">#${x.block}</td><td class="m">${e(x.type)}</td><td class="m mu">${e(x.summary)}</td></tr>`).join('')}</table></div>
    <div class="c wrapx"><div class="l wr">Operational log (non-authoritative)</div><table>${a.operational.map(x => `<tr><td class="m mu">${e(x.ts.slice(11, 19))}</td><td class="m">${e(x.actor)}</td><td class="m">${e(x.type)}</td><td class="m mu">${e(x.detail)}</td></tr>`).join('')}</table></div></div>`;
  },
};

async function draw() {
  const A = $('app');
  if (!ME) { A.innerHTML = `<div class="login"><div class="l" style="color:var(--ac)">SIH26237 · SIMULATION</div><h2>PROVENANCE</h2><p class="sub">Secure document attribution system</p><input id="u" placeholder="username" autocomplete="username" value="sender"><input id="p" type="password" placeholder="password" autocomplete="current-password"><button class="p" data-a="login" style="width:100%">Authenticate</button><p class="mu m">demo users: sender · aarav · riya · kabir · nisha · forensic · admin<br>demo password: see README</p><button data-a="reset">Reset demo environment</button></div>`; return; }
  const nav = NAV[ME.role]; if (!nav.some(n => n[0] === V)) V = 'dash';
  let body; try { body = await VIEW[V](); } catch (x) { body = `<div class="res er">${e(x.message)}</div>`; }
  A.innerHTML = `<aside><h1>PROVENANCE</h1>${nav.map(n => `<button class="nv ${V === n[0] ? 'on' : ''}" data-a="nav" data-v="${n[0]}">${n[1]}</button>`).join('')}</aside><main><div class="top"><span class="chip">DEMO MODE</span><span class="chip a">CRYPTO: SIMULATION</span><span style="flex:1"></span><span>${e(ME.name)} <span class="mu m">${e(ME.id)} · ${e(ME.role)}</span></span><button data-a="logout">Sign out</button></div>${body}</main>`;
}
const EVID = r => ({ a: { artefact: r.label }, w: { watermarkId: r.watermarkId }, t: { transactionId: r.transactionId, record: r.evidence.record }, b: r.evidence.block, s: { sessionId: r.sessionId, documentId: r.documentId }, r: { recipientId: r.recipientId, name: r.recipientName }, k: r.evidence.key, g: { signatureValid: r.signatureValid, signature: r.evidence.signature, algorithm: r.evidence.record.signatureAlgorithm }, h: { chainValid: r.chainValid, blockValid: r.blockValid, validatorAgreement: r.validatorAgreement } });
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return; const a = el.dataset.a, v = el.dataset.v;
  if (a === 'ev') { if (OUT?.inv) $('evd').textContent = JSON.stringify(EVID(OUT.inv)[v], null, 1); return; }
  const go = async f => { try { await f(); } catch (x) { OUT = null; toast(x.message); } draw(); };
  if (a === 'login') return go(async () => { const r = await api('/auth/login', 'POST', { username: $('u').value, password: $('p').value }); T = r.token; ME = r.user; sessionStorage.setItem('t', T); sessionStorage.setItem('me', JSON.stringify(ME)); V = 'dash'; OUT = null; });
  if (a === 'reset') return go(async () => { await api('/reset', 'POST', {}); toast('Demo environment reset'); });
  if (a === 'logout') { try { await api('/auth/logout', 'POST', {}); } catch {} return signout(); }
  if (a === 'nav') { V = v; OUT = null; return draw(); }
  if (a === 'sel') { SEL = ev.target.checked ? [...SEL, v].slice(-2) : SEL.filter(x => x !== v); return draw(); }
  go(async () => {
    OUT = null;
    if (a === 'newdoc') { const r = await api('/documents', 'POST', { name: $('dn').value, cls: $('dc').value, content: $('dt').value, recipients: [...document.querySelectorAll('.rc:checked')].map(x => x.value) }); toast('Created ' + r.id); }
    else if (a === 'dec' || a === 'try') { const id = a === 'try' ? $('tid').value : v; try { OUT = { decrypt: await api(`/documents/${encodeURIComponent(id)}/decrypt`, 'POST', {}) }; } catch (x) { OUT = { err: x.message }; } }
    else if (a === 'leak') { const r = await api('/leaks', 'POST', { sessionId: v }); toast('Leaked artefact created: ' + r.id); }
    else if (a === 'validate') OUT = { validate: await api('/ledger/validate', 'POST', {}) };
    else if (a === 'vsig') OUT = { verify: await api('/ledger/verify', 'POST', { txId: v }) };
    else if (a === 'vmod') OUT = { verify: await api('/ledger/verify', 'POST', { txId: v, overrides: { recipientId: 'REC-0217' } }) };
    else if (a === 'node') { await api(`/validators/${v}/toggle`, 'POST', {}); }
    else if (a === 'resync') { await api(`/validators/${v}/resync`, 'POST', {}); toast(v + ' resynchronised from the verified majority'); }
    else if (a === 'attack') { await api('/lab/compromise', 'POST', { nodeId: $('an').value, kind: $('ak').value }); toast('Attack applied to one validator only'); }
    else if (a === 'run') OUT = { inv: await api('/investigations', 'POST', { leakId: v }) };
    else if (a === 'upl') { const f = $('f').files[0]; if (!f) throw new Error('Choose a file first'); if (f.size > 500000) throw new Error('File too large'); OUT = { inv: await api('/investigations', 'POST', { text: await f.text(), label: f.name.slice(0, 80) }) }; }
    else if (a === 'rot') { const r = await api('/identity/rotate', 'POST', {}); toast('New key ' + r.newKey); }
    else if (a === 'rev') { await api('/identity/revoke', 'POST', { userId: v }); toast('Key revoked; the identity can no longer sign'); }
    else if (a === 'lab') OUT = { lab: await api('/lab/run') };
  });
});
draw();
