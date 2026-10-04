// Frontend: renders ONLY what the backend returns. Every verdict (VALID/INVALID, sync state, attribution) is a field of an API response.
'use strict';
let T = sessionStorage.getItem('t'), ME = JSON.parse(sessionStorage.getItem('me') || 'null'), V = 'dash', SEL = [], OUT = null, EV = null;
let ENV = null;
let PUB_VIEW = 'login'; // 'login' | 'register' | 'how' | 'demo'
let DEMO_SESSION_ID = null;
let DEMO_STEP = 1;
let DEMO_MODE = 'self'; // 'self' | 'guided'
let DEMO_AUTOPLAY = null;
let DEMO_TIME_LEFT = 8;
let DEMO_DATA = null;
let DEMO_SHOW_MODAL = false;
let DEMO_SHOW_TECH = false;
let FILTERS = { docText: '', docCls: '', sessDoc: '', sessUser: '', ledTxType: '', userRole: '' };
let TARGET_HIGHLIGHT = null; // { id: 'block-2' or 'session-xxx' }
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sh = h => h ? String(h).slice(0, 8) + '…' + String(h).slice(-6) : '—';
const $ = id => document.getElementById(id);
const toast = m => { const t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => { t.style.display = 'none'; }, 5000); };
let signingOut = false;
function signout() {
  if (signingOut) return;
  signingOut = true;
  T = null;
  ME = null;
  sessionStorage.clear();
  try {
    draw();
  } finally {
    signingOut = false;
  }
}
async function api(p, m = 'GET', b) {
  // If demo is active and a context snapshot has this data for GET requests, serve it directly
  if (DEMO_SESSION_ID && DEMO_DATA?.contextSnapshot && m === 'GET' && !p.startsWith('/demo')) {
    const snap = DEMO_DATA.contextSnapshot;
    if (p === '/documents' && snap.documents) return snap.documents;
    if (p === '/sessions' && snap.sessions) return snap.sessions;
    if (p === '/dashboard' && snap.dashboard) return snap.dashboard;
    if (p === '/validators' && snap.validators) return snap.validators;
    if (p === '/ledger/blocks' && snap.blocks) return snap.blocks;
    if (p === '/ledger/keys' && snap.keys) return snap.keys;
    if (p === '/investigations' && snap.investigations) return snap.investigations;
    if (p === '/leaks' && snap.leaks) return snap.leaks;
    if (p === '/identities' && snap.identities) return snap.identities;
    if (p === '/audit' && snap.audit) return snap.audit;
    if (p === '/environment' && DEMO_DATA.environment) return DEMO_DATA.environment;
  }

  const r = await fetch('/api' + p, { method: m, headers: { 'content-type': 'application/json', 'x-token': T || '' }, body: b === undefined ? undefined : JSON.stringify(b) });
  const j = await r.json().catch(() => ({ error: 'Bad response' }));
  if (!r.ok) {
    if (r.status === 401 && ME && !DEMO_SESSION_ID) signout();
    throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status });
  }
  return j;
}
const tag = (ok, a = 'VALID', b = 'INVALID') => `<span class="tag ${ok ? 'ok' : 'er'}">${ok ? a : b}</span>`;
const syncTag = n => `<span class="tag ${n.sync === 'IN_SYNC' ? 'ok' : n.sync === 'BEHIND' ? 'wr' : 'er'}">${e(n.sync || 'UNKNOWN')}</span>`;
const kv = (a, b) => `<tr><td class="l">${a}</td><td>${b}</td></tr>`;
const NAV = {
  SENDER: [['dash', 'Command center'], ['how', 'How it works'], ['docs', 'Documents'], ['sess', 'Sessions'], ['led', 'Provenance ledger'], ['val', 'Validators'], ['aud', 'Audit']],
  RECIPIENT: [['dash', 'Command center'], ['how', 'How it works'], ['docs', 'My documents'], ['sess', 'My sessions'], ['led', 'Provenance ledger'], ['id', 'Cryptographic identity']],
  INVESTIGATOR: [['dash', 'Command center'], ['how', 'How it works'], ['inv', 'Investigations'], ['led', 'Provenance ledger'], ['val', 'Validators'], ['lab', 'Security lab'], ['aud', 'Audit']],
  ADMIN: [['dash', 'Command center'], ['how', 'How it works'], ['docs', 'Documents'], ['sess', 'Sessions'], ['led', 'Provenance ledger'], ['val', 'Validators'], ['id', 'Identities & keys'], ['lab', 'Security lab'], ['aud', 'Audit']],
};
const evBox = x => `<table>${kv(`Signature (${e(ENV?.crypto?.isPostQuantum ? ENV.crypto.signatureAlgorithm : 'Recipient Key')})`, tag(x.signatureValid))}${kv('Transaction', tag(x.transactionValid))}${kv('Block + approvals', tag(x.blockValid, 'VALID', 'INVALID') + ` <span class="m mu">${x.approvals} valid approvals</span>`)}${kv('Chain', tag(x.chainValid))}${kv('Validator agreement', tag(x.validatorAgreement.agreed, 'AGREED', 'NO QUORUM') + ` <span class="m mu">${x.validatorAgreement.inSync}/${x.validatorAgreement.total} in sync${x.validatorAgreement.diverged.length ? ' · diverged: ' + e(x.validatorAgreement.diverged.join(', ')) : ''}</span>`)}${x.key ? kv('Key', `<span class="m">${e(x.key.keyId)} · ${e(x.key.status)}</span>`) : ''}</table>`;

let TOUR_ACTIVE = false;
let TOUR_STEP = 0;
let TOUR_MODAL = null; // 'welcome' | 'done' | null
let TOUR_TIMER = null;
let TOUR_TIMER_SECONDS = 12; // 12 seconds per step for comfortable reading
let TOUR_TIMER_REMAINING = 12;
let TOUR_PAUSED = false;

function stopTourTimer() {
  if (TOUR_TIMER) {
    clearInterval(TOUR_TIMER);
    TOUR_TIMER = null;
  }
}

function startTourTimer(seconds = 12) {
  stopTourTimer();
  TOUR_TIMER_SECONDS = seconds;
  TOUR_TIMER_REMAINING = seconds;
  TOUR_PAUSED = false;
  
  updateTourTimerUI();

  TOUR_TIMER = setInterval(() => {
    if (TOUR_PAUSED || !TOUR_ACTIVE) return;
    
    TOUR_TIMER_REMAINING -= 0.1;
    if (TOUR_TIMER_REMAINING <= 0.05) {
      stopTourTimer();
      // Auto-advance to next step or complete
      const steps = getTourSteps();
      if (TOUR_STEP < steps.length - 1) {
        TOUR_STEP++;
        draw();
      } else {
        TOUR_ACTIVE = false;
        TOUR_MODAL = 'done';
        localStorage.setItem('sih_tour_done_' + (ME ? ME.id : 'anon'), '1');
        draw();
      }
    } else {
      updateTourTimerUI();
    }
  }, 100);
}

function updateTourTimerUI() {
  const fill = $('tour-timer-fill');
  const count = $('tour-countdown-val');
  const pauseBtn = $('tour-pause-btn');
  if (fill) {
    const pct = Math.max(0, Math.min(100, (TOUR_TIMER_REMAINING / TOUR_TIMER_SECONDS) * 100));
    fill.style.width = pct.toFixed(1) + '%';
  }
  if (count) {
    count.textContent = Math.ceil(Math.max(0, TOUR_TIMER_REMAINING)) + 's';
  }
  if (pauseBtn) {
    pauseBtn.textContent = TOUR_PAUSED ? '▶ RESUME' : '⏸ PAUSE';
  }
}

const TOUR_STEPS_BY_ROLE = {
  SENDER: [
    {
      target: "main .c:first-of-type",
      fallback: "aside",
      view: "dash",
      title: "Sender Defense Command Center",
      desc: "Comprehensive operational overview. Tracks live multi-validator consensus across all 5 independent SQLite nodes (NODE-01 through NODE-05), active post-quantum key registration, operational document counts, and session security health.",
      why: "In military and defence operations, documents must only be sealed and released when independent validator quorum (>= 3 of 5) is verified and no node divergence exists."
    },
    {
      target: "button[data-v='docs']",
      fallback: "aside",
      view: "dash",
      title: "Classified Documents Repository",
      desc: "The secure document sealing and distribution enclave. Author, classify, bulk-encrypt, and manage cryptographic authorizations for sensitive operational dispatches.",
      why: "Classified dispatches are protected under strict military confidentiality before broadcast over local networks."
    },
    {
      target: "#new-doc-card",
      fallback: "main .c",
      view: "docs",
      title: "Document Creation & AES-256-GCM Bulk Sealing",
      desc: "Enter document name, assign defense classification (RESTRICTED, CONFIDENTIAL, or SECRET), and provide the plaintext operational brief. Bulk encryption utilizes AES-256-GCM with Authenticated Associated Data (AAD) bound to the document ID and version.",
      why: "Guarantees cryptographic confidentiality and tampering detection at rest. Post-quantum algorithms are not used for bulk data; instead, AES-256-GCM protects bulk content efficiently."
    },
    {
      target: "#recipients-group",
      fallback: "#new-doc-card",
      view: "docs",
      title: "Authorized Roster & ML-KEM-768 Key Encapsulation",
      desc: "Select authorized personnel permitted to decrypt this document. For each recipient, the system encapsulates a unique Content Encryption Key (CEK) using NIST FIPS 203 ML-KEM-768 and signs an AUTHORIZATION transaction.",
      why: "Only explicitly authorized identities whose public keys are verified on the ledger can ever decapsulate the CEK and decrypt the document."
    },
    {
      target: "button[data-v='sess']",
      fallback: "aside",
      view: "docs",
      title: "Decryption Sessions & Watermark Audit",
      desc: "Inspect live recipient decryption sessions. Every single decryption performed by an authorized officer generates an isolated session ID (SES-xxxx) and an invisible watermark identifier (WM-xxxx).",
      why: "Enables side-by-side comparison proving that each officer's decryption creates a forensically unique copy despite originating from the same broadcast document."
    },
    {
      target: "button[data-v='led']",
      fallback: "aside",
      view: "docs",
      title: "Immutable Provenance Ledger",
      desc: "Inspect chronological SHA-256 hash-linked blocks containing PUBLIC_KEY_REGISTRATION, AUTHORIZATION, and recipient-signed PROVENANCE transactions. Each block requires Ed25519 multi-signatures.",
      why: "Eliminates centralized database vulnerability. Even a root server administrator cannot alter historical records without breaking hash continuity and quorum verification."
    },
    {
      target: "button[data-v='val']",
      fallback: "aside",
      view: "docs",
      title: "5-Node Validator Consensus & Quorum Status",
      desc: "Inspect live synchronization state across all 5 independent validator databases. Blocks commit only when a quorum of at least 3-of-5 nodes validate transaction rules and sign approvals.",
      why: "Ensures Byzantine-resistant consensus in air-gapped environments without relying on public blockchains or external miners."
    },
    {
      target: ".top",
      fallback: "main",
      view: "dash",
      title: "Operator Enclave Controls & Live Clock",
      desc: "Displays active cryptographic mode (ML-DSA-65 / ML-KEM-768), deployment profile (LOCAL / HOSTED), live synchronized UTC clock, authenticated operator credentials, password re-sealing, and tour controls.",
      why: "Provides continuous cryptographic and session awareness, ensuring operations run inside an authenticated, air-gapped security boundary."
    }
  ],
  RECIPIENT: [
    {
      target: "main .c:first-of-type",
      fallback: "aside",
      view: "dash",
      title: "Recipient Terminal & Clearance Status",
      desc: "Welcome Officer. Your command center verifies that the decentralized ledger is in healthy consensus and displays the operational briefs authorized for your cryptographic identity.",
      why: "Ensures you are accessing verified intelligence against an uncorrupted, multi-validator ledger state."
    },
    {
      target: "button[data-v='docs']",
      fallback: "aside",
      view: "dash",
      title: "Authorized Classified Briefs",
      desc: "Displays operational briefs that have been specifically authorized for your identity by operational commanders via on-chain AUTHORIZATION transactions.",
      why: "Decryption is strictly evaluated against the ledger. Without an active, non-revoked authorization transaction, the decryption engine fails closed."
    },
    {
      target: "main .g2 .c:first-of-type",
      fallback: "main .c",
      view: "docs",
      title: "Moment of Decryption & Provenance Generation",
      desc: "When you click 'Decrypt', the enclave unwraps your ML-KEM-768 key capsule, decrypts the AES-256-GCM ciphertext, injects an imperceptible session watermark, and synthesizes a 12-field canonical Decryption Provenance Record.",
      why: "Attribution is established at the exact moment of decryption. Your copy looks identical to normal text, but contains a hidden forensic watermark bound to your identity."
    },
    {
      target: "button[data-v='sess']",
      fallback: "aside",
      view: "docs",
      title: "Personal Decryption Audit Log",
      desc: "Review all decryption sessions executed under your account. Displays session IDs, watermark references, timestamps, and the exact ledger block number where your signed provenance is anchored.",
      why: "Provides personal audit transparency so you know precisely what cryptographic evidence is recorded under your key on the distributed ledger."
    },
    {
      target: "button[data-v='led']",
      fallback: "aside",
      view: "docs",
      title: "Provenance Ledger Verification",
      desc: "Examine the decentralized ledger blocks and review your signed PROVENANCE transactions alongside sender authorizations and validator approvals.",
      why: "Confirms that your decryption events are immutably preserved and protected against post-hoc tampering by any third party."
    },
    {
      target: "button[data-v='id']",
      fallback: "aside",
      view: "docs",
      title: "Cryptographic Identity & Key Lifecycle",
      desc: "Inspect your NIST FIPS 204 ML-DSA-65 signing key and NIST FIPS 203 ML-KEM-768 key encapsulation pair. Execute policy-mandated key rotations with previous-key endorsements.",
      why: "When a key is rotated, historical decryptions continue to verify against previous ledger blocks, ensuring seamless long-term forensic attribution."
    },
    {
      target: ".top",
      fallback: "main",
      view: "dash",
      title: "Security Enclave & Session Safeguards",
      desc: "Monitor active security indicators, military UTC synchronization, and use the 'Key & Password' utility to re-derive your scrypt Key Encryption Key and re-seal all private keys.",
      why: "Private keys are never stored plaintext on disk. They remain sealed under your password-derived scrypt KEK at all times."
    }
  ],
  INVESTIGATOR: [
    {
      target: "main .c:first-of-type",
      fallback: "aside",
      view: "dash",
      title: "Forensic Command Center",
      desc: "Welcome Forensic Officer. This dashboard tracks system-wide forensic investigations, verified leak attributions, and consensus synchronization across all 5 validator nodes.",
      why: "Forensic attribution is legally sound only when backed by uncorrupted, majority-verified ledger blocks across the distributed validator network."
    },
    {
      target: "button[data-v='inv']",
      fallback: "aside",
      view: "dash",
      title: "Forensic Investigation Enclave",
      desc: "The primary workspace for analyzing leaked documents, extracting invisible watermarks, querying ledger provenance, and reconstructing mathematical chains of custody.",
      why: "Operates with zero investigative bias: you ingest only the leaked raw text snippet without selecting suspects or guessing recipient identities."
    },
    {
      target: "main .c:first-of-type",
      fallback: "main",
      view: "inv",
      title: "Leaked Artifact Ingestion & Analysis",
      desc: "Ingest leaked text fragments or upload recovered documents. The forensic engine parses the text, extracts invisible zero-width Unicode steganographic signals, and validates the SHA-256 parity checksum.",
      why: "Categorizes evidence with explicit status codes (WATERMARK_FOUND, WATERMARK_INTEGRITY_FAILED, or NO_SUPPORTED_WATERMARK_FOUND) to prevent false positives."
    },
    {
      target: "button[data-v='led']",
      fallback: "aside",
      view: "inv",
      title: "Ledger Evidence Query & Verification",
      desc: "The recovered watermark ID is matched against canonical blocks on the ledger to locate the original Decryption Provenance Record and verify the recipient's ML-DSA-65 digital signature.",
      why: "Attribution does not trust the application database; it queries the multi-validator ledger where history is mathematically locked."
    },
    {
      target: "button[data-v='val']",
      fallback: "aside",
      view: "inv",
      title: "Validator Quorum & Chain Continuity",
      desc: "Verify validator synchronization states, SHA-256 block hash-linking, and Ed25519 signature approvals across all 5 validator nodes.",
      why: "Guarantees that the provenance record was agreed upon by quorum (>= 3 of 5 nodes) and has not undergone unilateral rewriting."
    },
    {
      target: "button[data-v='lab']",
      fallback: "aside",
      view: "inv",
      title: "Security Test Lab & Attack Simulation",
      desc: "Execute controlled adversarial simulations: corrupted watermarks, forged signatures, altered transactions, and rogue validator database edits.",
      why: "Proves empirically in real time that tampered evidence fails closed and never produces false attribution verdicts."
    },
    {
      target: "button[data-v='aud']",
      fallback: "aside",
      view: "inv",
      title: "Authoritative Multi-Node Audit Trail",
      desc: "Compare authoritative immutable ledger transactions against non-authoritative operational logs to detect administrative discrepancies or unauthorized attempts.",
      why: "Provides an undeniable, multi-party audit trail suitable for military courts of inquiry and formal investigations."
    }
  ],
  ADMIN: [
    {
      target: "main .c:first-of-type",
      fallback: "aside",
      view: "dash",
      title: "Administrator Enclave Command Center",
      desc: "Full administrative visibility and multi-node consensus management. Monitors ledger block height, validator node health, active identities, and system-wide security diagnostics.",
      why: "Ensures operational resilience, node health, and immediate detection of any ledger partition or consensus divergence."
    },
    {
      target: "button[data-v='docs']",
      fallback: "aside",
      view: "dash",
      title: "Document Custody & Access Control",
      desc: "Review encrypted operational briefs, encryption parameters, cryptographic SHA-256 content digests, and authorized recipient lists.",
      why: "Provides enclave-level visibility while enforcing strict least privilege: administrators cannot decrypt documents without valid sender authorization."
    },
    {
      target: "button[data-v='led']",
      fallback: "aside",
      view: "dash",
      title: "Distributed Ledger Architecture & Block Audits",
      desc: "Inspect low-level block structures, transaction merkle roots, Ed25519 validator approvals, and run cryptographic signature verifications on demand.",
      why: "Confirms chain integrity and validates that every recorded transaction strictly complies with state transition rules."
    },
    {
      target: "button[data-v='val']",
      fallback: "aside",
      view: "dash",
      title: "Validator Cluster Management & Self-Healing",
      desc: "Take validator nodes offline, trigger state resynchronization from verified majority peers, and monitor quorum health across NODE-01 through NODE-05.",
      why: "Demonstrates high availability and self-healing: if an individual validator database is corrupted, it seamlessly resynchronizes from the verified quorum."
    },
    {
      target: "button[data-v='id']",
      fallback: "aside",
      view: "val",
      title: "Identities & Forward-Only Revocation",
      desc: "Oversee public key registrations, inspect rotation lineages, and issue KEY_STATUS_CHANGE revocation transactions for compromised credentials.",
      why: "Revoking a key prevents future authorizations while mathematically preserving historical attribution for pre-revocation decryptions."
    },
    {
      target: "button[data-v='lab']",
      fallback: "aside",
      view: "val",
      title: "Cryptographic & Consensus Attack Lab",
      desc: "Simulate adversarial attack scenarios against sandbox validator instances to verify Byzantine fault tolerance, signature invalidation, and fail-closed protections.",
      why: "Validates system defensive posture against state alteration before commissioning into production environments."
    },
    {
      target: "button[data-v='aud']",
      fallback: "aside",
      view: "val",
      title: "Authoritative Ledger vs Operational Audit",
      desc: "Review ledger-anchored ADMIN_OPERATION events side-by-side with volatile operational logs to guarantee end-to-end administrative accountability.",
      why: "All administrative interventions are immutably signed and committed to the ledger, preventing stealthy administrative misconduct."
    }
  ]
};

function getTourSteps() {
  const role = (ME && ME.role) || 'SENDER';
  return TOUR_STEPS_BY_ROLE[role] || TOUR_STEPS_BY_ROLE.SENDER;
}

let HIW_MODE = 'dist'; // 'dist' | 'forensic'
let HIW_STEP = 0;
let HIW_AUTOPLAY = null;

const HIW_STEPS = {
  dist: [
    {
      id: 'doc',
      snum: '01 / 07',
      title: 'Document Ingestion',
      node: 'doc',
      what: 'Plaintext document created & classified',
      why: 'Initiates a controlled defense document with explicit classification and intended recipient access boundaries.',
      proof: 'Document Hash: SHA-256(content) generated and anchored on creation.',
      specs: [['Bulk Enc Scheme', 'AES-256-GCM'], ['Classification', 'RESTRICTED / CONFIDENTIAL / SECRET'], ['Document ID', 'DOC-0001 (Monotonic)']],
      micro: `<div class="m mu">PLAINTEXT (Classified Brief)<br>└── Objective: Secure northern logistics corridor<br>└── Document Hash: <span style="color:var(--ac)">e3b0c442...8b1a</span></div>`
    },
    {
      id: 'enc',
      snum: '02 / 07',
      title: 'Bulk Encryption',
      node: 'enc',
      what: 'Random 256-bit Content Encryption Key (CEK) generated; payload encrypted via AES-256-GCM.',
      why: 'Guarantees confidentiality and cryptographic integrity with Authenticated Additional Data (AAD) binding.',
      proof: 'Ciphertext + 96-bit IV + 128-bit Authentication Tag bound to `doc:${id}:${version}`.',
      specs: [['Symmetric Cipher', 'AES-256-GCM (Real)'], ['Key Length', '256 bits (32 bytes)'], ['AAD Binding', 'doc:DOC-0001:1.0']],
      micro: `<div class="m mu">CEK [Random 32 Bytes] ──▶ AES-256-GCM<br>├── IV: 12-byte nonce<br>├── AAD: doc:DOC-0001:1.0<br>└── Tag: 16-byte cryptographic auth tag</div>`
    },
    {
      id: 'auth',
      snum: '03 / 07',
      title: 'Recipient Authorization',
      node: 'auth',
      what: 'Per-recipient key establishment (ML-KEM-768 sim.) & SENDER-signed AUTHORIZATION transaction.',
      why: 'Ensures only recipients possessing registered private KEM keys can ever unwrap the CEK, while the ledger records sender intent.',
      proof: 'Signed AUTHORIZATION transaction committed to ledger; CEK wrapped under KEM shared secret.',
      specs: [['Key Establishment', 'ML-KEM-768 (X25519+HKDF sim)'], ['Sender Signature', 'ML-DSA-65 (ECDSA-P256 sim)'], ['Auth Record', 'AUT-XXXXXXXX']],
      micro: `<div class="m mu">RECIPIENT PUBKEY ──▶ kemEncap()<br>├── Ciphertext: kem_ct (sent to recipient)<br>└── Shared Secret ──▶ Wraps CEK (AES-256-GCM)<br>SENDER Private Key ──▶ Signs AUTHORIZATION tx</div>`
    },
    {
      id: 'dec',
      snum: '04 / 07',
      title: 'Authorized Decryption',
      node: 'dec',
      what: 'Recipient unlocks KEM private key via credential-derived KEK, decapsulates CEK, and recovers plaintext.',
      why: 'Enforces strict access control: non-authorized identities are stopped immediately with no session or ledger trace created.',
      proof: 'Session row created atomically upon successful validation; key derivation executed entirely client-side/in-memory.',
      specs: [['Key Protection', 'AES-256-GCM under scrypt KEK'], ['Decap Function', 'kemDecap(priv, kem_ct)'], ['Session ID', 'SES-XXXXXXXX']],
      micro: `<div class="m mu">Recipient Password ──scrypt──▶ KEK<br>└── Unlocks Recipient KEM Private Key<br>└── kemDecap(priv, kem_ct) ──▶ Recover CEK<br>└── AES-256-GCM Decrypt ──▶ Plaintext</div>`
    },
    {
      id: 'wm',
      snum: '05 / 07',
      title: 'Forensic Watermarking',
      node: 'wm',
      what: 'Opaque 64-bit random identifier (`WM-XXXXXXXXXXXXXXXX`) embedded into plaintext using zero-width characters.',
      why: 'Permanently binds the specific decrypted representation to that recipient and session without altering human readability.',
      proof: 'Zero-width Unicode codepoints (`\\u200b`, `\\u200c`, `\\u2060`) inserted with SHA-256 parity checksum.',
      specs: [['Watermark ID', 'WM-[0-9A-F]{16}'], ['Encoding', 'Binary into Zero-Width Characters'], ['Check Parity', 'sha256(wm-check:id)[0..4]']],
      micro: `<div class="m mu">Generated: <span style="color:var(--wr)">WM-8F29C01B4D7E5A23</span><br>└── Encoded as: \\u2060[\\u200b\\u200c...]\\u2060<br>└── Injected at document newline offsets</div>`
    },
    {
      id: 'prov',
      snum: '06 / 07',
      title: 'Signed Provenance Tx',
      node: 'prov',
      what: 'Recipient automatically signs canonical provenance record {docId, recipientId, sessionId, watermarkId, keyId, authId}.',
      why: 'Creates irrefutable mathematical evidence of the decryption event directly signed by the recipient’s active key.',
      proof: 'ML-DSA-65 signature over canonical JSON serialization verified against registered ledger public key.',
      specs: [['Signature Alg', 'ML-DSA-65 (simulated)'], ['Tx Type', 'PROVENANCE'], ['Canonicalization', 'Order-independent recursive JSON']],
      micro: `<div class="m mu">Provenance Record: { docId, recipientId, sessionId, watermarkId... }<br>└── Recipient Key: KEY-0192-V1<br>└── ML-DSA-65 Signature: <span style="color:var(--ok)">MEQCID...</span></div>`
    },
    {
      id: 'cons',
      snum: '07 / 07',
      title: 'Consensus & Ledger Commit',
      node: 'cons',
      what: 'Transaction broadcast to 5 independent validator SQLite nodes; commits upon reaching quorum (≥ 3/5 approvals).',
      why: 'Prevents single-point-of-failure or unauthorized tampering by requiring independent multi-node state verification.',
      proof: 'Block committed with Ed25519 node approvals, SHA-256 hash continuity, and immutability.',
      specs: [['Consensus Quorum', '>= 3 of 5 Node Approvals'], ['Node Signatures', 'Ed25519 over Block Hash'], ['Validator Stores', 'NODE-01.db ... NODE-05.db']],
      micro: `<div class="m mu">5 Independent Validators:<br>├── NODE-01 [APPROVED]  NODE-02 [APPROVED]<br>├── NODE-03 [APPROVED]  NODE-04 [APPROVED]<br>└── NODE-05 [APPROVED] ──▶ <span style="color:var(--ok)">QUORUM (5/5) ──▶ BLOCK #N</span></div>`
    }
  ],
  forensic: [
    {
      id: 'leak',
      snum: '01 / 07',
      title: 'Leaked Artefact Received',
      node: 'leak',
      what: 'Investigator receives an unauthorized document copy or leaked text artefact.',
      why: 'The investigation starts with ZERO prior assumptions or recipient parameters; only the raw artefact is provided.',
      proof: 'Raw character stream input; byte length and checksum recorded.',
      specs: [['Input Type', 'Plaintext / Document Artefact'], ['Investigator Bias', 'NONE (No recipient selected)'], ['Max Payload', '500,000 characters']],
      micro: `<div class="m mu">ARTEFACT INGESTION:<br>└── Length: 428 characters<br>└── Visible text: Operational brief...<br>└── Suspect recipient: <span class="wr">UNKNOWN / UNBIASED</span></div>`
    },
    {
      id: 'wm_ex',
      snum: '02 / 07',
      title: 'Watermark Signal Extraction',
      node: 'wm_ex',
      what: 'Zero-width Unicode sequences are parsed, binary decoded, and validated against checksum parity.',
      why: 'Recovers the opaque tracking watermark without needing access to any cryptographic keys or recipient records.',
      proof: 'Recovered `WM-XXXXXXXXXXXXXXXX` matching regex `^WM-[0-9A-F]{16}$` and valid 4-character SHA-256 checksum.',
      specs: [['Extraction', 'Regex pattern /\\u2060([\\u200b\\u200c]+)\\u2060/g'], ['Copies Recovered', '3 redundant copies checked'], ['Checksum Verification', 'VALID']],
      micro: `<div class="m mu">SCANNING ARTEFACT...<br>├── Found 3 zero-width sequence copies<br>├── Bit unpacking: 01010111...<br>└── Watermark ID: <span style="color:var(--ac)">WM-8F29C01B4D7E5A23</span></div>`
    },
    {
      id: 'led_srch',
      snum: '03 / 07',
      title: 'Verified Ledger Search',
      node: 'led_srch',
      what: 'Watermark searched across verified majority chain in independent validator databases.',
      why: 'Bypasses the non-authoritative application DB; evidence is resolved strictly from immutable distributed blocks.',
      proof: 'PROVENANCE transaction found inside committed Block #N with verified canonical majority view.',
      specs: [['Query Target', 'Independent Validator DBs'], ['Authoritative Store', 'DLT Majority (Quorum >= 3)'], ['Transaction ID', 'TX-XXXXXXXX']],
      micro: `<div class="m mu">SEARCHING CANONICAL DLT CHAIN...<br>├── Watermark WM-8F29C01B4D7E5A23 located<br>├── Block: #003<br>└── Transaction: TX-4A82F901</div>`
    },
    {
      id: 'hist_key',
      snum: '04 / 07',
      title: 'Historical Key Resolution',
      node: 'hist_key',
      what: 'Retrieves the recipient’s public key as registered on the ledger at the time of session generation.',
      why: 'Ensures attribution remains 100% valid even if the recipient subsequently rotates or revokes their key.',
      proof: 'Key registration transaction and proof-of-possession signature validated from genesis/rotation history.',
      specs: [['Key Identifier', 'KEY-0192-V1'], ['Current Key Status', 'ACTIVE (or ROTATED/REVOKED)'], ['Ledger Bound Identity', 'CID-0192']],
      micro: `<div class="m mu">HISTORICAL KEY LOOKUP:<br>├── Identity: CID-0192 (Aarav Sharma)<br>├── Key: KEY-0192-V1 (ML-DSA-65)<br>└── State: Validated at block height #001</div>`
    },
    {
      id: 'sig_ver',
      snum: '05 / 07',
      title: 'Cryptographic Sig Check',
      node: 'sig_ver',
      what: 'Recovers canonical record and verifies ML-DSA-65 recipient signature using resolved public key.',
      why: 'Mathematically proves that the specific recipient private key signed this exact decryption record.',
      proof: 'ECDSA-P256/SHA-256 signature verification returns boolean TRUE over canonical record serialization.',
      specs: [['Algorithm', 'ML-DSA-65 (simulated)'], ['Verification Function', 'sigVerify(pub, canon(record), sig)'], ['Status', 'VALID']],
      micro: `<div class="m mu">SIGNATURE AUDIT:<br>├── Canonical Payload: { docId: 'DOC-0001', recipientId: 'REC-0192'... }<br>├── Signature: MEQCID...<br>└── Verification Result: <span style="color:var(--ok)">MATHEMATICALLY VALID</span></div>`
    },
    {
      id: 'blk_val',
      snum: '06 / 07',
      title: 'Block & Chain Continuity',
      node: 'blk_val',
      what: 'Verifies block SHA-256 hash, continuous previous-hash chain link, and validator approvals.',
      why: 'Confirms that the transaction was permanently anchored by quorum and has not suffered history rewriting.',
      proof: 'Block hash matches SHA-256 contents; previous-hash chain link unbroken; ≥ 3 valid Ed25519 node approvals.',
      specs: [['Block Hash Check', 'SHA-256(canonical(block)) === block.hash'], ['Chain Continuity', 'prevHash === block[N-1].hash'], ['Approvals', '5/5 Valid Node Signatures']],
      micro: `<div class="m mu">CHAIN AUDIT:<br>├── Previous Block Hash: 9f8a... Verified<br>├── Block Hash: 3c12... Verified<br>└── Validator Signatures: NODE-01..05 Verified</div>`
    },
    {
      id: 'attrib',
      snum: '07 / 07',
      title: 'Attribution & Forensic Verdict',
      node: 'attrib',
      what: 'Multi-stage checks complete: attribution verdict rendered as VERIFIED_PROVENANCE_MATCH.',
      why: 'Provides conclusive evidence identifying which recipient decryption session produced the leaked copy.',
      proof: 'Immutable evidentiary statement generated with full cryptographic and consensus proof attachments.',
      specs: [['Verdict', 'VERIFIED_PROVENANCE_MATCH'], ['Identified Recipient', 'Aarav Sharma (REC-0192)'], ['Session Bound', 'SES-8B1A2C3D']],
      micro: `<div class="m mu"><span style="color:var(--ok);font-weight:700">VERDICT: VERIFIED PROVENANCE MATCH</span><br>Leaked artefact matches decryption event by Aarav Sharma (REC-0192). Signed record & ledger consensus verified.</div>`
    }
  ]
};

const VIEW = {
  async how() {
    const list = HIW_STEPS[HIW_MODE];
    const s = list[HIW_STEP] || list[0];
    const isDist = HIW_MODE === 'dist';
    return `<h2>How It Works · System Model</h2><p class="sub">Interactive 2.5D architectural model demonstrating cryptographic flow from document creation to forensic attribution.</p>
    <div class="hiw-container">
      <div class="hiw-topbar">
        <div class="hiw-modes">
          <button class="hiw-mode-btn ${isDist ? 'active' : ''}" data-a="hiw-mode" data-v="dist">Distribution Pipeline</button>
          <button class="hiw-mode-btn ${!isDist ? 'active' : ''}" data-a="hiw-mode" data-v="forensic">Forensic Investigation</button>
        </div>
        <div class="hiw-playback">
          <button class="s" data-a="hiw-prev" ${HIW_STEP === 0 ? 'disabled' : ''}>◀ Prev</button>
          <button class="p s" data-a="hiw-demo">${HIW_AUTOPLAY ? '⏸ Pause Demo' : '▶ Run Demonstration'}</button>
          <button class="s" data-a="hiw-next" ${HIW_STEP === list.length - 1 ? 'disabled' : ''}>Next ▶</button>
        </div>
      </div>

      <div class="hiw-stepper">
        ${list.map((st, idx) => `
          <button class="hiw-step-item ${idx === HIW_STEP ? 'active' : ''}" data-a="hiw-step" data-v="${idx}">
            <span class="hiw-snum">${st.snum}</span>
            <span class="hiw-stitle">${e(st.title)}</span>
          </button>
        `).join('')}
      </div>

      <div class="hiw-split">
        <!-- 2.5D System Model Viewport -->
        <div class="hiw-viewport">
          <div class="hiw-grid-bg"></div>
          <div class="hiw-scene-25d">
            <svg class="hiw-svg-overlay">
              <defs>
                <linearGradient id="hiw-grad-line" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="var(--ac)" stop-opacity="0.8"/>
                  <stop offset="100%" stop-color="var(--ok)" stop-opacity="0.8"/>
                </linearGradient>
              </defs>
              ${isDist ? `
                <line x1="16%" y1="28%" x2="48%" y2="28%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
                <line x1="48%" y1="28%" x2="80%" y2="28%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
                <line x1="80%" y1="28%" x2="80%" y2="72%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
                <line x1="80%" y1="72%" x2="48%" y2="72%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
                <line x1="48%" y1="72%" x2="18%" y2="72%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
              ` : `
                <line x1="16%" y1="28%" x2="48%" y2="28%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
                <line x1="48%" y1="28%" x2="80%" y2="28%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
                <line x1="80%" y1="28%" x2="80%" y2="72%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
                <line x1="80%" y1="72%" x2="48%" y2="72%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
                <line x1="48%" y1="72%" x2="18%" y2="72%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
              `}
            </svg>

            ${isDist ? `
              <!-- Step 1: Document -->
              <div class="hiw-node ${HIW_STEP === 0 ? 'active-node' : HIW_STEP > 0 ? 'passed-node' : ''}" style="left:8%;top:20%" data-a="hiw-step" data-v="0">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">DOCUMENT</div></div>
                <div class="hiw-node-sub">DOC-0001 · Plaintext</div>
              </div>

              <!-- Step 2: Encryption -->
              <div class="hiw-node ${HIW_STEP === 1 ? 'active-node' : HIW_STEP > 1 ? 'passed-node' : ''}" style="left:40%;top:20%" data-a="hiw-step" data-v="1">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">AES-256-GCM</div></div>
                <div class="hiw-node-sub">Bulk Cipher + AAD</div>
              </div>

              <!-- Step 3: Authorization -->
              <div class="hiw-node ${HIW_STEP === 2 ? 'active-node' : HIW_STEP > 2 ? 'passed-node' : ''}" style="left:72%;top:20%" data-a="hiw-step" data-v="2">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">AUTHORIZATION</div></div>
                <div class="hiw-node-sub">ML-KEM-768 Encap</div>
              </div>

              <!-- Step 4: Decryption -->
              <div class="hiw-node ${HIW_STEP === 3 ? 'active-node' : HIW_STEP > 3 ? 'passed-node' : ''}" style="left:72%;top:64%" data-a="hiw-step" data-v="3">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">DECRYPTION</div></div>
                <div class="hiw-node-sub">Session SES-8B1A</div>
              </div>

              <!-- Step 5: Watermark -->
              <div class="hiw-node ${HIW_STEP === 4 ? 'active-node' : HIW_STEP > 4 ? 'passed-node' : ''}" style="left:40%;top:64%" data-a="hiw-step" data-v="4">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">WATERMARK</div></div>
                <div class="hiw-node-sub">Zero-Width Marks</div>
              </div>

              <!-- Step 6: Provenance -->
              <div class="hiw-node ${HIW_STEP === 5 ? 'active-node' : HIW_STEP > 5 ? 'passed-node' : ''}" style="left:10%;top:64%" data-a="hiw-step" data-v="5">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">PROVENANCE</div></div>
                <div class="hiw-node-sub">ML-DSA-65 Signed</div>
              </div>

              <!-- Step 7: 5-Validator DLT Consensus Orbit (Shown when step >= 6) -->
              <div class="hiw-val-cluster" style="left:calc(50% - 120px);top:calc(50% - 120px);opacity:${HIW_STEP === 6 ? '1' : '0.4'}">
                <div class="hiw-val-node ${HIW_STEP === 6 ? 'approved' : ''}" style="top:-23px;left:97px">N01</div>
                <div class="hiw-val-node ${HIW_STEP === 6 ? 'approved' : ''}" style="top:52px;right:-23px">N02</div>
                <div class="hiw-val-node ${HIW_STEP === 6 ? 'approved' : ''}" style="bottom:12px;right:15px">N03</div>
                <div class="hiw-val-node ${HIW_STEP === 6 ? 'approved' : ''}" style="bottom:12px;left:15px">N04</div>
                <div class="hiw-val-node ${HIW_STEP === 6 ? 'approved' : ''}" style="top:52px;left:-23px">N05</div>
              </div>
              <div class="hiw-val-center" style="position:absolute;left:calc(50% - 75px);top:calc(50% - 24px);width:150px;opacity:${HIW_STEP === 6 ? '1' : '0.4'}">
                <div style="font-weight:700;color:${HIW_STEP === 6 ? 'var(--ok)' : 'var(--tx)'}">DLT CONSENSUS</div>
                <div style="font-size:10px;color:var(--mu)">${HIW_STEP === 6 ? 'QUORUM 5/5 OK' : 'STANDBY'}</div>
              </div>
            ` : `
              <!-- Forensic Mode Nodes -->
              <!-- Step 1: Leaked Artefact -->
              <div class="hiw-node ${HIW_STEP === 0 ? 'active-node' : HIW_STEP > 0 ? 'passed-node' : ''}" style="left:8%;top:20%" data-a="hiw-step" data-v="0">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">ARTEFACT</div></div>
                <div class="hiw-node-sub">Raw Leaked Text</div>
              </div>

              <!-- Step 2: Extraction -->
              <div class="hiw-node ${HIW_STEP === 1 ? 'active-node' : HIW_STEP > 1 ? 'passed-node' : ''}" style="left:40%;top:20%" data-a="hiw-step" data-v="1">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">EXTRACTION</div></div>
                <div class="hiw-node-sub">Zero-Width Decoder</div>
              </div>

              <!-- Step 3: Ledger Search -->
              <div class="hiw-node ${HIW_STEP === 2 ? 'active-node' : HIW_STEP > 2 ? 'passed-node' : ''}" style="left:72%;top:20%" data-a="hiw-step" data-v="2">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">LEDGER QUERY</div></div>
                <div class="hiw-node-sub">Canonical Blocks</div>
              </div>

              <!-- Step 4: Historical Key -->
              <div class="hiw-node ${HIW_STEP === 3 ? 'active-node' : HIW_STEP > 3 ? 'passed-node' : ''}" style="left:72%;top:64%" data-a="hiw-step" data-v="3">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">HISTORICAL KEY</div></div>
                <div class="hiw-node-sub">Key at Session Time</div>
              </div>

              <!-- Step 5: Signature Verification -->
              <div class="hiw-node ${HIW_STEP === 4 ? 'active-node' : HIW_STEP > 4 ? 'passed-node' : ''}" style="left:40%;top:64%" data-a="hiw-step" data-v="4">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">SIG AUDIT</div></div>
                <div class="hiw-node-sub">ML-DSA-65 Validated</div>
              </div>

              <!-- Step 6: Block Validation -->
              <div class="hiw-node ${HIW_STEP === 5 ? 'active-node' : HIW_STEP > 5 ? 'passed-node' : ''}" style="left:10%;top:64%" data-a="hiw-step" data-v="5">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">CHAIN AUDIT</div></div>
                <div class="hiw-node-sub">Block Hash + Quorum</div>
              </div>

              <!-- Step 7: Attribution Result Center -->
              <div class="hiw-node ${HIW_STEP === 6 ? 'active-node' : ''}" style="left:calc(50% - 90px);top:calc(50% - 30px);width:180px;text-align:center" data-a="hiw-step" data-v="6">
                <div class="hiw-node-header" style="justify-content:center"><div class="hiw-node-indicator" style="background:${HIW_STEP === 6 ? 'var(--ok)' : 'var(--mu)'}"></div><div class="hiw-node-title">VERDICT</div></div>
                <div class="hiw-node-sub" style="color:${HIW_STEP === 6 ? 'var(--ok)' : 'var(--mu)'}">${HIW_STEP === 6 ? 'PROVENANCE MATCH' : 'PENDING'}</div>
              </div>
            `}
          </div>
        </div>

        <!-- Deep Dive Explainer Column -->
        <div class="hiw-explainer-panel">
          <div class="hiw-qa-block">
            <div class="hiw-q-label what"><span>●</span> WHAT IS HAPPENING</div>
            <div class="hiw-q-desc"><b>${e(s.what)}</b></div>
          </div>

          <div class="hiw-qa-block">
            <div class="hiw-q-label why"><span>●</span> WHY IT MATTERS</div>
            <div class="hiw-q-desc">${e(s.why)}</div>
          </div>

          <div class="hiw-qa-block">
            <div class="hiw-q-label proof"><span>●</span> CRYPTOGRAPHIC &amp; LEDGER PROOF</div>
            <div class="hiw-proof-box">${e(s.proof)}</div>
          </div>

          <div class="hiw-tech-specs">
            <div class="l" style="margin-bottom:4px">Technical Architecture Specs</div>
            ${s.specs.map(([k, v]) => `
              <div class="hiw-spec-row">
                <span class="hiw-spec-k">${e(k)}</span>
                <span class="hiw-spec-v">${e(v)}</span>
              </div>
            `).join('')}
          </div>

          <div class="hiw-visual-micro">
            <div class="l" style="margin-bottom:6px">Data Structure Representation</div>
            ${s.micro}
          </div>
        </div>
      </div>
    </div>`;
  },
  async dash() {
    const d = await api('/dashboard'), vs = d.validators;
    const canDocs = ['SENDER', 'RECIPIENT', 'ADMIN'].includes(ME.role);
    const canSess = ['SENDER', 'RECIPIENT', 'ADMIN'].includes(ME.role);
    const canInv = ['INVESTIGATOR', 'ADMIN'].includes(ME.role);
    const canLed = ['SENDER', 'RECIPIENT', 'INVESTIGATOR', 'ADMIN'].includes(ME.role);

    return `<h2>Command center</h2><p class="sub">Continuous cryptographic consensus and operational metrics across air-gapped nodes.</p>
    <div class="c" style="border-left:4px solid ${vs.agreed && !vs.diverged.length ? 'var(--ok)' : 'var(--er)'};margin-bottom:18px"><div class="l">Distributed Ledger Integrity · Consensus Status</div><div class="n ${vs.agreed && !vs.diverged.length ? 'ok' : 'er'}" style="font-size:24px;margin-bottom:6px">${vs.agreed ? (vs.diverged.length ? 'QUORUM OK · DIVERGENCE DETECTED' : 'CONSENSUS VERIFIED · ALL VALIDATORS AGREE') : 'ALERT: NO VALIDATOR QUORUM'}</div>
    <p class="m" style="margin:4px 0">${vs.inSync}/${vs.total} validators in sync (quorum ${vs.quorum})${vs.diverged.length ? ' · <span class="er">diverged: ' + e(vs.diverged.join(', ')) + '</span>' : ''} · head <span style="color:var(--ac)">${sh(d.ledgerHead)}</span></p><p class="mu" style="margin:4px 0 0;font-size:11px">Local permissioned DLT consensus verified on-demand against independent node state.</p></div>

    <div class="lifecycle-pipeline-card">
      <div class="lifecycle-header">
        <div>
          <div class="l" style="margin:0;color:var(--ac)">Cryptographic Provenance Lifecycle</div>
          <p class="mu" style="margin:2px 0 0;font-size:11.5px">Real-time state transitions computed directly from authoritative consensus ledger</p>
        </div>
        <span class="tag ok">CONTINUOUS ATTESTATION</span>
      </div>
      <div class="lifecycle-pipeline-grid">
        <div class="pipeline-stage" ${canDocs ? 'data-a="nav" data-v="docs" style="cursor:pointer"' : ''}>
          <div class="pipeline-stage-idx">STAGE 01 · AES-256-GCM</div>
          <div class="pipeline-stage-name">
            <span>Documents Sealed</span>
            <span class="pipeline-stage-count">${d.documents}</span>
          </div>
          <div class="pipeline-stage-desc">Classified briefs encrypted with single-use CEKs and bound to AAD.${canDocs ? ' <span style="color:var(--ac)">Open ↗</span>' : ''}</div>
          <div class="pipeline-connector">▶</div>
        </div>

        <div class="pipeline-stage" ${ME.role === 'ADMIN' ? 'data-a="nav" data-v="id" style="cursor:pointer"' : ''}>
          <div class="pipeline-stage-idx">STAGE 02 · ML-KEM-768</div>
          <div class="pipeline-stage-name">
            <span>Recipient Identities</span>
            <span class="pipeline-stage-count">${d.recipients}</span>
          </div>
          <div class="pipeline-stage-desc">Personnel with registered post-quantum key capsules on ledger.${ME.role === 'ADMIN' ? ' <span style="color:var(--ac)">Manage ↗</span>' : ''}</div>
          <div class="pipeline-connector">▶</div>
        </div>

        <div class="pipeline-stage" ${canSess ? 'data-a="nav" data-v="sess" style="cursor:pointer"' : ''}>
          <div class="pipeline-stage-idx">STAGE 03 · WATERMARKING</div>
          <div class="pipeline-stage-name">
            <span>Decryptions Executed</span>
            <span class="pipeline-stage-count">${d.sessions}</span>
          </div>
          <div class="pipeline-stage-desc">Plaintexts recovered with unique zero-width steganographic marks.${canSess ? ' <span style="color:var(--ac)">Inspect ↗</span>' : ''}</div>
          <div class="pipeline-connector">▶</div>
        </div>

        <div class="pipeline-stage" ${canLed ? 'data-a="nav" data-v="led" style="cursor:pointer"' : ''}>
          <div class="pipeline-stage-idx">STAGE 04 · CANONICAL DLT</div>
          <div class="pipeline-stage-name">
            <span>Provenance Records</span>
            <span class="pipeline-stage-count">${d.provenance}</span>
          </div>
          <div class="pipeline-stage-desc">ML-DSA-65 signed records anchored in verified blocks (${d.blocks} blocks).${canLed ? ' <span style="color:var(--ac)">View ↗</span>' : ''}</div>
        </div>
      </div>
    </div>

    <div class="l" style="margin:16px 0 8px">Operational Metrics · Click Metric to Explore</div>
    <div class="g">
      <div class="c" ${canDocs ? 'data-a="nav" data-v="docs" style="cursor:pointer"' : ''}>
        <div class="l">Documents</div>
        <div class="n">${d.documents}</div>
        ${canDocs ? '<span class="m mu" style="font-size:11px;color:var(--ac)">View docs ↗</span>' : ''}
      </div>
      <div class="c" ${ME.role === 'ADMIN' ? 'data-a="nav" data-v="id" style="cursor:pointer"' : ''}>
        <div class="l">Recipients</div>
        <div class="n">${d.recipients}</div>
        ${ME.role === 'ADMIN' ? '<span class="m mu" style="font-size:11px;color:var(--ac)">Directory ↗</span>' : ''}
      </div>
      <div class="c" ${canSess ? 'data-a="nav" data-v="sess" style="cursor:pointer"' : ''}>
        <div class="l">Decryption sessions</div>
        <div class="n">${d.sessions}</div>
        ${canSess ? '<span class="m mu" style="font-size:11px;color:var(--ac)">Sessions ↗</span>' : ''}
      </div>
      <div class="c" ${canLed ? 'data-a="nav" data-v="led" style="cursor:pointer"' : ''}>
        <div class="l">Provenance records</div>
        <div class="n">${d.provenance}</div>
        ${canLed ? '<span class="m mu" style="font-size:11px;color:var(--ac)">Ledger ↗</span>' : ''}
      </div>
      <div class="c" ${canLed ? 'data-a="nav" data-v="led" style="cursor:pointer"' : ''}>
        <div class="l">Ledger blocks</div>
        <div class="n">${d.blocks}</div>
        ${canLed ? '<span class="m mu" style="font-size:11px;color:var(--ac)">Blocks ↗</span>' : ''}
      </div>
      <div class="c" ${canInv ? 'data-a="nav" data-v="inv" style="cursor:pointer"' : ''}>
        <div class="l">Investigations</div>
        <div class="n">${d.investigations}</div>
        ${canInv ? '<span class="m mu" style="font-size:11px;color:var(--ac)">Forensics ↗</span>' : ''}
      </div>
      <div class="c" ${canInv ? 'data-a="nav" data-v="inv" style="cursor:pointer"' : ''}>
        <div class="l">Verified attributions</div>
        <div class="n">${d.verified}</div>
        ${canInv ? '<span class="m mu" style="font-size:11px;color:var(--ac)">Forensics ↗</span>' : ''}
      </div>
    </div>`;
  },
  async docs() {
    const d = await api('/documents'), R = ME.role === 'RECIPIENT', S = ME.role === 'SENDER';
    let filteredDocs = d.docs;
    if (FILTERS.docText) {
      const q = FILTERS.docText.toLowerCase();
      filteredDocs = filteredDocs.filter(x => x.name.toLowerCase().includes(q) || x.id.toLowerCase().includes(q));
    }
    if (FILTERS.docCls) {
      filteredDocs = filteredDocs.filter(x => x.cls === FILTERS.docCls);
    }

    return `<h2>${R ? 'My secure documents' : 'Documents'}</h2><p class="sub">Content is AES-256-GCM encrypted; per-recipient key establishment is ML-KEM-768 (simulated); authorizations are signed by the sender and recorded on the ledger.</p>
    ${OUT?.decrypt ? `<div class="res ok" id="decrypted-result-box"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="l ok" style="margin:0">Decryption complete · Plaintext Recovered</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="p s" data-a="goto-ledger-block" data-block="${OUT.decrypt.block}" data-tx="${e(OUT.decrypt.transactionId)}">🔗 View Provenance on Ledger (#${OUT.decrypt.block})</button><button class="s" data-a="copy-dec">📋 Copy Plaintext</button><button class="s" data-a="clear-dec">✕ Close Preview</button></div></div><table>${kv('Session', `<span class="m">${e(OUT.decrypt.sessionId)}</span>`)}${kv('Watermark', `<span class="m">${e(OUT.decrypt.watermarkId)}</span> <span class="mu">(invisible zero-width mark embedded)</span>`)}${kv('Transaction / block', `<span class="m">${e(OUT.decrypt.transactionId)} · #${OUT.decrypt.block} · ${OUT.decrypt.approvals} approvals</span>`)}${kv('Signing key', `<span class="m">${e(OUT.decrypt.keyId)}</span>`)}</table>${evBox(OUT.decrypt.evidence)}<pre id="decrypted-plaintext">${e(OUT.decrypt.representation)}</pre></div>` : ''}
    ${OUT?.err ? `<div class="res er"><b class="er">${e(OUT.err)}</b><button class="s" data-a="clear-dec" style="margin-left:12px;font-size:11px">Dismiss</button></div>` : ''}
    ${S ? `<div class="c" id="new-doc-card"><h3>Author new classified brief</h3><p class="mu" style="font-size:12px;margin:2px 0 10px">Seals payload locally with AES-256-GCM and anchors ML-KEM-768 key capsules on the consensus ledger.</p><input id="dn" placeholder="Document title / brief name" maxlength="120" style="width:280px"> <select id="dc"><option>RESTRICTED</option><option>CONFIDENTIAL</option><option>SECRET</option></select><br><textarea id="dt" rows="4" style="width:100%;margin:8px 0" placeholder="Classified content to encrypt..."></textarea><div class="l" style="margin:6px 0 2px">Authorized Recipients (ML-KEM-768 Encap)</div><div id="recipients-group" style="margin:4px 0">${d.recipients.length ? d.recipients.map(r => `<label style="margin-right:12px"><input type="checkbox" class="rc" value="${e(r.id)}"> ${e(r.name)} <span class="m mu">(${e(r.id)})</span></label>`).join('') : '<span class="mu">No registered recipient identities available in directory.</span>'}</div><br><button class="p" data-a="newdoc">Encrypt, authorize &amp; anchor</button></div>` : ''}

    <div class="filter-bar">
      <input type="text" id="doc-search" placeholder="Search by document name or ID..." value="${e(FILTERS.docText)}" style="width:240px">
      <select id="doc-cls-filter">
        <option value="">All Classifications</option>
        <option value="RESTRICTED" ${FILTERS.docCls === 'RESTRICTED' ? 'selected' : ''}>RESTRICTED</option>
        <option value="CONFIDENTIAL" ${FILTERS.docCls === 'CONFIDENTIAL' ? 'selected' : ''}>CONFIDENTIAL</option>
        <option value="SECRET" ${FILTERS.docCls === 'SECRET' ? 'selected' : ''}>SECRET</option>
      </select>
      ${(FILTERS.docText || FILTERS.docCls) ? `<button class="s" data-a="clear-doc-filter">Clear filter (${filteredDocs.length}/${d.docs.length})</button>` : ''}
    </div>

    <div class="g2">${filteredDocs.map(x => `<div class="c" id="doc-${e(x.id)}"><div class="l wr">${e(x.cls)}</div><h3 style="font-size:16px;margin:4px 0">${e(x.name)}</h3><div class="m mu">${e(x.id)} · v${e(x.version)} · ${e(x.enc)}<br>content hash ${sh(x.hash)}</div><p>Decryptions: <b>${x.decryptions}</b> ${(!R && x.decryptions > 0) ? `<button class="s" style="padding:2px 7px;font-size:11px;margin-left:8px" data-a="filter-sess-by-doc" data-v="${e(x.id)}">View ${x.decryptions} Session${x.decryptions > 1 ? 's' : ''} ↗</button>` : ''}</p>${R ? `<button class="p" data-a="dec" data-v="${e(x.id)}">Decrypt Document</button>` : `<div class="l" style="margin-top:10px">Authorized recipients</div>${x.authorized.map(a => `<div class="m" style="display:flex;justify-content:space-between;align-items:center;margin:3px 0"><span>${e(a.id)} ${e(a.name)} <span class="tag ${a.status === 'REVOKED' ? 'er' : 'ok'}">${e(a.status)}</span></span>${a.status !== 'REVOKED' ? `<button class="s d" style="padding:2px 6px;font-size:11px" data-a="revoke-auth" data-doc="${e(x.id)}" data-rec="${e(a.id)}">Revoke access</button>` : ''}</div>`).join('') || '<span class="mu">No authorized recipients</span>'}`}</div>`).join('') || `<div class="c" style="grid-column:1/-1;text-align:center;padding:32px 16px"><div class="l" style="color:var(--mu);margin-bottom:6px">NO DOCUMENTS FOUND</div><p style="margin:0 auto 12px;max-width:420px;color:var(--mu)">${(FILTERS.docText || FILTERS.docCls) ? 'No documents match the current search filter.' : (R ? 'No operational briefs have been authorized for your identity yet.' : 'No classified briefs created yet.')}</p></div>`}</div>
    ${R ? `<div class="c" style="margin-top:16px"><h3>Enclave Access Test</h3><p class="mu">Attempt to decrypt a document by its monotonic ID. Access is verified against ledger authorization records; unauthorized attempts create no session or watermark trace.</p><input id="tid" placeholder="DOC-0001" maxlength="8"> <button data-a="try">Attempt decrypt</button></div>` : ''}`;
  },
  async sess() {
    const s = await api('/sessions');
    let filteredSess = s;
    if (FILTERS.sessDoc) {
      filteredSess = filteredSess.filter(x => x.doc_id === FILTERS.sessDoc);
    }
    if (FILTERS.sessUser) {
      const q = FILTERS.sessUser.toLowerCase();
      filteredSess = filteredSess.filter(x => x.name.toLowerCase().includes(q) || x.user_id.toLowerCase().includes(q));
    }
    const sel = SEL.map(i => s.find(x => x.id === i)).filter(Boolean);

    return `<h2>Decryption sessions</h2><p class="sub">Audits decryption events and unique steganographic watermarks. Select two sessions to compare watermarks side-by-side.</p>
    
    <div class="filter-bar">
      <input type="text" id="sess-user-filter" placeholder="Filter by recipient name or ID..." value="${e(FILTERS.sessUser)}" style="width:240px">
      ${FILTERS.sessDoc ? `<div class="filter-chip">Document: <b>${e(FILTERS.sessDoc)}</b> <button class="s" style="padding:0 4px;font-size:10px" data-a="clear-sess-doc-filter">✕</button></div>` : ''}
      ${(FILTERS.sessDoc || FILTERS.sessUser) ? `<button class="s" data-a="clear-sess-filter">Clear filter (${filteredSess.length}/${s.length})</button>` : ''}
    </div>

    <div class="c wrapx"><table><tr><th></th><th>Session</th><th>Recipient</th><th>Doc</th><th>Watermark</th><th>Tx</th><th>Block</th><th>Actions</th></tr>${filteredSess.map(x => `<tr id="sess-${e(x.id)}"><td><input type="checkbox" data-a="sel" data-v="${e(x.id)}" ${SEL.includes(x.id) ? 'checked' : ''}></td><td class="m">${e(x.id)}</td><td>${e(x.name)} <span class="mu">(${e(x.user_id)})</span></td><td class="m">${e(x.doc_id)}</td><td class="m">${e(x.wm)}</td><td class="m">${e(x.txid)}</td><td>#${x.block}</td><td><button class="s" data-a="goto-ledger-block" data-block="${x.block}" data-tx="${e(x.txid)}" style="margin-right:6px">Ledger ↗</button>${ME.role === 'INVESTIGATOR' ? '<span class="mu">—</span>' : `<button class="s" data-a="leak" data-v="${e(x.id)}">Simulate leak</button>`}</td></tr>`).join('')}</table>${!filteredSess.length ? `<div style="text-align:center;padding:24px;color:var(--mu)">No decryption sessions match filter.</div>` : ''}</div>
    ${sel.length === 2 ? `<div class="c" style="border-left:4px solid var(--ac)"><div class="l" style="color:var(--ac)">Steganographic &amp; Cryptographic Comparison</div><p class="mu" style="font-size:12px;margin:2px 0 8px">Comparing two decryption events demonstrates that each recipient receives an identical visible briefing with distinct watermark IDs and distinct signed provenance records.</p><table>${['name', 'id', 'wm', 'txid', 'ts'].map(k => `<tr><td class="mu">${k}</td><td class="m">${e(sel[0][k])}</td><td class="m">${e(sel[1][k])}</td><td>${sel[0][k] === sel[1][k] ? '<span class="wr">same</span>' : '<span class="ok">differs (isolated)</span>'}</td></tr>`).join('')}</table></div>` : ''}`;
  },
  async led() {
    const [b, k] = await Promise.all([api('/ledger/blocks'), api('/ledger/keys')]);
    let blocks = b.blocks;
    if (FILTERS.ledTxType) {
      blocks = blocks.filter(blk => blk.txs.some(t => t.type === FILTERS.ledTxType));
    }

    return `<h2>Provenance ledger</h2><p class="sub">Local permissioned DLT simulator · simulated permissioned consensus (not BFT). Blocks below are from the verified majority chain.</p>
    ${OUT?.validate ? `<div class="res ${OUT.validate.ok ? 'ok' : 'er'}"><b>${OUT.validate.ok ? 'ALL VALIDATORS AGREE' : 'PROBLEM DETECTED'}</b><div class="m">height ${OUT.validate.height} · ${OUT.validate.inSync}/${OUT.validate.total} in sync${OUT.validate.nodes.filter(n => n.reason).map(n => `<br>${e(n.id)}: ${e(n.reason)}`).join('')}</div></div>` : ''}
    ${OUT?.verify ? `<div class="res ${OUT.verify.signatureValid ? 'ok' : 'er'}"><b>${OUT.verify.signatureValid ? 'SIGNATURE VALID' : 'SIGNATURE INVALID — PROVENANCE REJECTED'}</b>${OUT.verify.changed.length ? `<div class="m">presented record differs in: ${e(OUT.verify.changed.join(', '))}</div>` : ''}</div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      <button class="p" data-a="validate">Validate all validators</button>
      <div class="filter-bar" style="margin:0">
        <select id="led-type-filter">
          <option value="">All Transaction Types</option>
          <option value="PROVENANCE" ${FILTERS.ledTxType === 'PROVENANCE' ? 'selected' : ''}>PROVENANCE</option>
          <option value="AUTHORIZATION" ${FILTERS.ledTxType === 'AUTHORIZATION' ? 'selected' : ''}>AUTHORIZATION</option>
          <option value="AUTHORIZATION_REVOCATION" ${FILTERS.ledTxType === 'AUTHORIZATION_REVOCATION' ? 'selected' : ''}>AUTHORIZATION_REVOCATION</option>
          <option value="KEY_REGISTRATION" ${FILTERS.ledTxType === 'KEY_REGISTRATION' ? 'selected' : ''}>KEY_REGISTRATION</option>
          <option value="ADMIN_OPERATION" ${FILTERS.ledTxType === 'ADMIN_OPERATION' ? 'selected' : ''}>ADMIN_OPERATION</option>
        </select>
        ${FILTERS.ledTxType ? `<button class="s" data-a="clear-led-filter">Clear filter</button>` : ''}
      </div>
    </div>

    <div class="c wrapx"><div class="l">Public-key registry (from ledger)</div><table><tr><th>Key</th><th>Identity</th><th>Ver</th><th>Status</th><th>Algorithm</th></tr>${k.map(x => `<tr><td class="m">${e(x.keyId)}</td><td class="m">${e(x.identityId)}</td><td>${x.keyVersion}</td><td class="${x.status === 'ACTIVE' ? 'ok' : x.status === 'REVOKED' ? 'er' : 'wr'}">${e(x.status)}</td><td class="m mu">${e(x.algorithm)}</td></tr>`).join('')}</table></div>

    <div class="l" style="margin:16px 0 8px">Canonical Blocks on Majority Chain</div>
    ${blocks.map(x => `<div class="c ${TARGET_HIGHLIGHT && TARGET_HIGHLIGHT.block === x.idx ? 'target-highlight' : ''}" id="ledger-block-${x.idx}"><b>BLOCK #${x.idx}</b> <span class="m mu">${e(x.ts)} · approvals ${x.approvals.length} (${e(x.approvals.join(' '))})</span><div class="m mu">prev ${sh(x.prev)} → hash ${sh(x.hash)}</div>${x.txs.map(t => `<div style="border-top:1px solid var(--bd);margin-top:8px;padding-top:8px" class="m ${TARGET_HIGHLIGHT && TARGET_HIGHLIGHT.tx === t.id ? 'target-highlight' : ''}" id="tx-${e(t.id)}"><span class="tag ac">${e(t.type)}</span> <b>${e(t.id)}</b><br>${t.type === 'PROVENANCE' ? `doc ${e(t.payload.documentId)} · recipient <b>${e(t.payload.recipientId)}</b> · session <b>${e(t.payload.sessionId)}</b> · watermark <b>${e(t.payload.watermarkId)}</b><br>key ${e(t.payload.keyId)} · ${e(t.payload.signatureAlgorithm)}` : e(JSON.stringify(t.payload)).slice(0, 220)}
    ${t.type === 'PROVENANCE' && ME.role !== 'RECIPIENT' ? `<br><button class="s" data-a="vsig" data-v="${e(t.id)}" style="margin-top:4px">Verify signature</button> <button class="s" data-a="vmod" data-v="${e(t.id)}" style="margin-top:4px">Verify with recipient → REC-0217</button>` : ''}</div>`).join('')}</div>`).join('') || '<div class="c mu">No blocks match the selected transaction filter.</div>'}`;
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
    <div class="c" style="margin-bottom:20px">
      <div class="l">Ingest Leaked Evidence Artefact</div>
      <p class="mu" style="font-size:12px;margin:2px 0 12px">Supply leaked text from any source. The system performs unbiased steganographic decoding, ledger querying, and cryptographic attestation.</p>
      
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px">
        <!-- Direct Text Paste Input -->
        <div style="background:var(--pn-elevated);padding:14px;border-radius:4px;border:1px solid var(--bd)">
          <div class="l" style="margin-bottom:6px">Option 1: Paste Text Artefact</div>
          <input id="inv-label" placeholder="Evidence label (e.g. pastebin-leak-01)" maxlength="80" style="width:100%;margin-bottom:8px">
          <textarea id="inv-text" rows="4" style="width:100%;margin-bottom:8px" placeholder="Paste suspected leaked text containing zero-width marks..."></textarea>
          <button class="p s" data-a="paste-inv" style="width:100%">Analyse Pasted Text</button>
        </div>

          <!-- File Upload -->
          <div style="background:var(--pn-elevated);padding:14px;border-radius:4px;border:1px solid var(--bd)">
            <div class="l" style="margin-bottom:6px">Option 2: Upload File</div>
            <p class="mu" style="font-size:11.5px;margin:0 0 10px">Upload an intercepted \`.txt\` document file (up to 500 KB).</p>
            <input type="file" id="f" accept=".txt,text/plain" style="margin-bottom:10px;width:100%">
            <button class="s" data-a="upl" style="width:100%">Analyse Uploaded File</button>
          </div>
      </div>

      <!-- Simulated Leaks Catalog -->
      <hr style="border-color:var(--bd);margin:16px 0">
      <div class="l" style="margin-bottom:6px">Option 3: Select Simulated Leak from System Sessions</div>
      ${l.map(x => `<div class="m" style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);padding:6px 10px;border-radius:3px;margin:4px 0"><span><b>${e(x.id)}</b> · ${e(x.ts)} · <span class="mu">${x.bytes} chars</span></span><button class="p s" data-a="run" data-v="${e(x.id)}">Investigate</button></div>`).join('') || '<span class="mu">No simulated leaks active. A recipient or sender can simulate a leak from the Sessions tab.</span>'}
    </div>

    ${r ? `<div class="res ${r.attributionStatus === 'VERIFIED_PROVENANCE_MATCH' ? 'ok' : r.attributionStatus === 'NO_ATTRIBUTION' ? 'wr' : 'er'}"><div style="display:flex;justify-content:space-between;align-items:center"><div class="l">${e(r.id)} · ${e(r.label)}</div><div style="display:flex;gap:8px;align-items:center">${r.extractionStatus ? `<span class="tag ${r.extractionStatus === 'WATERMARK_FOUND' ? 'ok' : 'wr'}">${e(r.extractionStatus)}</span>` : ''}${r.blockId !== null ? `<button class="p s" data-a="goto-ledger-block" data-block="${r.blockId}" data-tx="${e(r.transactionId)}">🔗 Inspect on Ledger (#${r.blockId})</button>` : ''}</div></div><div class="n" style="font-size:22px">${e(r.attributionStatus.replace(/_/g, ' '))}</div><p>${e(r.statement)}</p>
    <div>${r.steps.map(s => `<div class="st">${s.ok ? '<span class="ok">✓</span>' : '<span class="er">✗</span>'} <span>${e(s.name)} <span class="m mu">${e(s.detail)}</span></span></div>`).join('')}</div>
    ${r.provenanceFound ? `<div class="ch">${[['Leaked artefact', r.label, 'a'], ['Watermark', r.watermarkId, 'w'], ['Ledger transaction', r.transactionId, 't'], ['Block', '#' + r.blockId, 'b'], ['Session', r.sessionId, 's'], ['Recipient', r.recipientId + ' ' + r.recipientName, 'r'], ['Historical public key', r.keyId + ' v' + r.keyVersion, 'k'], ['Signature', r.signatureValid ? 'VALID' : 'INVALID', 'g'], ['Chain + validators', r.ledgerValid ? 'VALID' : 'INVALID', 'h']].map(([a, b, k], x) => `${x ? '<div class="ln"></div>' : ''}<div class="c" data-a="ev" data-v="${k}"><div class="l">${a}</div><div class="m ${b === 'INVALID' ? 'er' : b === 'VALID' ? 'ok' : ''}">${e(b)}</div></div>`).join('')}</div><pre id="evd">Click a node in the chain to inspect its evidence.</pre>` : ''}</div>` : ''}
    <div class="c wrapx"><div class="l">Investigation history (persisted)</div><table><tr><th>ID</th><th>Watermark Status</th><th>Attribution Verdict</th><th>Investigated At</th></tr>${i.map(x => `<tr><td class="m">${e(x.id)}</td><td class="m">${x.watermarkRecovered ? e(x.watermarkId) : (x.extractionStatus || 'no watermark')}</td><td><span class="tag ${x.attributionStatus === 'VERIFIED_PROVENANCE_MATCH' ? 'ok' : x.attributionStatus === 'NO_ATTRIBUTION' ? 'wr' : 'er'}">${e(x.attributionStatus.replace(/_/g, ' '))}</span></td><td class="m mu">${e(x.ts)}</td></tr>`).join('')}</table></div>`;
  },
  async id() {
    const k = await api('/identities'), A = ME.role === 'ADMIN';
    const users = A ? await api('/users') : null;
    let filteredUsers = users;
    if (A && users && FILTERS.userRole) {
      filteredUsers = filteredUsers.filter(u => u.role === FILTERS.userRole);
    }

    return `<h2>Cryptographic identities &amp; access control</h2><p class="sub">Signing: ML-DSA-65 (simulated). Key establishment: ML-KEM-768 (simulated). Private keys are sealed and never returned by the API.</p>

    ${A && users ? `
    <div style="display:flex;justify-content:space-between;align-items:center;margin:24px 0 12px">
      <div>
        <h3 style="margin:0;font-size:16px">User accounts &amp; access governance</h3>
        <p class="mu" style="margin:2px 0 0;font-size:12px">Manage active identities across SENDER, RECIPIENT, INVESTIGATOR, and ADMIN operational roles.</p>
      </div>
      <button class="p s" data-a="show-create-user" id="btn-toggle-create-user">+ Provision New Account</button>
    </div>

    <div class="c" id="create-user-card" style="display:${OUT?.showCreateUser ? 'block' : 'none'};margin-bottom:20px;border-left:4px solid var(--ac)">
      <div class="l" style="color:var(--ac)">Provision Operator Account</div>
      <p class="mu" style="font-size:12px;margin:4px 0 14px">Generate a new cryptographic identity with auto-derived ML-DSA-65 signing keys and ML-KEM-768 encapsulation keys.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:12px">
        <div>
          <label class="l">Full Name</label>
          <input id="un" placeholder="e.g. Major Vikram Singh" maxlength="100" style="width:100%">
        </div>
        <div>
          <label class="l">Username</label>
          <input id="uu" placeholder="e.g. vikram" maxlength="32" style="width:100%">
        </div>
        <div>
          <label class="l">Security Role</label>
          <select id="ur" style="width:100%">
            <option value="RECIPIENT">RECIPIENT (Decrypt briefs &amp; watermark)</option>
            <option value="SENDER">SENDER (Classify, encrypt &amp; anchor)</option>
            <option value="INVESTIGATOR">INVESTIGATOR (Forensic analysis)</option>
            <option value="ADMIN">ADMIN (System governance &amp; consensus)</option>
          </select>
        </div>
        <div>
          <label class="l">Initial Password</label>
          <input id="up" type="password" placeholder="Min 8 characters" maxlength="128" style="width:100%">
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="p" data-a="createuser">Create Operator Account</button>
        <button class="s" data-a="cancel-create-user">Cancel</button>
      </div>
    </div>

    <div class="filter-bar">
      <select id="user-role-filter">
        <option value="">All Roles</option>
        <option value="RECIPIENT" ${FILTERS.userRole === 'RECIPIENT' ? 'selected' : ''}>RECIPIENT</option>
        <option value="SENDER" ${FILTERS.userRole === 'SENDER' ? 'selected' : ''}>SENDER</option>
        <option value="INVESTIGATOR" ${FILTERS.userRole === 'INVESTIGATOR' ? 'selected' : ''}>INVESTIGATOR</option>
        <option value="ADMIN" ${FILTERS.userRole === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
      </select>
      ${FILTERS.userRole ? `<button class="s" data-a="clear-user-filter">Clear filter (${filteredUsers.length}/${users.length})</button>` : ''}
    </div>

    <div class="c wrapx" style="margin-bottom:28px">
      <div class="l">System User Directory</div>
      <table>
        <tr><th>User ID</th><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Provisioned</th><th>Actions</th></tr>
        ${filteredUsers.map(u => `
          <tr>
            <td class="m">${e(u.id)}</td>
            <td><b>${e(u.name)}</b></td>
            <td class="m mu">${e(u.username)}</td>
            <td><span class="user-role-badge user-role-${e(u.role)}">${e(u.role)}</span></td>
            <td><span class="tag ${u.status === 'ACTIVE' ? 'ok' : 'er'}">${e(u.status)}</span></td>
            <td class="m mu">${e(u.created ? u.created.slice(0, 19).replace('T', ' ') : '—')}</td>
            <td>
              ${u.id !== ME.id ? `<button class="s ${u.status === 'ACTIVE' ? 'd' : ''}" data-a="toggleuser" data-v="${e(u.id)}">${u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>` : '<span class="mu m" style="font-size:11px">Current session</span>'}
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
    ` : ''}

    <div class="l" style="margin:16px 0 8px">Registered Public Keys on Ledger</div>
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

function isMobile() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  const isMobileUA = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
  const isMobileScreen = window.innerWidth <= 800 || (window.screen && window.screen.width <= 800);
  return isMobileUA || (isMobileScreen && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
}

let lastMobileState = isMobile();
window.addEventListener('resize', () => {
  const cur = isMobile();
  if (cur !== lastMobileState) {
    lastMobileState = cur;
    draw();
  }
});
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    lastMobileState = isMobile();
    draw();
  }, 100);
});

let HIW_PLAY_MODE = 'hero'; // 'hero' | 'story' | 'explore'
let HIW_SHOW_TECH = false;
let HIW_SHOW_HELP = null;

const GLOSSARY = {
  'AES-256-GCM': { title: 'What is AES-256-GCM?', text: 'The industry-standard symmetric cipher that encrypts the actual contents of the document so nobody without the key can read it.' },
  'ML-KEM-768': { title: 'What is ML-KEM-768?', text: 'A post-quantum key encapsulation algorithm (simulated in this prototype) used to establish a unique secure key for each recipient.' },
  'QUORUM': { title: 'What is Quorum?', text: 'The minimum threshold of independent validator nodes (at least 3 out of 5) that must verify and approve an event before it is permanently committed.' },
  'PROVENANCE': { title: 'What is Provenance?', text: 'Cryptographic proof linking an artifact to the exact person, session, and timestamp that created or decrypted it.' },
  'WATERMARK': { title: 'What is the Watermark?', text: 'An invisible identifier embedded using zero-width characters into the document representation so leaks can be traced without altering visible text.' },
  'LEDGER': { title: 'What is the Ledger?', text: 'An immutable, append-only history maintained independently across 5 validator nodes that cannot be silently modified or erased.' }
};

const STORY_STAGES = [
  {
    step: '01',
    name: 'PROTECT',
    title: 'Protect the Document',
    subtitle: 'The document is encrypted before it leaves the system.',
    explanation: 'The sender starts with Project_Alpha.pdf. The system generates a single-use content key and locks the document contents so only approved parties can open it.',
    node: 'doc',
    tech: 'AES-256-GCM (Authenticated Encryption) + SHA-256 Content Hash',
    term: 'AES-256-GCM',
    artifact: 'Project_Alpha.pdf',
    badge: 'CLASSIFIED · CONFIDENTIAL',
    graphic: `<div class="hiw-doc-artifact"><div class="hiw-doc-badge">CONFIDENTIAL</div><b>Project_Alpha.pdf</b><br><span class="mu">Status:</span> Encrypted payload bound to AAD<br><span class="mu">Cipher:</span> AES-256-GCM (32-byte key)</div>`
  },
  {
    step: '02',
    name: 'AUTHORIZE',
    title: 'Recipient Authorization',
    subtitle: 'The system records that this recipient is authorized to access the document.',
    explanation: 'The system prepares an individual key capsule for Recipient A (Aarav Sharma). Even if someone else intercepts the document, they cannot decrypt it.',
    node: 'auth',
    tech: 'ML-KEM-768 Encapsulation + SENDER-signed AUTHORIZATION Transaction',
    term: 'ML-KEM-768',
    artifact: 'Authorization Capsule',
    badge: 'BOUND TO RECIPIENT A',
    graphic: `<div class="hiw-doc-artifact"><div class="hiw-doc-badge">AUTHORIZED</div><b>Recipient A (Aarav Sharma)</b><br><span class="mu">Capsule:</span> kem_ct established via ML-KEM-768<br><span class="mu">Transaction:</span> AUT-0019 signed by Commander Arjun</div>`
  },
  {
    step: '03',
    name: 'VALIDATE',
    title: 'Validator Network Consensus',
    subtitle: 'Before this event is recorded, multiple independent validator nodes verify it.',
    explanation: 'Five separate validator nodes independently check the sender signature and authorization rules. At least 3 must agree to achieve quorum.',
    node: 'cons',
    tech: '5-Node Permissioned DLT Consensus · Ed25519 Block Approvals',
    term: 'QUORUM',
    artifact: 'Consensus Quorum',
    badge: 'QUORUM: 5 / 5 APPROVED',
    graphic: `<div class="hiw-val-tally"><div class="hiw-tally-score">5 / 5</div><div class="hiw-tally-bar"><div class="hiw-tally-fill" style="width:100%"></div></div><span class="tag ok">QUORUM REACHED (>= 3/5)</span></div>`
  },
  {
    step: '04',
    name: 'RECORD',
    title: 'Committed to Ledger',
    subtitle: 'The event is now part of the system’s recorded history.',
    explanation: 'The authorization is permanently anchored inside an immutable block. No administrator or user can erase this record without breaking chain continuity.',
    node: 'cons',
    tech: 'Append-Only Ledger · Hash Continuity · Independent SQLite Storage',
    term: 'LEDGER',
    artifact: 'Block #002',
    badge: 'IMMUTABLE RECORD',
    graphic: `<div class="hiw-doc-artifact"><div class="hiw-doc-badge">COMMITTED</div><b>Block #002 · Tx TX-7A2F</b><br><span class="mu">Previous Hash:</span> 8f29... unbroken chain link<br><span class="mu">Status:</span> Anchored across NODE-01..05</div>`
  },
  {
    step: '05',
    name: 'DECRYPT',
    title: 'Authorized Decryption',
    subtitle: 'Because the recipient is authorized, the protected document can now be recovered.',
    explanation: 'Recipient A unlocks their personal key with their credentials, decrypts the session key, and views the plaintext operational briefing.',
    node: 'dec',
    tech: 'ML-KEM-768 Decapsulation + AES-256-GCM Authenticated Decryption',
    term: 'AES-256-GCM',
    artifact: 'Plaintext Briefing',
    badge: 'SESSION SES-0192',
    graphic: `<div class="hiw-doc-artifact"><div class="hiw-doc-badge">DECRYPTED</div><b>PROJECT ALPHA — OPERATIONAL BRIEF</b><br><span class="mu">Recipient:</span> Aarav Sharma (REC-0192)<br><span class="mu">Session ID:</span> SES-8B1A2C3D</div>`
  },
  {
    step: '06',
    name: 'PROVENANCE',
    title: 'Provenance & Forensic Watermark',
    subtitle: 'The system creates indelible provenance evidence associated with the decrypted copy.',
    explanation: 'An invisible watermark is woven into the text using zero-width characters. A cryptographic provenance record signed by the recipient is anchored to the ledger.',
    node: 'wm',
    tech: 'Zero-Width Steganography + ML-DSA-65 Recipient Signature',
    term: 'WATERMARK',
    artifact: 'Marked Artifact',
    badge: 'WM-8F29C01B4D7E5A23',
    graphic: `<div class="hiw-doc-artifact"><div class="hiw-doc-badge">WATERMARKED</div><b>Hidden Signal Injected:</b><br><span class="mu">Identifier:</span> WM-8F29C01B4D7E5A23<br><span class="mu">Signed Proof:</span> ML-DSA-65 signature committed to ledger</div>`
  },
  {
    step: '07',
    name: 'LEAK',
    title: 'What If The Document Is Leaked?',
    subtitle: 'A copy of the document appears on an unauthorized channel or external website.',
    explanation: 'An investigator receives only an anonymous leaked text file. There is no recipient label and no database hint. How does the system prove where it came from?',
    node: 'leak',
    tech: 'Unbiased Forensic Ingestion · Raw Byte Stream Analysis',
    term: 'PROVENANCE',
    artifact: 'Leaked_Alpha_Leak.txt',
    badge: 'SUSPECT UNKNOWN',
    graphic: `<div class="hiw-leak-banner"><div class="hiw-leak-title">⚠️ UNIDENTIFIED LEAK DETECTED</div><div class="hiw-leak-sub">A leaked copy of Project Alpha has been discovered. Can the system mathematically trace this back to the exact recipient without guessing?</div><button class="hiw-hero-btn primary" data-a="hiw-trace" style="margin:0 auto">▶ Trace This Document</button></div>`
  }
];

const FORENSIC_STAGES = [
  {
    step: '01',
    name: 'ARTEFACT',
    title: 'Leaked Artifact Ingestion',
    subtitle: 'The investigator starts with nothing except the leaked text file.',
    explanation: 'No recipient is pre-selected and no assumptions are made. The investigator uploads the leaked file directly into the forensic engine.',
    tech: 'Arbitrary Text Stream Ingestion (up to 500,000 characters)',
    proof: 'Raw character payload parsed for invisible signal'
  },
  {
    step: '02',
    name: 'WATERMARK',
    title: 'Watermark Signal Detected',
    subtitle: 'Invisible zero-width Unicode characters are recovered and decoded.',
    explanation: 'Even though the visible text looks identical to normal typing, the decoder extracts the hidden zero-width bits and validates their SHA-256 checksum.',
    tech: 'Regex Extraction · Binary ASCII Recovery · Checksum Parity',
    proof: 'Recovered Watermark ID: WM-8F29C01B4D7E5A23 (Valid Checksum)'
  },
  {
    step: '03',
    name: 'LEDGER SEARCH',
    title: 'Search Recorded History',
    subtitle: 'The watermark is looked up across the 5 independent validator databases.',
    explanation: 'The system does not trust the application database; it queries the canonical distributed ledger chain where history cannot be manipulated.',
    tech: 'Multi-Node DLT Search across verified majority blocks',
    proof: 'Located PROVENANCE transaction inside Block #003'
  },
  {
    step: '04',
    name: 'HISTORICAL KEY',
    title: 'Resolve Historical Key',
    subtitle: 'The public key registered at the time of decryption is retrieved.',
    explanation: 'Even if the recipient later rotated or revoked their cryptographic key, their historical key registered on the ledger remains on record.',
    tech: 'Public Key Registry (Proof of Possession + Rotation History)',
    proof: 'Identity: CID-0192 · Key: KEY-0192-V1'
  },
  {
    step: '05',
    name: 'VERIFY SIG',
    title: 'Verify Cryptographic Signature',
    subtitle: 'The recipient’s digital signature over the session record is validated.',
    explanation: 'Mathematical proof that Recipient A’s private key signed the exact document hash, session ID, and watermark ID.',
    tech: 'ML-DSA-65 (simulated ECDSA-P256) Signature Verification',
    proof: 'sigVerify(pub, canonicalRecord, sig) === TRUE'
  },
  {
    step: '06',
    name: 'VERIFY CHAIN',
    title: 'Verify Block Continuity & Consensus',
    subtitle: 'The block containing the transaction is checked for validator quorum.',
    explanation: 'Confirms that the block hash matches, previous hash links are continuous, and independent validator approvals (>= 3/5) are valid.',
    tech: 'SHA-256 Block Continuity · Ed25519 Validator Signatures',
    proof: 'Block #003: 5/5 valid validator approvals'
  },
  {
    step: '07',
    name: 'ATTRIBUTION',
    title: 'Forensic Attribution Verdict',
    subtitle: 'Mathematical proof links the leak directly to the decryption session.',
    explanation: 'The system renders VERIFIED_PROVENANCE_MATCH. The evidence chain is complete from leaked text to recipient identity.',
    tech: 'Multi-Stage Mathematical Proof Construction',
    proof: 'ATTRIBUTION: Aarav Sharma (REC-0192) · Decryption Session SES-0192'
  }
];

async function draw() {
  const A = $('app');
  if (isMobile()) {
    A.innerHTML = `<div class="login" style="max-width:440px;text-align:center"><div class="l" style="color:var(--er);margin-bottom:8px">SECURITY ENCLAVE · ACCESS RESTRICTED</div><h2>DESKTOP WORKSTATION REQUIRED</h2><p class="sub" style="margin-top:10px;line-height:1.6">The <b>SIH26237 Cryptographic Decryption Provenance & Attribution System</b> is restricted to authorized defense terminal consoles and desktop workstations.<br><br>Mobile devices, handsets, and handheld web browsers are strictly disallowed by enclave security policy.</p><div class="c" style="text-align:left;font-size:12px;margin:16px 0"><div class="l">Terminal Diagnostics</div><div class="m mu">CLIENT_AGENT: ${e(navigator.userAgent.slice(0, 70))}…<br>SECURITY_POLICY: DESKTOP_ENCLAVE_ONLY<br>STATUS: ACCESS_DENIED</div></div><p class="mu m" style="font-size:11px">Please access this console from an authorized workstation terminal.</p></div>`;
    return;
  }

  // --- PUBLIC UNAUTHENTICATED EXPERIENCE ---
  if (!ME) {
    if (PUB_VIEW === 'how') {
      A.innerHTML = renderPublicHowItWorks();
      return;
    }

    const PRESETS = [
      ['sender', 'Commander Arjun (SENDER)'],
      ['aarav', 'Aarav Sharma (RECIPIENT)'],
      ['riya', 'Riya Mehta (RECIPIENT)'],
      ['kabir', 'Kabir Rao (RECIPIENT)'],
      ['nisha', 'Nisha Nair (UNAUTHORIZED)'],
      ['forensic', 'Forensic Officer (INVESTIGATOR)'],
      ['admin', 'System Administrator (ADMIN)']
    ];
    let defaultU = 'sender';
    let defaultP = 'demo1234';
    let demoLoginBanner = '';
    if (DEMO_SESSION_ID && DEMO_DATA) {
      const s = DEMO_DATA.step;
      if (s >= 16 && s <= 18) {
        defaultU = DEMO_DATA.actors?.recipient?.username || 'aarav';
        defaultP = s === 16 ? '' : (DEMO_DATA.actors?.recipient?.password || 'demo1234');
        demoLoginBanner = `<div style="background:rgba(56,189,248,0.12);border:1px solid var(--ac-border);border-radius:6px;padding:8px 12px;margin-bottom:14px;display:flex;align-items:center;gap:8px">
          <span class="tag ac" style="font-weight:700">RECIPIENT TERMINAL</span>
          <span style="font-size:12px;color:var(--tx)">Officer Aarav Sharma (Authorized Reader)</span>
        </div>`;
      } else if (s >= 26 && s <= 28) {
        defaultU = DEMO_DATA.actors?.investigator?.username || 'forensic';
        defaultP = s === 26 ? '' : (DEMO_DATA.actors?.investigator?.password || 'demo1234');
        demoLoginBanner = `<div style="background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.35);border-radius:6px;padding:8px 12px;margin-bottom:14px;display:flex;align-items:center;gap:8px">
          <span class="tag" style="background:rgba(168,85,247,0.2);color:#c084fc;border-color:rgba(168,85,247,0.4);font-weight:700">FORENSIC LAB TERMINAL</span>
          <span style="font-size:12px;color:var(--tx)">Inspector Morse (Forensic Auditor)</span>
        </div>`;
      } else if (s <= 3) {
        defaultU = DEMO_DATA.actors?.sender?.username || 'sender';
        defaultP = s === 1 ? '' : (DEMO_DATA.actors?.sender?.password || 'demo1234');
        demoLoginBanner = `<div style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.35);border-radius:6px;padding:8px 12px;margin-bottom:14px;display:flex;align-items:center;gap:8px">
          <span class="tag ok" style="font-weight:700">SENDER CONSOLE</span>
          <span style="font-size:12px;color:var(--tx)">Commander Arjun (Classified Brief Author)</span>
        </div>`;
      }
    }

    A.innerHTML = `<div class="login">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap">
        <div class="l" style="color:var(--ac);margin:0">SIH26237 · CRYPTOGRAPHIC PROVENANCE</div>
        <div style="display:flex;gap:6px">
          <button type="button" class="s p" data-a="start-demo" style="font-weight:700">Watch Live Demo ⚡</button>
          <button type="button" class="s" data-a="pub-how" style="color:var(--ac);border-color:var(--ac-border)">How It Works ▶</button>
        </div>
      </div>
      <h2>PROVENANCE</h2>
      <p class="sub">Decryption Attribution &amp; Forensic Integrity</p>

      <div style="display:flex;gap:8px;margin-bottom:14px;border-bottom:1px solid var(--bd-light);padding-bottom:10px">
        <button type="button" class="${PUB_VIEW === 'register' ? 's' : 'p'}" data-a="switch-auth-tab" data-v="login" style="flex:1">Sign In</button>
        <button type="button" class="${PUB_VIEW === 'register' ? 'p' : 's'}" data-a="switch-auth-tab" data-v="register" style="flex:1">Register Account</button>
      </div>

      ${PUB_VIEW === 'register' ? `
        <div class="l" style="margin-bottom:6px">Register New Personnel Identity</div>
        <input id="reg-name" placeholder="Full Name (e.g. Elena Rostova)" autocomplete="name">
        <input id="reg-username" placeholder="Username (e.g. elena)" autocomplete="username">
        <select id="reg-role" style="width:100%;margin-bottom:10px;padding:8px;background:var(--pn-elevated);color:var(--tx);border:1px solid var(--bd-light);border-radius:4px">
          <option value="RECIPIENT">RECIPIENT (Authorized to Decrypt)</option>
          <option value="SENDER">SENDER (Classified Brief Author)</option>
          <option value="INVESTIGATOR">INVESTIGATOR (Forensic Analysis)</option>
        </select>
        <input id="reg-password" type="password" placeholder="Password (min 8 chars)" autocomplete="new-password">
        <input id="reg-confirm" type="password" placeholder="Confirm Password" autocomplete="new-password">
        <button class="p" data-a="register" style="width:100%;margin-top:6px">Register &amp; Generate Identity</button>
        <p class="mu" style="font-size:11px;margin-top:10px;line-height:1.4">Generates your cryptographic identity, registers public keys on the permissioned ledger, and establishes your private KEK envelope.</p>
      ` : `
        ${demoLoginBanner}
        <input id="u" placeholder="username" autocomplete="username" value="${e(defaultU)}">
        <input id="p" type="password" placeholder="password" autocomplete="current-password" value="${e(defaultP)}">
        <button class="p" data-a="login" style="width:100%;margin-top:6px">Authenticate</button>
        <div class="l" style="margin:16px 0 6px">Quick login presets</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">
          ${PRESETS.map(([u, lbl]) => `<button type="button" class="s" data-a="fill" data-v="${e(u)}" title="${e(lbl)}">${e(u)}</button>`).join('')}
        </div>
        <button data-a="reset" style="width:100%">Reset demo environment</button>
      `}
      ${DEMO_SHOW_MODAL ? `
        <div class="demo-mode-modal-backdrop" data-a="close-demo-prompt">
          <div class="demo-mode-card" data-a="demo-card-no-close">
            <div class="l" style="color:var(--ac);margin-bottom:6px">AUTOMATED APPLICATION DEMONSTRATION</div>
            <h3 style="margin:0 0 10px;font-size:19px">Choose Demonstration Mode</h3>
            <p class="mu" style="font-size:13px;line-height:1.5;margin-bottom:16px">
              Executes the genuine SIH26237 defense provenance pipeline across SENDER, RECIPIENT, and INVESTIGATOR roles using a temporary isolated memory enclave. Zero demo data persists.
            </p>

            <button type="button" class="demo-mode-option" data-a="start-demo-mode" data-v="guided">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <h4 style="color:var(--ac)">▶ AUTO DEMO</h4>
                <span class="tag ok" style="font-size:10.5px">Automated (8s / Step)</span>
              </div>
              <p>Performs real operations automatically, pausing briefly at meaningful stages. You can pause/resume or manually advance at any time.</p>
            </button>

            <button type="button" class="demo-mode-option" data-a="start-demo-mode" data-v="self">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <h4>👤 STEP-BY-STEP</h4>
                <span class="tag" style="font-size:10.5px">Manual Advance</span>
              </div>
              <p>Executes the same real operations step by step, waiting for you to press Next. Back is available to review preceding steps.</p>
            </button>

            <div style="display:flex;justify-content:flex-end;margin-top:20px">
              <button type="button" class="s" data-a="close-demo-prompt">Cancel</button>
            </div>
          </div>
        </div>
      ` : ''}
    </div>`;

    if (DEMO_SESSION_ID && DEMO_DATA) {
      renderDemoSpotlight();
    } else {
      removeDemoSpotlight();
    }
    return;
  }

  // --- AUTHENTICATED EXPERIENCE ---
  if (!ME || !ME.role || !NAV[ME.role]) {
    if (ME) signout();
    return;
  }
  const nav = NAV[ME.role]; if (!nav.some(n => n[0] === V)) V = 'dash';
  if (!ENV) {
    try { ENV = await api('/environment'); } catch { ENV = { mode: 'DEMO', isDemo: true, deploymentProfile: 'LOCAL', crypto: { signatureAlgorithm: 'ECDSA P-256 (Development)', kemAlgorithm: 'Demo Provider' }, ledger: { provider: 'Local Permissioned DLT' } }; }
  }
  let body;
  try {
    body = await VIEW[V]();
  } catch (x) {
    body = `<div class="res er">${e(x.message)}</div>`;
  }
  if (!ME) return; // If 401 occurred inside VIEW[V](), signout() already triggered draw() for login view
  const timeStr = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const modeBadge = ENV?.mode === 'PRODUCTION' ? '<span class="chip" style="color:var(--ok);border-color:var(--ok);background:rgba(34,197,94,0.1)">PRODUCTION MODE</span>' : '<span class="chip">DEMO MODE</span>';
  const deployBadge = `<span class="chip" style="color:var(--ac);border-color:var(--ac-border)">DEPLOYMENT: ${e(ENV?.deploymentProfile || 'LOCAL')}</span>`;
  const cryptoBadge = ENV?.crypto?.isPostQuantum
    ? `<span class="chip a" style="color:var(--ok);border-color:var(--ok)">CRYPTO: ${e(ENV.crypto.signatureAlgorithm)}</span>`
    : `<span class="chip a" title="${e(ENV?.crypto?.details || '')}">CRYPTO: ${e(ENV?.crypto?.signatureAlgorithm || 'Development Provider')}</span>`;
  const ledgerBadge = `<span class="chip" style="color:var(--mu)" title="${e(ENV?.ledger?.details || '')}">LEDGER: ${e(ENV?.ledger?.provider || 'Permissioned DLT')}</span>`;
  A.innerHTML = `<aside><h1>PROVENANCE</h1>${nav.map(n => `<button class="nv ${V === n[0] ? 'on' : ''}" data-a="nav" data-v="${n[0]}">${n[1]}</button>`).join('')}</aside><main><div class="top">${modeBadge}${deployBadge}${cryptoBadge}${ledgerBadge}<span class="chip" style="color:var(--tx);border-color:var(--bd-light);background:var(--pn-elevated)"><span style="display:inline-block;width:6px;height:6px;background:var(--ok);border-radius:50%;margin-right:6px;box-shadow:0 0 6px var(--ok)"></span><span id="live-clock" class="m">${timeStr}</span></span><span style="flex:1"></span><span>${e(ME?.name || '')} <span class="mu m">${e(ME?.id || '')} · ${e(ME?.role || '')}</span></span><button class="s" data-a="tour-start" title="Replay Guided Walkthrough">Tour 🧭</button><button class="s" data-a="show-change-pw">Key &amp; Password</button><button data-a="logout">Sign out</button></div>${OUT?.showChangePw ? `
  <div class="c" style="margin-bottom:20px;border-left:4px solid var(--ac)">
    <div class="l" style="color:var(--ac)">Change Password &amp; Re-Seal Private Key Envelopes</div>
    <p class="mu" style="font-size:12px;margin:4px 0 12px">Re-derives your scrypt Key Encryption Key (KEK) and re-encrypts all your signing &amp; KEM private keys under your new secret. All previous login sessions are invalidated.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
      <input type="password" id="cur-pw" placeholder="Current password" style="width:200px">
      <input type="password" id="new-pw" placeholder="New password (min 8 chars)" style="width:220px">
      <input type="password" id="cfm-pw" placeholder="Confirm new password" style="width:220px">
    </div>
    <div style="display:flex;gap:8px">
      <button class="p s" data-a="submit-change-pw">Update &amp; Re-Seal Keys</button>
      <button class="s" data-a="cancel-change-pw">Cancel</button>
    </div>
  </div>` : ''}${body}</main>`;

  if (DEMO_SESSION_ID && DEMO_DATA) {
    renderDemoSpotlight();
  } else {
    removeDemoSpotlight();
  }

  if (TOUR_MODAL || TOUR_ACTIVE) {
    renderTour();
  }

  if (TARGET_HIGHLIGHT && V === 'led') {
    setTimeout(() => {
      const el = $(`ledger-block-${TARGET_HIGHLIGHT.block}`) || $(`tx-${TARGET_HIGHLIGHT.tx}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }
}

let DEMO_SPOTLIGHT_TARGET_SEL = null;
let DEMO_SPOTLIGHT_FALLBACK_SEL = null;
let DEMO_SPOTLIGHT_META = null;
let DEMO_SPOTLIGHT_REPOSITION_BOUND = false;

function updateSpotlightPosition() {
  const root = $('demo-spotlight-root');
  if (!root || !DEMO_SPOTLIGHT_TARGET_SEL) return;

  let el = document.querySelector(DEMO_SPOTLIGHT_TARGET_SEL);
  if (!el && DEMO_SPOTLIGHT_FALLBACK_SEL) el = document.querySelector(DEMO_SPOTLIGHT_FALLBACK_SEL);
  if (!el) el = document.querySelector('main');
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobile = vw <= 768;
  const margin = isMobile ? 8 : 14;

  const cutout = root.querySelector('.demo-spotlight-cutout');
  const pill = root.querySelector('.demo-spotlight-pill');
  if (!cutout || !pill) return;

  // Position cutout smoothly around target using fixed viewport coordinates
  cutout.style.top = `${rect.top - 4}px`;
  cutout.style.left = `${Math.max(0, rect.left - 4)}px`;
  cutout.style.width = `${Math.min(vw, rect.width + 8)}px`;
  cutout.style.height = `${rect.height + 8}px`;

  if (isMobile) {
    // Docked at bottom of screen on mobile so it never obscures the target or expands horizontal scroll
    pill.style.position = 'fixed';
    pill.style.top = 'auto';
    pill.style.bottom = '12px';
    pill.style.left = '12px';
    pill.style.right = '12px';
    pill.style.width = 'calc(100vw - 24px)';
    pill.style.maxWidth = 'calc(100vw - 24px)';
    return;
  }

  // Desktop / Tablet dynamic floating calculation using fixed viewport coordinates
  pill.style.position = 'fixed';
  pill.style.bottom = 'auto';
  pill.style.right = 'auto';
  const pillWidth = Math.min(360, Math.max(280, vw - 40));
  pill.style.width = `${pillWidth}px`;
  pill.style.maxWidth = `${pillWidth}px`;
  const estimatedPillHeight = pill.offsetHeight || 160;

  const roomRight = vw - rect.right;
  const roomLeft = rect.left;
  const roomBelow = vh - rect.bottom;
  const roomAbove = rect.top;

  let pillLeft = 20;
  let pillTop = 80;
  const isWideTarget = rect.width > vw * 0.65;

  if (roomRight >= pillWidth + margin + 12 && !isWideTarget) {
    pillLeft = rect.right + margin;
    const idealTop = (rect.top + rect.height / 2) - estimatedPillHeight / 2;
    pillTop = Math.max(70, Math.min(vh - estimatedPillHeight - 20, idealTop));
  } else if (roomLeft >= pillWidth + margin + 12 && !isWideTarget) {
    pillLeft = rect.left - pillWidth - margin;
    const idealTop = (rect.top + rect.height / 2) - estimatedPillHeight / 2;
    pillTop = Math.max(70, Math.min(vh - estimatedPillHeight - 20, idealTop));
  } else if (roomBelow >= estimatedPillHeight + margin + 10) {
    pillTop = rect.bottom + margin;
    const idealLeft = (rect.left + rect.width / 2) - pillWidth / 2;
    pillLeft = Math.max(16, Math.min(vw - pillWidth - 16, idealLeft));
  } else if (roomAbove >= estimatedPillHeight + margin + 10) {
    pillTop = rect.top - estimatedPillHeight - margin;
    const idealLeft = (rect.left + rect.width / 2) - pillWidth / 2;
    pillLeft = Math.max(16, Math.min(vw - pillWidth - 16, idealLeft));
  } else {
    pillLeft = Math.max(16, vw - pillWidth - 24);
    pillTop = Math.max(75, Math.min(vh - estimatedPillHeight - 24, rect.top + 16));
  }

  pill.style.top = `${pillTop}px`;
  pill.style.left = `${pillLeft}px`;
}

function ensureSpotlightListeners() {
  if (DEMO_SPOTLIGHT_REPOSITION_BOUND) return;
  DEMO_SPOTLIGHT_REPOSITION_BOUND = true;
  window.addEventListener('resize', () => {
    if (DEMO_SESSION_ID && DEMO_SPOTLIGHT_TARGET_SEL) updateSpotlightPosition();
  }, { passive: true });
  window.addEventListener('scroll', () => {
    if (DEMO_SESSION_ID && DEMO_SPOTLIGHT_TARGET_SEL) updateSpotlightPosition();
  }, { passive: true });
}

function removeDemoSpotlight() {
  DEMO_SPOTLIGHT_TARGET_SEL = null;
  DEMO_SPOTLIGHT_FALLBACK_SEL = null;
  DEMO_SPOTLIGHT_META = null;
  const old = $('demo-spotlight-root');
  if (old) old.remove();
  document.querySelectorAll('.demo-focused-target').forEach(n => n.classList.remove('demo-focused-target'));
}

function focusElement(selector, fallbackSelector, meta = {}) {
  document.querySelectorAll('.demo-focused-target').forEach(n => n.classList.remove('demo-focused-target'));
  if (!selector) {
    removeDemoSpotlight();
    return;
  }

  ensureSpotlightListeners();
  DEMO_SPOTLIGHT_TARGET_SEL = selector;
  DEMO_SPOTLIGHT_FALLBACK_SEL = fallbackSelector;
  DEMO_SPOTLIGHT_META = meta;

  let el = document.querySelector(selector);
  if (!el && fallbackSelector) el = document.querySelector(fallbackSelector);
  if (!el) el = document.querySelector('main');
  if (!el) return;

  el.classList.add('demo-focused-target');

  // Scroll into view comfortably if needed
  const initRect = el.getBoundingClientRect();
  if (initRect.top < 70 || initRect.bottom > window.innerHeight - 50) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  let root = $('demo-spotlight-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'demo-spotlight-root';
    root.innerHTML = `
      <div class="demo-spotlight-cutout"></div>
      <div class="demo-spotlight-pill"></div>
    `;
    document.body.appendChild(root);
  }

  const pill = root.querySelector('.demo-spotlight-pill');
  if (pill) {
    const data = DEMO_DATA;
    const isLast = data && data.step >= data.totalSteps;
    const isPaused = DEMO_AUTOPLAY === null;
    const role = (meta.role || data?.meta?.role || 'system').toLowerCase();
    const roleLabel = (meta.role || data?.meta?.role || 'SYSTEM').toUpperCase();
    const stepNum = data ? data.step : 1;
    const totalSteps = data ? data.totalSteps : 10;

    const contextText = meta.where || (meta.stage ? `${roleLabel} · ${meta.stage}` : roleLabel);
    const whatText = meta.what || meta.explanation || '';
    const whyText = meta.why || '';
    const nextText = meta.next || '';

    pill.innerHTML = `
      <div class="demo-spotlight-header">
        <div class="demo-spotlight-header-meta">
          <span class="demo-spotlight-role-badge role-${role}">${e(roleLabel)}</span>
          <span class="demo-spotlight-step-tag">Step ${stepNum} of ${totalSteps}</span>
        </div>
        <button type="button" class="demo-spotlight-close-btn" data-a="demo-exit" title="Exit live demo">✕</button>
      </div>
      <div class="demo-spotlight-pill-where">📍 ${e(contextText)}</div>
      <div class="demo-spotlight-pill-title">${e(meta.title || 'FOCUS')}</div>
      ${whatText ? `<div class="demo-spotlight-pill-text">${e(whatText)}</div>` : ''}
      ${whyText ? `<div class="demo-spotlight-pill-why"><b>Why:</b> ${e(whyText)}</div>` : ''}
      ${nextText ? `<div class="demo-spotlight-pill-next"><b>Next:</b> ${e(nextText)}</div>` : ''}
      <div class="demo-spotlight-controls">
        <button type="button" class="s" data-a="demo-prev" ${stepNum <= 1 ? 'disabled' : ''}>← Prev</button>
        <button type="button" class="s" data-a="demo-toggle-pause">
          <span id="demo-timer-text">${DEMO_AUTOPLAY ? `⏸ ${DEMO_TIME_LEFT}s` : '▶ Play'}</span>
        </button>
        <button type="button" class="p s" data-a="demo-next" style="margin-left:auto">${isLast ? 'Finish ✓' : 'Next →'}</button>
      </div>
    `;
  }

  // Position immediately and again on next frame for layout stability
  updateSpotlightPosition();
  requestAnimationFrame(updateSpotlightPosition);
}

let DEMO_MICRO_RUNNING = false;
let DEMO_MICRO_TIMEOUT = null;

function clearDemoMicroStep() {
  DEMO_MICRO_RUNNING = false;
  if (DEMO_MICRO_TIMEOUT) {
    clearTimeout(DEMO_MICRO_TIMEOUT);
    DEMO_MICRO_TIMEOUT = null;
  }
}

async function typeTextVisually(inputEl, text, checkStillActive, speedMs = 28) {
  if (!inputEl) return;
  inputEl.focus();
  inputEl.value = '';
  inputEl.dispatchEvent(new Event('focus', { bubbles: true }));
  for (let i = 0; i < text.length; i++) {
    if (!checkStillActive()) return;
    inputEl.value += text[i];
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => { DEMO_MICRO_TIMEOUT = setTimeout(r, speedMs); });
  }
  if (checkStillActive()) {
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

async function clickElementVisually(el, checkStillActive) {
  if (!el) return;
  el.classList.add('demo-element-active');
  await new Promise(r => { DEMO_MICRO_TIMEOUT = setTimeout(r, 450); });
  if (checkStillActive()) {
    el.classList.remove('demo-element-active');
  }
}

async function runStepMicroInteractions(stepNum) {
  clearDemoMicroStep();
  if (!DEMO_SESSION_ID || !DEMO_DATA) return;
  const currentSession = DEMO_SESSION_ID;
  DEMO_MICRO_RUNNING = true;

  const wait = (ms) => new Promise(res => {
    DEMO_MICRO_TIMEOUT = setTimeout(res, ms);
  });

  const checkStillActive = () => DEMO_SESSION_ID === currentSession && DEMO_MICRO_RUNNING;
  const meta = DEMO_DATA.meta || {};
  const spot = meta.spotlight || {};
  const target = spot.target || 'main';
  const fallback = spot.fallback || 'main';

  try {
    // Focus the single target for this step immediately
    focusElement(target, fallback, {
      role: meta.role,
      title: spot.title,
      tag: spot.tag,
      explanation: spot.explanation,
      why: spot.why
    });

    await wait(220);
    if (!checkStillActive()) return;

    // Execute visible micro-action directly on the spotlighted element
    if (stepNum === 1) {
      // Step 1: Type sender username character-by-character into #u
      const u = $('u');
      const text = DEMO_DATA.actors?.sender?.username || 'sender';
      await typeTextVisually(u, text, checkStillActive, 45);
    } else if (stepNum === 2) {
      // Step 2: Ensure username is set and type password character-by-character into #p
      const u = $('u');
      if (u) u.value = DEMO_DATA.actors?.sender?.username || 'sender';
      const p = $('p');
      const text = DEMO_DATA.actors?.sender?.password || 'demo1234';
      await typeTextVisually(p, text, checkStillActive, 45);
    } else if (stepNum === 3) {
      // Step 3: Flash authenticate button
      const u = $('u');
      if (u) u.value = DEMO_DATA.actors?.sender?.username || 'sender';
      const p = $('p');
      if (p) p.value = DEMO_DATA.actors?.sender?.password || 'demo1234';
      const btn = document.querySelector('button[data-a="login"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 5) {
      // Step 5: Highlight navigation to docs
      const btn = document.querySelector('aside button[data-v="docs"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 7) {
      // Step 7: Type document title into #dn
      const dn = $('dn');
      await typeTextVisually(dn, 'Operation Falcon - Operational Brief', checkStillActive, 20);
    } else if (stepNum === 8) {
      // Step 8: Select SECRET classification
      const dc = $('dc');
      if (dc) {
        dc.focus();
        dc.value = 'SECRET';
        dc.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (stepNum === 9) {
      // Step 9: Type payload content into #dt
      const dt = $('dt');
      const payload = 'OPERATION FALCON — v1.0\nClassified Defense Brief.\n1. Objective: Secure northern logistics corridor by Q4.\n2. Rotation: Update post-quantum channel keys every 48 hours.\nEnd of classified brief.';
      await typeTextVisually(dt, payload, checkStillActive, 10);
    } else if (stepNum === 10) {
      // Step 10: Check recipient checkbox
      const chk = document.querySelector('#recipients-group input[type="checkbox"]');
      if (chk) {
        chk.focus();
        chk.checked = true;
        chk.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (stepNum === 11) {
      // Step 11: Flash encrypt & anchor button
      const btn = document.querySelector('button[data-a="newdoc"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 13) {
      // Step 13: Flash navigation to ledger
      const btn = document.querySelector('aside button[data-v="led"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 15) {
      // Step 15: Flash sender logout
      const btn = document.querySelector('.top button[data-a="logout"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 16) {
      // Step 16: Type recipient username
      const u = $('u');
      const text = DEMO_DATA.actors?.recipient?.username || 'aarav';
      await typeTextVisually(u, text, checkStillActive, 45);
    } else if (stepNum === 17) {
      // Step 17: Type recipient password while ensuring username field shows recipient username
      const u = $('u');
      if (u) u.value = DEMO_DATA.actors?.recipient?.username || 'aarav';
      const p = $('p');
      const text = DEMO_DATA.actors?.recipient?.password || 'demo1234';
      await typeTextVisually(p, text, checkStillActive, 45);
    } else if (stepNum === 18) {
      // Step 18: Flash recipient authenticate button
      const u = $('u');
      if (u) u.value = DEMO_DATA.actors?.recipient?.username || 'aarav';
      const p = $('p');
      if (p) p.value = DEMO_DATA.actors?.recipient?.password || 'demo1234';
      const btn = document.querySelector('button[data-a="login"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 19) {
      // Step 19: Flash recipient nav docs
      const btn = document.querySelector('aside button[data-v="docs"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 20) {
      // Step 20: Flash decrypt button
      const btn = document.querySelector('main .g2 .c:first-of-type button[data-a="dec"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 22) {
      // Step 22: Flash nav sessions
      const btn = document.querySelector('aside button[data-v="sess"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 24) {
      // Step 24: Flash simulate leak button
      const btn = document.querySelector('main .c.wrapx table tr:nth-child(2) button[data-a="leak"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 25) {
      // Step 25: Flash recipient logout
      const btn = document.querySelector('.top button[data-a="logout"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 26) {
      // Step 26: Type investigator username
      const u = $('u');
      const text = DEMO_DATA.actors?.investigator?.username || 'forensic';
      await typeTextVisually(u, text, checkStillActive, 45);
    } else if (stepNum === 27) {
      // Step 27: Type investigator password while ensuring username field shows investigator username
      const u = $('u');
      if (u) u.value = DEMO_DATA.actors?.investigator?.username || 'forensic';
      const p = $('p');
      const text = DEMO_DATA.actors?.investigator?.password || 'demo1234';
      await typeTextVisually(p, text, checkStillActive, 45);
    } else if (stepNum === 28) {
      // Step 28: Flash investigator authenticate button
      const u = $('u');
      if (u) u.value = DEMO_DATA.actors?.investigator?.username || 'forensic';
      const p = $('p');
      if (p) p.value = DEMO_DATA.actors?.investigator?.password || 'demo1234';
      const btn = document.querySelector('button[data-a="login"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 29) {
      // Step 29: Flash nav investigations
      const btn = document.querySelector('aside button[data-v="inv"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 31) {
      // Step 31: Flash investigate leak button
      const btn = document.querySelector('main .c:first-of-type button[data-a="run"]');
      await clickElementVisually(btn, checkStillActive);
    } else if (stepNum === 36) {
      // Step 36: Flash goto ledger block button
      const btn = document.querySelector('button[data-a="goto-ledger-block"]');
      if (btn) btn.classList.add('demo-element-active');
    }
  } catch {}
  finally {
    if (DEMO_SESSION_ID === currentSession) {
      DEMO_MICRO_RUNNING = false;
    }
  }
}

function renderDemoSpotlight() {
  if (!DEMO_SESSION_ID || !DEMO_DATA) {
    removeDemoSpotlight();
    clearDemoMicroStep();
    return;
  }
  const meta = DEMO_DATA.meta || {};
  const spot = meta.spotlight;
  if (!spot) {
    removeDemoSpotlight();
    clearDemoMicroStep();
    return;
  }

  // Defer slightly to ensure page components and async tables finish rendering
  setTimeout(() => {
    if (!DEMO_SESSION_ID || !DEMO_DATA) return;
    runStepMicroInteractions(DEMO_DATA.step);
  }, 50);
}

function renderTour() {
  const old = $('tour-root');
  if (old) old.remove();

  if (TOUR_MODAL === 'welcome') {
    const d = document.createElement('div');
    d.id = 'tour-root';
    d.innerHTML = `
      <div class="tour-backdrop"></div>
      <div class="tour-center-modal">
        <div class="l" style="color:var(--ac);margin-bottom:8px">SECURITY ENCLAVE · OPERATOR ONBOARDING</div>
        <h3>WELCOME TO THE WORKSPACE</h3>
        <p>Let's take a quick interactive walkthrough to show you where everything is and how to operate the defense console interface.</p>
        <div class="tour-center-actions">
          <button class="hiw-hero-btn primary" data-a="tour-begin" style="font-size:13px;padding:9px 18px">▶ START TOUR</button>
          <button class="s" data-a="tour-skip" style="font-size:13px;padding:9px 16px">SKIP FOR NOW</button>
        </div>
      </div>
    `;
    document.body.appendChild(d);
    return;
  }

  if (TOUR_MODAL === 'done') {
    const d = document.createElement('div');
    d.id = 'tour-root';
    d.innerHTML = `
      <div class="tour-backdrop"></div>
      <div class="tour-center-modal">
        <div class="l" style="color:var(--ok);margin-bottom:8px">ONBOARDING COMPLETED</div>
        <h3>YOU'RE READY TO OPERATE</h3>
        <p>You now know how documents are protected, authorized, committed to the ledger, and forensically attributed. You can replay this tour anytime from the top bar.</p>
        <div class="tour-center-actions">
          <button class="hiw-hero-btn primary" data-a="tour-close" style="font-size:13px;padding:9px 24px">EXPLORE WORKSPACE</button>
        </div>
      </div>
    `;
    document.body.appendChild(d);
    return;
  }

  if (!TOUR_ACTIVE) return;

  const steps = getTourSteps();
  const step = steps[TOUR_STEP];
  if (!step) {
    TOUR_ACTIVE = false;
    TOUR_MODAL = 'done';
    renderTour();
    return;
  }

  // Ensure appropriate view is selected
  if (step.view && V !== step.view) {
    V = step.view;
    draw();
    return;
  }

  let el = document.querySelector(step.target);
  if (!el && step.fallback) el = document.querySelector(step.fallback);
  if (!el) el = document.querySelector('main');

  const rect = el ? el.getBoundingClientRect() : { top: 120, left: 100, width: 300, height: 100 };

  // Scroll into view if offscreen
  if (el && (rect.top < 0 || rect.bottom > window.innerHeight)) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const d = document.createElement('div');
  d.id = 'tour-root';

  // Calculate tooltip placement outside the spotlight bounds
  const hasRoomRight = rect.right + 360 < window.innerWidth;
  const hasRoomBelow = rect.bottom + 260 < window.innerHeight;
  const hasRoomLeft = rect.left > 360;

  let tipLeft = 20;
  let tipTop = 80;
  let arrowClass = 'top';

  if (hasRoomRight) {
    tipLeft = rect.right + 18;
    tipTop = Math.max(70, Math.min(window.innerHeight - 300, rect.top));
    arrowClass = 'left';
  } else if (hasRoomBelow) {
    tipLeft = Math.max(20, Math.min(window.innerWidth - 370, rect.left));
    tipTop = rect.bottom + 18;
    arrowClass = 'top';
  } else if (hasRoomLeft) {
    tipLeft = Math.max(20, rect.left - 365);
    tipTop = Math.max(70, Math.min(window.innerHeight - 300, rect.top));
    arrowClass = 'right';
  } else {
    // Top fallback
    tipLeft = Math.max(20, Math.min(window.innerWidth - 370, rect.left));
    tipTop = Math.max(70, rect.top - 240);
    arrowClass = 'bottom';
  }

  document.querySelectorAll('.tour-highlighted-element').forEach(node => node.classList.remove('tour-highlighted-element'));
  if (el) el.classList.add('tour-highlighted-element');

  d.innerHTML = `
    <div class="tour-spotlight-box" style="
      top: ${rect.top - 4 + window.scrollY}px;
      left: ${rect.left - 4}px;
      width: ${rect.width + 8}px;
      height: ${rect.height + 8}px;
    "></div>
    <div class="tour-tooltip-card" style="top: ${tipTop + window.scrollY}px; left: ${tipLeft}px">
      <div class="tour-pointer-arrow ${arrowClass}"></div>
      
      <!-- Top Timer Bar & Controls -->
      <div class="tour-timer-wrap">
        <div class="tour-timer-info">
          <span>AUTO ADVANCE IN <span id="tour-countdown-val" class="tour-countdown-val">${TOUR_TIMER_SECONDS}s</span></span>
          <div class="tour-timer-controls">
            <button type="button" id="tour-pause-btn" class="tour-pause-btn" data-a="tour-toggle-pause">⏸ PAUSE</button>
          </div>
        </div>
        <div class="tour-timer-track">
          <div id="tour-timer-fill" class="tour-timer-fill" style="width: 100%"></div>
        </div>
      </div>

      <div class="tour-header">
        <span class="tour-step-tag">STEP ${TOUR_STEP + 1} OF ${steps.length}</span>
        <button type="button" class="s" data-a="tour-skip" style="font-size:10.5px;padding:2px 6px">Skip</button>
      </div>
      <h4 class="tour-title">${e(step.title)}</h4>
      <div class="tour-desc">${e(step.desc)}</div>
      <div class="tour-why-box">
        <b>Why it matters:</b>
        ${e(step.why)}
      </div>
      <div class="tour-footer">
        <button class="s" data-a="tour-back" ${TOUR_STEP === 0 ? 'disabled' : ''}>◀ Back</button>
        <div class="tour-footer-right">
          <button class="p s" data-a="tour-next">${TOUR_STEP === steps.length - 1 ? 'Finish Tour ✓' : 'Next ▶'}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(d);

  // Start the step timer (14s so the user has comfortable time to read the full description)
  startTourTimer(14);
}

function renderPublicHowItWorks() {
  const isForensic = HIW_MODE === 'forensic';
  const stages = isForensic ? FORENSIC_STAGES : STORY_STAGES;
  const curIdx = Math.min(HIW_STEP, stages.length - 1);
  const cur = stages[curIdx];

  return `<div class="hiw-public-wrap">
    <!-- Top Bar Navigation -->
    <div class="hiw-public-nav">
      <div class="hiw-public-brand">
        <span class="chip a">PUBLIC EXPLAINER</span>
        <h1>PROVENANCE · HOW IT WORKS</h1>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="s" data-a="pub-login">Console Login 🔐</button>
      </div>
    </div>

    ${HIW_PLAY_MODE === 'hero' ? `
      <!-- First Screen: Simple Hero -->
      <div class="hiw-hero">
        <div class="l" style="color:var(--ac);margin-bottom:8px">DEFENSE DOCUMENT PROVENANCE &amp; ATTRIBUTION</div>
        <h2>HOW IT WORKS</h2>
        <p class="hiw-hero-sub">See how a confidential document is protected, authorized, recorded, decrypted, and later traced if an unauthorized leak occurs.</p>
        <div class="hiw-hero-cta">
          <button class="hiw-hero-btn primary" data-a="hiw-start">▶ START THE DEMONSTRATION</button>
          <button class="hiw-hero-btn secondary" data-a="hiw-explore">EXPLORE THE SYSTEM</button>
        </div>
      </div>
    ` : `
      <!-- Guided Story & Exploration View -->
      <div class="hiw-story-tracker">
        <div class="hiw-story-stages">
          ${stages.map((st, i) => `
            <button class="hiw-stage-pill ${i === curIdx ? 'active' : i < curIdx ? 'done' : ''}" data-a="hiw-step" data-v="${i}">
              ${i < curIdx ? '✓ ' : ''}${st.step} ${st.name}
            </button>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="s" data-a="hiw-prev" ${curIdx === 0 ? 'disabled' : ''}>◀ Prev</button>
          <button class="p s" data-a="hiw-demo">${HIW_AUTOPLAY ? '⏸ Pause' : '▶ Play Story'}</button>
          <button class="s" data-a="hiw-next" ${curIdx === stages.length - 1 ? 'disabled' : ''}>Next ▶</button>
        </div>
      </div>

      <!-- Story Stage Header Banner -->
      <div class="hiw-story-banner">
        <div class="hiw-banner-left">
          <div class="hiw-banner-step-num">STAGE ${cur.step} — ${cur.name}</div>
          <h3 class="hiw-banner-title">${cur.title}</h3>
          <p class="hiw-banner-summary"><b>${cur.subtitle}</b></p>
          <p style="margin:8px 0 0;color:var(--tx-secondary);font-size:13.5px">${cur.explanation}</p>
        </div>
        <div>
          ${cur.term ? `
            <button class="hiw-help-toggle" data-a="hiw-help" data-v="${cur.term}">
              <span>❓</span> What is ${cur.term}?
            </button>
          ` : ''}
        </div>
      </div>

      ${HIW_SHOW_HELP ? `
        <div class="hiw-plain-help-card">
          <b>${GLOSSARY[HIW_SHOW_HELP]?.title || HIW_SHOW_HELP}</b>
          <p style="margin:4px 0 0;color:var(--tx-secondary)">${GLOSSARY[HIW_SHOW_HELP]?.text || ''}</p>
        </div>
      ` : ''}

      <!-- Interactive 2.5D Model & Evidence Representation Splitter -->
      <div class="hiw-split" style="margin-top:16px">
        <div class="hiw-viewport">
          <div class="hiw-grid-bg"></div>
          <div class="hiw-scene-25d">
            <svg class="hiw-svg-overlay">
              <line x1="15%" y1="30%" x2="50%" y2="30%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
              <line x1="50%" y1="30%" x2="85%" y2="30%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
              <line x1="85%" y1="30%" x2="85%" y2="70%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
              <line x1="85%" y1="70%" x2="50%" y2="70%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
              <line x1="50%" y1="70%" x2="15%" y2="70%" stroke="var(--bd-light)" stroke-width="2" stroke-dasharray="4,4"/>
            </svg>

            ${!isForensic ? `
              <div class="hiw-node ${curIdx === 0 ? 'active-node' : curIdx > 0 ? 'passed-node' : ''}" style="left:8%;top:20%" data-a="hiw-step" data-v="0">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">01 · DOCUMENT</div></div>
                <div class="hiw-node-sub">Project_Alpha.pdf</div>
              </div>
              <div class="hiw-node ${curIdx === 1 ? 'active-node' : curIdx > 1 ? 'passed-node' : ''}" style="left:40%;top:20%" data-a="hiw-step" data-v="1">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">02 · ENCRYPT</div></div>
                <div class="hiw-node-sub">AES-256-GCM</div>
              </div>
              <div class="hiw-node ${curIdx === 2 ? 'active-node' : curIdx > 2 ? 'passed-node' : ''}" style="left:72%;top:20%" data-a="hiw-step" data-v="2">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">03 · AUTHORIZE</div></div>
                <div class="hiw-node-sub">ML-KEM-768 Encap</div>
              </div>
              <div class="hiw-node ${curIdx === 3 ? 'active-node' : curIdx > 3 ? 'passed-node' : ''}" style="left:72%;top:64%" data-a="hiw-step" data-v="3">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">04 · RECORDED</div></div>
                <div class="hiw-node-sub">DLT Block #002</div>
              </div>
              <div class="hiw-node ${curIdx === 4 ? 'active-node' : curIdx > 4 ? 'passed-node' : ''}" style="left:40%;top:64%" data-a="hiw-step" data-v="4">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">05 · DECRYPT</div></div>
                <div class="hiw-node-sub">Session SES-0192</div>
              </div>
              <div class="hiw-node ${curIdx === 5 ? 'active-node' : curIdx > 5 ? 'passed-node' : ''}" style="left:8%;top:64%" data-a="hiw-step" data-v="5">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">06 · PROVENANCE</div></div>
                <div class="hiw-node-sub">Zero-Width Mark</div>
              </div>

              <!-- Orbiting 5-Validator Consensus Nodes -->
              <div class="hiw-val-cluster" style="left:calc(50% - 120px);top:calc(50% - 120px);opacity:${curIdx === 2 || curIdx === 3 ? '1' : '0.35'}">
                <div class="hiw-val-node ${curIdx >= 2 ? 'approved' : ''}" style="top:-23px;left:97px">N01</div>
                <div class="hiw-val-node ${curIdx >= 2 ? 'approved' : ''}" style="top:52px;right:-23px">N02</div>
                <div class="hiw-val-node ${curIdx >= 2 ? 'approved' : ''}" style="bottom:12px;right:15px">N03</div>
                <div class="hiw-val-node ${curIdx >= 2 ? 'approved' : ''}" style="bottom:12px;left:15px">N04</div>
                <div class="hiw-val-node ${curIdx >= 2 ? 'approved' : ''}" style="top:52px;left:-23px">N05</div>
              </div>
              <div class="hiw-val-center" style="position:absolute;left:calc(50% - 75px);top:calc(50% - 24px);width:150px;opacity:${curIdx >= 2 ? '1' : '0.4'}">
                <div style="font-weight:700;color:${curIdx >= 2 ? 'var(--ok)' : 'var(--tx)'}">VALIDATOR CONSENSUS</div>
                <div style="font-size:10px;color:var(--mu)">${curIdx >= 2 ? '5 / 5 APPROVED (QUORUM OK)' : 'STANDBY'}</div>
              </div>
            ` : `
              <!-- Forensic Mode Nodes -->
              <div class="hiw-node ${curIdx === 0 ? 'active-node' : curIdx > 0 ? 'passed-node' : ''}" style="left:8%;top:20%" data-a="hiw-step" data-v="0">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">01 · ARTEFACT</div></div>
                <div class="hiw-node-sub">Leaked Text File</div>
              </div>
              <div class="hiw-node ${curIdx === 1 ? 'active-node' : curIdx > 1 ? 'passed-node' : ''}" style="left:40%;top:20%" data-a="hiw-step" data-v="1">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">02 · WATERMARK</div></div>
                <div class="hiw-node-sub">WM-8F29C01B4D7E5A23</div>
              </div>
              <div class="hiw-node ${curIdx === 2 ? 'active-node' : curIdx > 2 ? 'passed-node' : ''}" style="left:72%;top:20%" data-a="hiw-step" data-v="2">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">03 · DLT SEARCH</div></div>
                <div class="hiw-node-sub">Canonical Blocks</div>
              </div>
              <div class="hiw-node ${curIdx === 3 ? 'active-node' : curIdx > 3 ? 'passed-node' : ''}" style="left:72%;top:64%" data-a="hiw-step" data-v="3">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">04 · HIST KEY</div></div>
                <div class="hiw-node-sub">KEY-0192-V1</div>
              </div>
              <div class="hiw-node ${curIdx === 4 ? 'active-node' : curIdx > 4 ? 'passed-node' : ''}" style="left:40%;top:64%" data-a="hiw-step" data-v="4">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">05 · VERIFY SIG</div></div>
                <div class="hiw-node-sub">ML-DSA-65 Valid</div>
              </div>
              <div class="hiw-node ${curIdx === 5 ? 'active-node' : curIdx > 5 ? 'passed-node' : ''}" style="left:8%;top:64%" data-a="hiw-step" data-v="5">
                <div class="hiw-node-header"><div class="hiw-node-indicator"></div><div class="hiw-node-title">06 · CHAIN AUDIT</div></div>
                <div class="hiw-node-sub">5/5 Approvals</div>
              </div>
              <div class="hiw-node ${curIdx === 6 ? 'active-node' : ''}" style="left:calc(50% - 90px);top:calc(50% - 30px);width:180px;text-align:center" data-a="hiw-step" data-v="6">
                <div class="hiw-node-header" style="justify-content:center"><div class="hiw-node-indicator" style="background:${curIdx === 6 ? 'var(--ok)' : 'var(--mu)'}"></div><div class="hiw-node-title">ATTRIBUTION</div></div>
                <div class="hiw-node-sub" style="color:${curIdx === 6 ? 'var(--ok)' : 'var(--mu)'}">${curIdx === 6 ? 'Aarav Sharma (REC-0192)' : 'PENDING'}</div>
              </div>
            `}
          </div>
        </div>

        <!-- Evidentiary Presentation & Progressive Disclosure Panel -->
        <div class="hiw-explainer-panel">
          <div class="hiw-qa-block">
            <div class="hiw-q-label what"><span>●</span> WHAT HAPPENS HERE</div>
            <div class="hiw-q-desc">${cur.explanation}</div>
          </div>

          <div class="hiw-qa-block">
            <div class="hiw-q-label why"><span>●</span> VISIBLE ARTIFACT EVIDENCE</div>
            ${cur.graphic || `<div class="hiw-proof-box">${cur.proof || ''}</div>`}
          </div>

          <!-- Progressive Disclosure for Technical Details -->
          <div class="hiw-tech-collapsible">
            <button class="hiw-tech-trigger" data-a="hiw-toggle-tech">
              <span>TECHNICAL DETAILS</span>
              <span>${HIW_SHOW_TECH ? '▲ Hide' : '▼ Inspect How'}</span>
            </button>
            ${HIW_SHOW_TECH ? `
              <div class="hiw-tech-content">
                <div class="m" style="color:var(--ac);margin-bottom:6px">${cur.tech}</div>
                <div class="m mu" style="font-size:11.5px;line-height:1.5">
                  Algorithm Implementation: Simulated PQC primitives (ECDSA-P256 for ML-DSA-65, X25519 HKDF for ML-KEM-768).<br>
                  Persistence Store: Independent SQLite validator databases with Ed25519 signatures.
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `}
  </div>`;
}

function getStepComprehensionSeconds(stepNum) {
  // Critical moments get longer holds for comprehension
  if (stepNum === 3 || stepNum === 15 || stepNum === 18 || stepNum === 25 || stepNum === 28) return 6; // Role transitions / logins
  if (stepNum === 11 || stepNum === 12) return 7; // Bulk encryption & seal
  if (stepNum === 20 || stepNum === 21) return 8; // Decryption & recovered plaintext preview
  if (stepNum === 24) return 6; // Leak simulation
  if (stepNum === 32 || stepNum === 33 || stepNum === 34 || stepNum === 35 || stepNum === 36) return 8; // Watermark extraction & verdict
  return 5; // Standard form typing / navigation
}

function startDemoTimer(initialSeconds) {
  if (DEMO_AUTOPLAY) {
    clearInterval(DEMO_AUTOPLAY);
    DEMO_AUTOPLAY = null;
  }
  const stepNum = DEMO_DATA ? DEMO_DATA.step : DEMO_STEP;
  DEMO_TIME_LEFT = (typeof initialSeconds === 'number' && initialSeconds > 0)
    ? initialSeconds
    : getStepComprehensionSeconds(stepNum);

  const timerEl = $('demo-timer-text');
  if (timerEl) timerEl.textContent = `⏸ ${DEMO_TIME_LEFT}s`;

  DEMO_AUTOPLAY = setInterval(async () => {
    if (DEMO_MICRO_RUNNING) {
      // Hold countdown while typing or button rippling is actively in flight
      return;
    }
    if (DEMO_TIME_LEFT > 1) {
      DEMO_TIME_LEFT--;
      const el = $('demo-timer-text');
      if (el) el.textContent = `⏸ ${DEMO_TIME_LEFT}s`;
    } else {
      if (DEMO_DATA && DEMO_DATA.step < DEMO_DATA.totalSteps) {
        clearInterval(DEMO_AUTOPLAY);
        DEMO_AUTOPLAY = null;
        DEMO_STEP++;
        await runDemoStep(DEMO_STEP);
      } else {
        clearInterval(DEMO_AUTOPLAY);
        DEMO_AUTOPLAY = null;
        draw();
      }
    }
  }, 1000);
}

async function runDemoStep(stepNum) {
  try {
    clearDemoMicroStep();
    if (DEMO_AUTOPLAY) {
      clearInterval(DEMO_AUTOPLAY);
      DEMO_AUTOPLAY = null;
    }
    DEMO_SHOW_TECH = false;
    DEMO_DATA = await api('/demo/execute', 'POST', { sessionId: DEMO_SESSION_ID, step: stepNum });
    ME = DEMO_DATA.currentUser || null;
    T = DEMO_DATA.sessionToken || null;
    if (DEMO_DATA.targetView) V = DEMO_DATA.targetView;
    if (DEMO_DATA.environment) ENV = DEMO_DATA.environment;
    if (DEMO_DATA.operationalOut) OUT = DEMO_DATA.operationalOut;
    else OUT = null;

    if (!ME) {
      PUB_VIEW = 'login';
    }

    draw();

    // Micro interactions will run via renderDemoSpotlight()
    // Autoplay countdown starts after micro-action starts/settles
    if (DEMO_MODE === 'guided' && stepNum <= DEMO_DATA.totalSteps) {
      startDemoTimer(getStepComprehensionSeconds(stepNum));
    }
  } catch (e) {
    toast('Error advancing demo: ' + e.message);
  }
}

async function exitInteractiveDemo() {
  if (DEMO_AUTOPLAY) {
    clearInterval(DEMO_AUTOPLAY);
    DEMO_AUTOPLAY = null;
  }
  clearDemoMicroStep();
  removeDemoSpotlight();
  const sid = DEMO_SESSION_ID;
  DEMO_SESSION_ID = null;
  DEMO_DATA = null;
  DEMO_STEP = 1;
  ME = null;
  T = null;
  OUT = null;
  PUB_VIEW = 'login';
  if (sid) {
    try {
      await api('/demo/stop', 'POST', { sessionId: sid });
    } catch {}
  }
  toast('Demo session terminated. Isolated memory state discarded.');
  return draw();
}

async function startInteractiveDemo(mode = 'self') {
  DEMO_MODE = mode === 'guided' ? 'guided' : 'self';
  DEMO_SHOW_MODAL = false;
  DEMO_STEP = 1;
  DEMO_SHOW_TECH = false;
  if (DEMO_AUTOPLAY) { clearInterval(DEMO_AUTOPLAY); DEMO_AUTOPLAY = null; }
  try {
    const startRes = await api('/demo/start', 'POST', {});
    DEMO_SESSION_ID = startRes.sessionId;
    DEMO_DATA = await api('/demo/execute', 'POST', { sessionId: DEMO_SESSION_ID, step: 1 });
    ME = DEMO_DATA.currentUser || null;
    T = DEMO_DATA.sessionToken || null;
    if (DEMO_DATA.targetView) V = DEMO_DATA.targetView;
    if (DEMO_DATA.environment) ENV = DEMO_DATA.environment;
    if (DEMO_DATA.operationalOut) OUT = DEMO_DATA.operationalOut;
    else OUT = null;
    PUB_VIEW = 'login';
    if (DEMO_MODE === 'guided') {
      startDemoTimer();
    }
    return draw();
  } catch (e) {
    toast('Failed to start demo: ' + e.message);
  }
}

setInterval(() => {
  const c = $('live-clock');
  if (c) c.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}, 1000);
const EVID = r => ({ a: { artefact: r.label }, w: { watermarkId: r.watermarkId }, t: { transactionId: r.transactionId, record: r.evidence.record }, b: r.evidence.block, s: { sessionId: r.sessionId, documentId: r.documentId }, r: { recipientId: r.recipientId, name: r.recipientName }, k: r.evidence.key, g: { signatureValid: r.signatureValid, signature: r.evidence.signature, algorithm: r.evidence.record.signatureAlgorithm }, h: { chainValid: r.chainValid, blockValid: r.blockValid, validatorAgreement: r.validatorAgreement } });
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return; const a = el.dataset.a, v = el.dataset.v;
  if (a === 'fill') { if ($('u')) $('u').value = v; if ($('p')) $('p').value = 'demo1234'; return; }
  if (a === 'ev') { if (OUT?.inv) $('evd').textContent = JSON.stringify(EVID(OUT.inv)[v], null, 1); return; }
  const go = async f => { try { await f(); } catch (x) { OUT = null; toast(x.message); } draw(); };
  if (a === 'pub-how') { PUB_VIEW = 'how'; HIW_PLAY_MODE = 'hero'; HIW_STEP = 0; if (HIW_AUTOPLAY) { clearInterval(HIW_AUTOPLAY); HIW_AUTOPLAY = null; } return draw(); }
  if (a === 'pub-login') { PUB_VIEW = 'login'; if (HIW_AUTOPLAY) { clearInterval(HIW_AUTOPLAY); HIW_AUTOPLAY = null; } return draw(); }

  // Interactive Demo Event Actions
  if (a === 'start-demo') {
    return startInteractiveDemo('self');
  }
  if (a === 'open-demo-prompt') {
    DEMO_SHOW_MODAL = true;
    return draw();
  }
  if (a === 'close-demo-prompt') {
    DEMO_SHOW_MODAL = false;
    return draw();
  }
  if (a === 'demo-card-no-close') {
    return;
  }
  if (a === 'start-demo-mode') {
    return startInteractiveDemo(v === 'self' ? 'self' : 'guided');
  }
  if (a === 'demo-next') {
    if (DEMO_DATA && DEMO_DATA.step < DEMO_DATA.totalSteps) {
      DEMO_STEP++;
      return runDemoStep(DEMO_STEP);
    } else {
      // Exit when finished
      return exitInteractiveDemo();
    }
  }
  if (a === 'demo-prev') {
    if (DEMO_STEP > 1) {
      DEMO_STEP--;
      return runDemoStep(DEMO_STEP);
    }
    return;
  }
  if (a === 'demo-toggle-pause') {
    if (DEMO_AUTOPLAY) {
      clearInterval(DEMO_AUTOPLAY);
      DEMO_AUTOPLAY = null;
      DEMO_MODE = 'self';
    } else {
      DEMO_MODE = 'guided';
      startDemoTimer();
    }
    return draw();
  }
  if (a === 'demo-toggle-tech') {
    DEMO_SHOW_TECH = !DEMO_SHOW_TECH;
    return draw();
  }
  if (a === 'demo-restart') {
    if (DEMO_AUTOPLAY) { clearInterval(DEMO_AUTOPLAY); DEMO_AUTOPLAY = null; }
    clearDemoMicroStep();
    removeDemoSpotlight();
    try {
      if (DEMO_SESSION_ID) await api('/demo/stop', 'POST', { sessionId: DEMO_SESSION_ID });
      const startRes = await api('/demo/start', 'POST', {});
      DEMO_SESSION_ID = startRes.sessionId;
      DEMO_STEP = 1;
      DEMO_DATA = await api('/demo/execute', 'POST', { sessionId: DEMO_SESSION_ID, step: 1 });
      ME = DEMO_DATA.currentUser || null;
      T = DEMO_DATA.sessionToken || null;
      if (DEMO_DATA.targetView) V = DEMO_DATA.targetView;
      if (DEMO_DATA.operationalOut) OUT = DEMO_DATA.operationalOut;
      else OUT = null;
      PUB_VIEW = 'login';
      if (DEMO_MODE === 'guided') startDemoTimer();
      toast('Demo restarted with clean isolated enclave');
      return draw();
    } catch (e) {
      toast('Error restarting demo: ' + e.message);
      return;
    }
  }
  if (a === 'demo-exit') {
    return exitInteractiveDemo();
  }
  if (a === 'hiw-start') {
    HIW_PLAY_MODE = 'story';
    HIW_MODE = 'dist';
    HIW_STEP = 0;
    HIW_SHOW_HELP = null;
    draw();
    if (HIW_AUTOPLAY) clearInterval(HIW_AUTOPLAY);
    HIW_AUTOPLAY = setInterval(() => {
      const max = (HIW_MODE === 'forensic' ? FORENSIC_STAGES : STORY_STAGES).length - 1;
      if (HIW_STEP < max) {
        HIW_STEP++;
        draw();
      } else {
        clearInterval(HIW_AUTOPLAY);
        HIW_AUTOPLAY = null;
        draw();
      }
    }, 2800);
    return;
  }
  if (a === 'hiw-explore') {
    HIW_PLAY_MODE = 'explore';
    HIW_MODE = 'dist';
    HIW_STEP = 0;
    HIW_SHOW_HELP = null;
    if (HIW_AUTOPLAY) { clearInterval(HIW_AUTOPLAY); HIW_AUTOPLAY = null; }
    return draw();
  }
  if (a === 'hiw-trace') {
    HIW_MODE = 'forensic';
    HIW_STEP = 0;
    HIW_PLAY_MODE = 'story';
    HIW_SHOW_HELP = null;
    draw();
    if (HIW_AUTOPLAY) clearInterval(HIW_AUTOPLAY);
    HIW_AUTOPLAY = setInterval(() => {
      const max = FORENSIC_STAGES.length - 1;
      if (HIW_STEP < max) {
        HIW_STEP++;
        draw();
      } else {
        clearInterval(HIW_AUTOPLAY);
        HIW_AUTOPLAY = null;
        draw();
      }
    }, 2600);
    return;
  }
  if (a === 'hiw-help') {
    HIW_SHOW_HELP = HIW_SHOW_HELP === v ? null : v;
    return draw();
  }
  if (a === 'hiw-toggle-tech') {
    HIW_SHOW_TECH = !HIW_SHOW_TECH;
    return draw();
  }
  if (a === 'tour-start') {
    stopTourTimer();
    TOUR_STEP = 0;
    TOUR_MODAL = null;
    TOUR_ACTIVE = true;
    TOUR_PAUSED = false;
    V = 'dash';
    return draw();
  }
  if (a === 'tour-begin') {
    stopTourTimer();
    TOUR_MODAL = null;
    TOUR_ACTIVE = true;
    TOUR_STEP = 0;
    TOUR_PAUSED = false;
    V = 'dash';
    return draw();
  }
  if (a === 'tour-toggle-pause') {
    TOUR_PAUSED = !TOUR_PAUSED;
    updateTourTimerUI();
    return;
  }
  if (a === 'tour-next') {
    stopTourTimer();
    const steps = getTourSteps();
    if (TOUR_STEP < steps.length - 1) {
      TOUR_STEP++;
      return draw();
    } else {
      TOUR_ACTIVE = false;
      TOUR_MODAL = 'done';
      localStorage.setItem('sih_tour_done_' + (ME ? ME.id : 'anon'), '1');
      return draw();
    }
  }
  if (a === 'tour-back') {
    stopTourTimer();
    if (TOUR_STEP > 0) TOUR_STEP--;
    return draw();
  }
  if (a === 'tour-skip') {
    stopTourTimer();
    TOUR_ACTIVE = false;
    TOUR_MODAL = null;
    localStorage.setItem('sih_tour_done_' + (ME ? ME.id : 'anon'), '1');
    document.querySelectorAll('.tour-highlighted-element').forEach(node => node.classList.remove('tour-highlighted-element'));
    const old = $('tour-root');
    if (old) old.remove();
    return;
  }
  if (a === 'tour-close') {
    stopTourTimer();
    TOUR_MODAL = null;
    TOUR_ACTIVE = false;
    document.querySelectorAll('.tour-highlighted-element').forEach(node => node.classList.remove('tour-highlighted-element'));
    const old = $('tour-root');
    if (old) old.remove();
    return;
  }
  if (a === 'switch-auth-tab') {
    PUB_VIEW = v;
    return draw();
  }
  if (a === 'register') return go(async () => {
    const name = $('reg-name')?.value?.trim();
    const username = $('reg-username')?.value?.trim();
    const role = $('reg-role')?.value;
    const password = $('reg-password')?.value;
    const confirm = $('reg-confirm')?.value;
    if (!name) throw new Error('Full name required');
    if (!username) throw new Error('Username required');
    if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');
    if (password !== confirm) throw new Error('Passwords do not match');

    const r = await api('/auth/register', 'POST', { name, username, role, password });
    T = r.token;
    ME = r.user;
    sessionStorage.setItem('t', T);
    sessionStorage.setItem('me', JSON.stringify(ME));
    V = 'dash';
    OUT = null;
    TOUR_MODAL = 'welcome';
    TOUR_STEP = 0;
    TOUR_ACTIVE = false;
    toast(`Identity registered: ${r.user.id} (${r.user.role})`);
  });
  if (a === 'login') return go(async () => {
    const r = await api('/auth/login', 'POST', { username: $('u').value, password: $('p').value });
    T = r.token;
    ME = r.user;
    sessionStorage.setItem('t', T);
    sessionStorage.setItem('me', JSON.stringify(ME));
    V = 'dash';
    OUT = null;
    // Check if this user has completed the onboarding tour
    const done = localStorage.getItem('sih_tour_done_' + ME.id);
    if (!done) {
      TOUR_MODAL = 'welcome';
      TOUR_STEP = 0;
      TOUR_ACTIVE = false;
    } else {
      TOUR_MODAL = null;
      TOUR_ACTIVE = false;
    }
  });
  if (a === 'reset') return go(async () => { await api('/reset', 'POST', {}); toast('Demo environment reset'); });
  if (a === 'logout') {
    try { await api('/auth/logout', 'POST', {}); } catch {}
    stopTourTimer();
    TOUR_ACTIVE = false;
    TOUR_MODAL = null;
    const old = $('tour-root');
    if (old) old.remove();
    return signout();
  }
  if (a === 'nav') {
    V = v;
    OUT = null;
    if (HIW_AUTOPLAY) { clearInterval(HIW_AUTOPLAY); HIW_AUTOPLAY = null; }
    return draw();
  }
  if (a === 'hiw-mode') { HIW_MODE = v; HIW_STEP = 0; if (HIW_AUTOPLAY) { clearInterval(HIW_AUTOPLAY); HIW_AUTOPLAY = null; } return draw(); }
  if (a === 'hiw-step') { HIW_STEP = parseInt(v, 10); if (HIW_AUTOPLAY) { clearInterval(HIW_AUTOPLAY); HIW_AUTOPLAY = null; } return draw(); }
  if (a === 'hiw-prev') { if (HIW_STEP > 0) HIW_STEP--; return draw(); }
  if (a === 'hiw-next') {
    const listLen = (HIW_MODE === 'forensic' ? FORENSIC_STAGES : STORY_STAGES).length;
    if (HIW_STEP < listLen - 1) HIW_STEP++;
    return draw();
  }
  if (a === 'hiw-demo') {
    if (HIW_AUTOPLAY) {
      clearInterval(HIW_AUTOPLAY);
      HIW_AUTOPLAY = null;
    } else {
      draw();
      HIW_AUTOPLAY = setInterval(() => {
        const max = (HIW_MODE === 'forensic' ? FORENSIC_STAGES : STORY_STAGES).length - 1;
        if (HIW_STEP < max) {
          HIW_STEP++;
          draw();
        } else {
          clearInterval(HIW_AUTOPLAY);
          HIW_AUTOPLAY = null;
          draw();
        }
      }, 2600);
    }
    return draw();
  }
  if (a === 'goto-ledger-block') {
    V = 'led';
    const blk = el.dataset.block ? parseInt(el.dataset.block, 10) : null;
    const tx = el.dataset.tx || null;
    TARGET_HIGHLIGHT = { block: blk, tx: tx };
    // Clear highlight after 5 seconds
    setTimeout(() => { TARGET_HIGHLIGHT = null; }, 5000);
    return draw();
  }
  if (a === 'filter-sess-by-doc') {
    V = 'sess';
    FILTERS.sessDoc = v;
    return draw();
  }
  if (a === 'clear-doc-filter') {
    FILTERS.docText = '';
    FILTERS.docCls = '';
    return draw();
  }
  if (a === 'clear-sess-doc-filter') {
    FILTERS.sessDoc = '';
    return draw();
  }
  if (a === 'clear-sess-filter') {
    FILTERS.sessDoc = '';
    FILTERS.sessUser = '';
    return draw();
  }
  if (a === 'clear-led-filter') {
    FILTERS.ledTxType = '';
    return draw();
  }
  if (a === 'clear-user-filter') {
    FILTERS.userRole = '';
    return draw();
  }
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
    else if (a === 'paste-inv') {
      const text = $('inv-text')?.value?.trim();
      if (!text) throw new Error('Please paste text content to analyse');
      const label = $('inv-label')?.value?.trim() || 'pasted-text-artefact';
      OUT = { inv: await api('/investigations', 'POST', { text, label }) };
    }
    else if (a === 'upl') { const f = $('f').files[0]; if (!f) throw new Error('Choose a file first'); if (f.size > 500000) throw new Error('File too large'); OUT = { inv: await api('/investigations', 'POST', { text: await f.text(), label: f.name.slice(0, 80) }) }; }
    else if (a === 'copy-dec') {
      const textEl = $('decrypted-plaintext');
      if (textEl && navigator.clipboard) {
        await navigator.clipboard.writeText(textEl.textContent);
        toast('Plaintext copied to clipboard');
      } else {
        toast('Clipboard copy unavailable');
      }
      return;
    }
    else if (a === 'clear-dec') {
      OUT = null;
      return draw();
    }
    else if (a === 'show-create-user') { OUT = { showCreateUser: true }; }
    else if (a === 'cancel-create-user') { OUT = { showCreateUser: false }; }
    else if (a === 'createuser') {
      const name = $('un').value, username = $('uu').value, role = $('ur').value, password = $('up').value;
      const res = await api('/users', 'POST', { name, username, role, password });
      toast(`Operator account created: ${res.id} (${res.role})`);
      OUT = { showCreateUser: false };
    }
    else if (a === 'toggleuser') {
      const res = await api(`/users/${encodeURIComponent(v)}/toggle`, 'POST', {});
      toast(`User ${res.id} status updated: ${res.status}`);
    }
    else if (a === 'show-change-pw') { OUT = { showChangePw: true }; }
    else if (a === 'cancel-change-pw') { OUT = { showChangePw: false }; }
    else if (a === 'submit-change-pw') {
      const currentPassword = $('cur-pw').value, newPassword = $('new-pw').value, confirmPassword = $('cfm-pw').value;
      const res = await api('/auth/change-password', 'POST', { currentPassword, newPassword, confirmPassword });
      toast(res.message);
      OUT = null;
      return signout();
    }
    else if (a === 'revoke-auth') {
      const docId = ev.target.dataset.doc, recId = ev.target.dataset.rec;
      await api(`/documents/${encodeURIComponent(docId)}/revoke`, 'POST', { recipientId: recId, reason: 'Revoked by authorized commander' });
      toast(`Access revoked for ${recId} on document ${docId}`);
    }
    else if (a === 'rot') { const r = await api('/identity/rotate', 'POST', {}); toast('New key ' + r.newKey); }
    else if (a === 'rev') { await api('/identity/revoke', 'POST', { userId: v }); toast('Key revoked; the identity can no longer sign'); }
    else if (a === 'lab') OUT = { lab: await api('/lab/run') };
  });
});

document.addEventListener('input', ev => {
  const id = ev.target.id;
  if (id === 'doc-search') {
    FILTERS.docText = ev.target.value;
    const pos = ev.target.selectionStart;
    draw().then(() => {
      const el = $(id);
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} }
    });
  } else if (id === 'sess-user-filter') {
    FILTERS.sessUser = ev.target.value;
    const pos = ev.target.selectionStart;
    draw().then(() => {
      const el = $(id);
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} }
    });
  }
});

document.addEventListener('change', ev => {
  const id = ev.target.id;
  if (id === 'doc-cls-filter') {
    FILTERS.docCls = ev.target.value;
    draw();
  } else if (id === 'led-type-filter') {
    FILTERS.ledTxType = ev.target.value;
    draw();
  } else if (id === 'user-role-filter') {
    FILTERS.userRole = ev.target.value;
    draw();
  }
});

draw();

