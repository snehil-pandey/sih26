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
  SENDER: [['dash', 'Command center'], ['how', 'How it works'], ['docs', 'Documents'], ['sess', 'Sessions'], ['led', 'Provenance ledger'], ['val', 'Validators'], ['aud', 'Audit']],
  RECIPIENT: [['dash', 'Command center'], ['how', 'How it works'], ['docs', 'My documents'], ['sess', 'My sessions'], ['id', 'Cryptographic identity']],
  INVESTIGATOR: [['dash', 'Command center'], ['how', 'How it works'], ['inv', 'Investigations'], ['led', 'Provenance ledger'], ['val', 'Validators'], ['lab', 'Security lab'], ['aud', 'Audit']],
  ADMIN: [['dash', 'Command center'], ['how', 'How it works'], ['docs', 'Documents'], ['sess', 'Sessions'], ['led', 'Provenance ledger'], ['val', 'Validators'], ['id', 'Identities & keys'], ['lab', 'Security lab'], ['aud', 'Audit']],
};
const syncTag = n => `<span class="tag ${n.sync === 'IN_SYNC' ? 'ok' : n.sync === 'BEHIND' || n.sync === 'OFFLINE' ? 'wr' : 'er'}">${e(n.sync.replace('_', ' '))}</span>`;
const evBox = x => `<table>${kv('Signature (ML-DSA-65, simulated)', tag(x.signatureValid))}${kv('Transaction', tag(x.transactionValid))}${kv('Block + approvals', tag(x.blockValid, 'VALID', 'INVALID') + ` <span class="m mu">${x.approvals} valid approvals</span>`)}${kv('Chain', tag(x.chainValid))}${kv('Validator agreement', tag(x.validatorAgreement.agreed, 'AGREED', 'NO QUORUM') + ` <span class="m mu">${x.validatorAgreement.inSync}/${x.validatorAgreement.total} in sync${x.validatorAgreement.diverged.length ? ' · diverged: ' + e(x.validatorAgreement.diverged.join(', ')) : ''}</span>`)}${x.key ? kv('Key', `<span class="m">${e(x.key.keyId)} · ${e(x.key.status)}</span>`) : ''}</table>`;
let TOUR_ACTIVE = false;
let TOUR_STEP = 0;
let TOUR_MODAL = null; // 'welcome' | 'done' | null
let TOUR_AUTOPLAY = null;

function stopTourAutoplay() {
  if (TOUR_AUTOPLAY) {
    clearTimeout(TOUR_AUTOPLAY);
    TOUR_AUTOPLAY = null;
  }
}

function getTourStepDuration(step) {
  if (!step) return 4000;
  const text = (step.title || '') + ' ' + (step.desc || '') + ' ' + (step.why || '');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  // Dynamic reading pace: ~180-200 WPM + 1.5s thinking cushion, clamped between 3.5s and 8.5s
  const ms = Math.round(words * 260) + 1500;
  return Math.max(3500, Math.min(8500, ms));
}

const TOUR_STEPS_BY_ROLE = {
  SENDER: [
    // --- WORKSPACE ORIENTATION ---
    {
      target: "aside",
      fallback: "main",
      view: "dash",
      title: "Sender Enclave Orientation",
      desc: "Welcome Commander. This console governs the lifecycle of classified defense documents: local AES-256-GCM encryption, post-quantum recipient key encapsulation, immutable multi-node ledger anchoring, and forensic watermark tracing.",
      why: "Ensures no document leaves local custody or is decrypted without an unbroken cryptographic chain of custody anchored across independent validator nodes."
    },
    {
      target: ".top",
      fallback: "main",
      view: "dash",
      title: "Security Context & Session Status",
      desc: "Displays active post-quantum cryptography simulations (ML-KEM-768 and ML-DSA-65), UTC temporal synchronization, your authenticated sender identity, and tour controls.",
      why: "All document sealing actions, key capsules, and transaction timestamps are cryptographically bound to your authenticated identity and UTC monotonic block headers."
    },

    // --- COMMAND CENTER (DASH) ---
    {
      target: "main .c:first-of-type",
      fallback: "main",
      view: "dash",
      title: "Consensus Integrity & Node Synchronization",
      desc: "Continuously tracks independent validator node state. It verifies that at least 3 of 5 validator nodes agree on the canonical ledger head hash and warns immediately if any node diverges.",
      why: "You should only seal and distribute classified operational briefs when the distributed ledger consensus is verified and healthy across the validator network."
    },
    {
      target: "main .g",
      fallback: "main",
      view: "dash",
      title: "Operational Metrics & Throughput",
      desc: "Provides a real-time summary of active documents under custody, authorized recipients, cumulative decryption sessions, ledger blocks, and forensic investigations.",
      why: "Gives immediate operational visibility into document circulation and system-wide cryptographic events."
    },

    // --- HOW IT WORKS (HOW) ---
    {
      target: "main .hiw-container",
      fallback: "main",
      view: "how",
      title: "Architectural Model & Cryptographic Flow",
      desc: "Interactive 2.5D visual model demonstrating the complete lifecycle of a document: local sealing, recipient key encapsulation, validator consensus, authorized decryption, zero-width watermarking, and forensic tracing.",
      why: "Provides deep architectural transparency into how data structures, key capsules, and canonical blocks interact under the hood."
    },

    // --- DOCUMENTS WORKSPACE (DOCS) ---
    {
      target: "#new-doc-card",
      fallback: "main",
      view: "docs",
      title: "Document Creation & Sealing Workflow",
      desc: "The secure authoring enclave where you input the brief's title, assign its formal security classification (RESTRICTED, CONFIDENTIAL, or SECRET), and provide the sensitive plaintext content.",
      why: "The system generates a single-use 256-bit Content Encryption Key (CEK) and encrypts the document locally with AES-256-GCM before it ever touches external storage."
    },
    {
      target: "#recipients-group",
      fallback: "#new-doc-card",
      view: "docs",
      title: "Recipients & Access Authorization",
      desc: "Defines exactly which verified personnel are permitted to decrypt the document. Checking a recipient establishes an ML-KEM-768 post-quantum key capsule for their identity.",
      why: "When you click 'Encrypt, authorize & anchor', your device signs an AUTHORIZATION transaction committing the recipient's public key ID to the distributed ledger. Unselected personnel cannot decrypt the file even if they obtain the ciphertext."
    },
    {
      target: "main .g2",
      fallback: "main",
      view: "docs",
      title: "Document Custody & Access Roster",
      desc: "Displays all active encrypted briefs, their cryptographic content hashes (SHA-256), current version numbers, cumulative decryption counters, and authorized recipient rosters.",
      why: "Allows senders to audit document distribution at a glance and verify that content hashes match authorized releases."
    },

    // --- SESSIONS & WATERMARKS (SESS) ---
    {
      target: "main .c.wrapx",
      fallback: "main",
      view: "sess",
      title: "Decryption Sessions & Watermark Tracking",
      desc: "Audits every plaintext decryption event across the network. Each decryption records a unique session ID, recipient identity, invisible zero-width watermark ID, and anchored ledger block.",
      why: "Enables side-by-side comparison of two sessions to demonstrate how identical briefs carry unique, recipient-specific watermarks, and allows simulating unauthorized leaks for testing."
    },

    // --- PROVENANCE LEDGER (LED) ---
    {
      target: "main .c.wrapx:has(table)",
      fallback: "main",
      view: "led",
      title: "Public-Key Registry on Ledger",
      desc: "Maintains canonical public key records for all operators (including ML-DSA-65 signing keys and ML-KEM-768 encapsulation keys), tracking versioning and active/revoked statuses.",
      why: "Public keys are verified strictly from consensus blocks, preventing key substitution attacks and ensuring historical keys remain verifiable."
    },
    {
      target: "main .c:has(b)",
      fallback: "main",
      view: "led",
      title: "Immutable Blocks & Transaction Payloads",
      desc: "The append-only canonical ledger chain showing block indices, timestamps, validator approvals, hash continuity, and signed transaction payloads (KEY_REGISTRATION, AUTHORIZATION, PROVENANCE).",
      why: "Transactions are permanently sealed across independent node databases. Changing any past record breaks cryptographic hash links and is rejected by validators."
    },

    // --- VALIDATORS NETWORK (VAL) ---
    {
      target: "main .c.wrapx",
      fallback: "main",
      view: "val",
      title: "Validator Network & Byzantine Fault Tolerance",
      desc: "Inspects live node states, ledger heights, latest block hashes, and consensus agreements across the 5 independent validator SQLite nodes.",
      why: "Transactions and blocks require agreement from at least 3 of 5 independent nodes (quorum), guaranteeing resilient consensus without single points of failure."
    },

    // --- SYSTEM AUDIT (AUD) ---
    {
      target: "main .g2",
      fallback: "main",
      view: "aud",
      title: "Dual-Layer System Audit",
      desc: "Presents authoritative ledger events (extracted from immutable blockchain blocks) alongside non-authoritative operational logs (HTTP requests and operator telemetry).",
      why: "Maintains an unalterable, tamper-evident audit trail of all authorizations, decryptions, and administrative interventions."
    }
  ],

  RECIPIENT: [
    // --- WORKSPACE ORIENTATION ---
    {
      target: "aside",
      fallback: "main",
      view: "dash",
      title: "Recipient Terminal Orientation",
      desc: "Welcome to your secure recipient terminal. This workspace allows authorized defense personnel to receive, decrypt, and review classified operational briefs designated for your identity.",
      why: "Every document decryption is cryptographically governed: your device unwraps a post-quantum key capsule, embeds an invisible provenance watermark, and signs a ledger record."
    },
    {
      target: ".top",
      fallback: "main",
      view: "dash",
      title: "Security Context & Cryptographic Identity",
      desc: "Displays your authenticated recipient identity, active post-quantum cryptography simulations (ML-KEM-768/ML-DSA-65), UTC timestamp synchronization, and tour replay controls.",
      why: "Only documents with a verified AUTHORIZATION transaction matching your registered public key on the ledger can be unlocked by this terminal."
    },

    // --- COMMAND CENTER (DASH) ---
    {
      target: "main .c:first-of-type",
      fallback: "main",
      view: "dash",
      title: "Consensus Status & Network Health",
      desc: "Confirms that the distributed validator ledger is in active consensus and synchronized across all nodes before you attempt any document access.",
      why: "Decryption requires an active validator quorum to validate and anchor your signed PROVENANCE transaction to the canonical blockchain."
    },
    {
      target: "main .g",
      fallback: "main",
      view: "dash",
      title: "Personal Operational Summary",
      desc: "Summarizes active briefs authorized for your account, total successful decryptions, and personal activity across the defense network.",
      why: "Provides immediate situational awareness of classified materials accessible under your security clearance."
    },

    // --- HOW IT WORKS (HOW) ---
    {
      target: "main .hiw-container",
      fallback: "main",
      view: "how",
      title: "Recipient Decryption & Provenance Model",
      desc: "Interactive 2.5D architectural demonstration showing how your private key decapsulates the session key, renders plaintext, and injects zero-width steganographic watermarks.",
      why: "Explains how the system ensures document confidentiality while preserving undeniable attribution."
    },

    // --- MY SECURE DOCUMENTS (DOCS) ---
    {
      target: "main .g2",
      fallback: "main",
      view: "docs",
      title: "Authorized Classified Documents",
      desc: "The secure documents repository showing briefs authorized specifically for your identity. Each card displays security classification, content hash, version, and cumulative access count.",
      why: "Clicking 'Decrypt' initiates key decapsulation, displays the plaintext operational brief, embeds your unique watermark, and signs an immutable PROVENANCE transaction with ML-DSA-65."
    },
    {
      target: "main .c:last-child",
      fallback: "main",
      view: "docs",
      title: "Cryptographic Authorization Enforcement",
      desc: "Allows testing direct document access by ID. It demonstrates that access control is enforced cryptographically by the backend—unauthorized requests are denied and leave no state.",
      why: "Confirms that unauthorized users cannot bypass authorization rules even if they know the document identifier."
    },

    // --- SESSIONS & WATERMARKS (SESS) ---
    {
      target: "main .c.wrapx",
      fallback: "main",
      view: "sess",
      title: "Personal Decryption Sessions & Provenance Records",
      desc: "A personal audit trail of every decryption executed from your terminal, including unique session IDs, document IDs, zero-width watermark IDs, and anchored block numbers.",
      why: "Gives recipients complete personal auditability over all signed provenance transactions committed under their identity, with side-by-side comparison capabilities."
    },

    // --- CRYPTOGRAPHIC IDENTITY (ID) ---
    {
      target: "main .c.wrapx",
      fallback: "main",
      view: "id",
      title: "Cryptographic Identity & Key Rotation",
      desc: "Displays your registered public key on the ledger, key version, active status, and provides the 'Rotate my key' action to generate a new key pair.",
      why: "Rotated keys remain linked on the ledger, ensuring historical decryptions continue to verify mathematically without breaking attribution."
    }
  ],

  INVESTIGATOR: [
    // --- WORKSPACE ORIENTATION ---
    {
      target: "aside",
      fallback: "main",
      view: "dash",
      title: "Forensic Investigation Enclave",
      desc: "Welcome Investigator. This enclave provides unbiased, mathematical attribution of leaked defense documents using zero-width steganography, canonical ledger queries, and post-quantum signature verification.",
      why: "Operates with zero human bias: the investigator supplies only the leaked text artifact without selecting suspects or guessing recipients."
    },
    {
      target: ".top",
      fallback: "main",
      view: "dash",
      title: "Forensic Environment & Verification Engine",
      desc: "Displays active cryptographic verification engines (ML-DSA-65 signature checks, SHA-256 chaining, DLT consensus verification), UTC timestamps, and tour replay controls.",
      why: "All investigative conclusions and attribution verdicts are timestamped and corroborated against canonical validator blocks."
    },

    // --- COMMAND CENTER (DASH) ---
    {
      target: "main .c:first-of-type",
      fallback: "main",
      view: "dash",
      title: "Consensus Integrity & Evidentiary Health",
      desc: "Verifies that all 5 validator nodes agree on the canonical ledger state and that no storage divergence has occurred.",
      why: "Forensic attribution is only legally and mathematically sound when anchored by an active validator quorum (at least 3 of 5 nodes)."
    },
    {
      target: "main .g",
      fallback: "main",
      view: "dash",
      title: "Forensic Case Metrics",
      desc: "Summarizes active investigations, verified attributions, total blocks, and system-wide document circulation metrics.",
      why: "Provides instant situational awareness over pending and resolved leak investigations."
    },

    // --- HOW IT WORKS (HOW) ---
    {
      target: "main .hiw-container",
      fallback: "main",
      view: "how",
      title: "7-Stage Forensic Attribution Model",
      desc: "Visual walkthrough of the complete forensic pipeline: Artefact Ingestion → Watermark Recovery → Ledger Query → Historical Key Resolution → Signature Audit → Chain Validation → Final Attribution Verdict.",
      why: "Demonstrates the mathematical rigor behind every stage of evidence analysis."
    },

    // --- INVESTIGATIONS ENCLAVE (INV) ---
    {
      target: "main .c:first-of-type",
      fallback: "main",
      view: "inv",
      title: "Leaked Artefact Ingestion & Analysis",
      desc: "The primary investigation portal. You can select simulated leaked snippets from known sessions or upload external plaintext (.txt) files recovered from unauthorized channels.",
      why: "The forensic engine scans raw character streams for zero-width Unicode characters, validates checksum parity, and extracts the embedded watermark ID."
    },
    {
      target: "main .c.wrapx:last-of-type",
      fallback: "main",
      view: "inv",
      title: "Investigation History & Evidentiary Archive",
      desc: "Maintains an immutable record of all completed forensic investigations, including recovered watermark IDs, attribution statuses (VERIFIED_PROVENANCE_MATCH or NO_ATTRIBUTION), and timestamps.",
      why: "Provides an undeniable, reproducible record of all investigative findings for formal defense inquiries."
    },

    // --- PROVENANCE LEDGER (LED) ---
    {
      target: "main .c.wrapx:has(table)",
      fallback: "main",
      view: "led",
      title: "Ledger Key Registry & Signature Verification",
      desc: "Inspects canonical public keys and provides tools to independently verify ML-DSA-65 recipient signatures directly on committed PROVENANCE transactions.",
      why: "Allows investigators to test signatures against correct and adversarial recipient keys, proving that attribution fails closed if a signature does not match."
    },
    {
      target: "main .c:has(b)",
      fallback: "main",
      view: "led",
      title: "Block Continuity & Validator Approvals",
      desc: "Reviews block continuity, previous-hash chaining, and Ed25519 validator node signatures anchored across the network.",
      why: "Guarantees that evidence records have not been rewritten, truncated, or tampered with since creation."
    },

    // --- SECURITY TEST LAB (LAB) ---
    {
      target: "main .c",
      fallback: "main",
      view: "lab",
      title: "Automated Adversarial Security Suite",
      desc: "Executes automated tests in isolated sandboxes: altered watermarks, forged signatures, deleted blocks, and corrupted transactions.",
      why: "Proves in real time that tampered evidence is rejected and cannot produce false positive attributions."
    },

    // --- SYSTEM AUDIT (AUD) ---
    {
      target: "main .g2",
      fallback: "main",
      view: "aud",
      title: "Authoritative Ledger Audit Timeline",
      desc: "Corroborates authoritative ledger events from canonical blocks against operational logs.",
      why: "Ensures comprehensive auditability and evidentiary integrity across all investigative operations."
    }
  ],

  ADMIN: [
    // --- WORKSPACE ORIENTATION ---
    {
      target: "aside",
      fallback: "main",
      view: "dash",
      title: "Administrator Super-Console",
      desc: "Welcome System Administrator. You hold full oversight over the 5-node distributed ledger, Byzantine fault detection, attack simulations, key management, and security suites.",
      why: "Ensures the distributed ledger and security enclave maintain continuous consensus integrity and fault tolerance."
    },
    {
      target: ".top",
      fallback: "main",
      view: "dash",
      title: "Administrative Security Controls",
      desc: "Displays active post-quantum cryptography simulations, military UTC time ticker, administrator credentials, and guided tour controls.",
      why: "Validates that administrative interventions are authenticated and timestamped across the network."
    },

    // --- COMMAND CENTER (DASH) ---
    {
      target: "main .c:first-of-type",
      fallback: "main",
      view: "dash",
      title: "Multi-Node Consensus Overview",
      desc: "Real-time consensus health across all 5 validator SQLite databases. Displays the synchronized node tally, quorum threshold (3/5), and canonical ledger head hash.",
      why: "Immediately alerts administrators to node synchronization failures or database divergence across the cluster."
    },
    {
      target: "main .g",
      fallback: "main",
      view: "dash",
      title: "System-Wide Operational Metrics",
      desc: "High-level metrics grid summarizing active documents, registered recipients, decryption sessions, provenance records, ledger blocks, and investigations.",
      why: "Provides comprehensive visibility into network activity and storage utilization."
    },

    // --- HOW IT WORKS (HOW) ---
    {
      target: "main .hiw-container",
      fallback: "main",
      view: "how",
      title: "System Architecture & Consensus Model",
      desc: "Interactive 2.5D architectural demonstration showing document sealing, capsule creation, 5-node validator voting, and forensic attribution.",
      why: "Serves as an architectural reference for training operators and verifying cryptographic flow."
    },

    // --- DOCUMENTS (DOCS) ---
    {
      target: "main .g2",
      fallback: "main",
      view: "docs",
      title: "Document Custody & Access Rosters",
      desc: "Full administrative oversight of all encrypted operational briefs, encryption algorithms (AES-256-GCM), content hashes, and authorized recipient lists.",
      why: "Allows administrators to monitor classified assets under custody without exposing plaintext content."
    },

    // --- SESSIONS & WATERMARKS (SESS) ---
    {
      target: "main .c.wrapx",
      fallback: "main",
      view: "sess",
      title: "Decryption Sessions & Watermark Log",
      desc: "Comprehensive log of all recipient decryption sessions with unique watermark IDs, block numbers, and side-by-side comparison features.",
      why: "Enables monitoring of access patterns and verification of unique invisible watermarks across sessions."
    },

    // --- PROVENANCE LEDGER (LED) ---
    {
      target: "main .c.wrapx:has(table)",
      fallback: "main",
      view: "led",
      title: "Canonical Ledger & Public-Key Registry",
      desc: "Inspects registered public keys, cryptographic algorithms, version histories, and allows on-demand validation across all validator nodes.",
      why: "Confirms chain continuity and validates that all registered keys adhere to security policy."
    },
    {
      target: "main .c:has(b)",
      fallback: "main",
      view: "led",
      title: "Block Continuity & Transaction Payloads",
      desc: "Reviews immutable block headers, previous-hash linkage, validator approval signatures, and transaction payloads.",
      why: "Demonstrates that history cannot be rewritten or modified without breaking cryptographic hash chains."
    },

    // --- VALIDATOR MANAGEMENT & ATTACK SIMULATION (VAL) ---
    {
      target: "main .c.wrapx",
      fallback: "main",
      view: "val",
      title: "Validator Node Management & Quorum Controls",
      desc: "Granular status of each validator node (ONLINE/OFFLINE, height, latest block hash, validation state, and sync state) with controls to toggle nodes offline or force chain resynchronization.",
      why: "Demonstrates fault tolerance: the network continues committing transactions as long as at least 3 of 5 nodes are online and synchronized."
    },
    {
      target: "main .c:last-child",
      fallback: "main",
      view: "val",
      title: "Adversarial Attack Simulation",
      desc: "Interactive security testing console that injects corruptions into ONE validator's private storage (e.g. modified transaction, modified block hash, or deleted block).",
      why: "Proves that the consensus engine detects divergence immediately and isolates the compromised node while majority consensus holds firm."
    },

    // --- IDENTITIES & KEYS (ID) ---
    {
      target: "main .c.wrapx",
      fallback: "main",
      view: "id",
      title: "Identity Management & Key Revocation",
      desc: "Centralized identity registry allowing administrators to revoke compromised public keys by committing a KEY_REVOCATION transaction to the ledger.",
      why: "Revoking a key prevents future authorizations while preserving historical attribution for existing signed records."
    },

    // --- SECURITY TEST LAB (LAB) ---
    {
      target: "main .c",
      fallback: "main",
      view: "lab",
      title: "Security Test Lab Suite",
      desc: "Executes automated adversarial test scenarios against in-memory throwaway sandboxes to verify defense resistance before live operations.",
      why: "Verifies zero-width detection, signature verification, and consensus self-healing without altering production ledger state."
    },

    // --- SYSTEM AUDIT (AUD) ---
    {
      target: "main .g2",
      fallback: "main",
      view: "aud",
      title: "Authoritative & Operational Audit",
      desc: "Dual audit interface comparing immutable ledger blocks against operational telemetry.",
      why: "Provides unalterable proof of all administrative actions, key revocations, and node resynchronizations."
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
        <div class="pipeline-stage">
          <div class="pipeline-stage-idx">STAGE 01 · AES-256-GCM</div>
          <div class="pipeline-stage-name">
            <span>Documents Sealed</span>
            <span class="pipeline-stage-count">${d.documents}</span>
          </div>
          <div class="pipeline-stage-desc">Classified briefs encrypted with single-use CEKs and bound to AAD.</div>
          <div class="pipeline-connector">▶</div>
        </div>

        <div class="pipeline-stage">
          <div class="pipeline-stage-idx">STAGE 02 · ML-KEM-768</div>
          <div class="pipeline-stage-name">
            <span>Recipient Identities</span>
            <span class="pipeline-stage-count">${d.recipients}</span>
          </div>
          <div class="pipeline-stage-desc">Personnel with registered post-quantum key capsules on ledger.</div>
          <div class="pipeline-connector">▶</div>
        </div>

        <div class="pipeline-stage">
          <div class="pipeline-stage-idx">STAGE 03 · WATERMARKING</div>
          <div class="pipeline-stage-name">
            <span>Decryptions Executed</span>
            <span class="pipeline-stage-count">${d.sessions}</span>
          </div>
          <div class="pipeline-stage-desc">Plaintexts recovered with unique zero-width steganographic marks.</div>
          <div class="pipeline-connector">▶</div>
        </div>

        <div class="pipeline-stage">
          <div class="pipeline-stage-idx">STAGE 04 · CANONICAL DLT</div>
          <div class="pipeline-stage-name">
            <span>Provenance Records</span>
            <span class="pipeline-stage-count">${d.provenance}</span>
          </div>
          <div class="pipeline-stage-desc">ML-DSA-65 signed records anchored in verified blocks (${d.blocks} blocks).</div>
        </div>
      </div>
    </div>

    <div class="l" style="margin:16px 0 8px">Operational Metrics</div>
    <div class="g">${[['Documents', d.documents], ['Recipients', d.recipients], ['Decryption sessions', d.sessions], ['Provenance records', d.provenance], ['Ledger blocks', d.blocks], ['Investigations', d.investigations], ['Verified attributions', d.verified]].map(([a, b]) => `<div class="c"><div class="l">${a}</div><div class="n">${b}</div></div>`).join('')}</div>`;
  },
  async docs() {
    const d = await api('/documents'), R = ME.role === 'RECIPIENT';
    return `<h2>${R ? 'My secure documents' : 'Documents'}</h2><p class="sub">Content is AES-256-GCM encrypted; per-recipient key establishment is ML-KEM-768 (simulated); authorizations are signed by the sender and recorded on the ledger.</p>
    ${OUT?.decrypt ? `<div class="res ok"><div class="l ok">Decryption complete</div><table>${kv('Session', `<span class="m">${e(OUT.decrypt.sessionId)}</span>`)}${kv('Watermark', `<span class="m">${e(OUT.decrypt.watermarkId)}</span> <span class="mu">(invisible, simulated)</span>`)}${kv('Transaction / block', `<span class="m">${e(OUT.decrypt.transactionId)} · #${OUT.decrypt.block} · ${OUT.decrypt.approvals} approvals</span>`)}${kv('Signing key', `<span class="m">${e(OUT.decrypt.keyId)}</span>`)}</table>${evBox(OUT.decrypt.evidence)}<pre>${e(OUT.decrypt.representation)}</pre></div>` : ''}
    ${OUT?.err ? `<div class="res er"><b class="er">${e(OUT.err)}</b></div>` : ''}
    ${ME.role === 'SENDER' ? `<div class="c" id="new-doc-card"><h3>New document</h3><input id="dn" placeholder="Name" maxlength="120"> <select id="dc"><option>RESTRICTED</option><option>CONFIDENTIAL</option><option>SECRET</option></select><br><textarea id="dt" rows="4" style="width:100%;margin:8px 0" placeholder="Content"></textarea><div id="recipients-group" style="margin:4px 0">${d.recipients.map(r => `<label><input type="checkbox" class="rc" value="${e(r.id)}"> ${e(r.name)} </label>`).join('')}</div><br><button class="p" data-a="newdoc">Encrypt, authorize &amp; anchor</button></div>` : ''}
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
    const users = A ? await api('/users') : null;
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

    <div class="c wrapx" style="margin-bottom:28px">
      <div class="l">System User Directory</div>
      <table>
        <tr><th>User ID</th><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Provisioned</th><th>Actions</th></tr>
        ${users.map(u => `
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

let PUB_VIEW = 'login'; // 'login' | 'how'
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
    A.innerHTML = `<div class="login">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="l" style="color:var(--ac);margin:0">SIH26237 · PROTOTYPE</div>
        <button type="button" class="s" data-a="pub-how" style="color:var(--ac);border-color:var(--ac-border)">How It Works ▶</button>
      </div>
      <h2>PROVENANCE</h2>
      <p class="sub">Secure document attribution system</p>
      <input id="u" placeholder="username" autocomplete="username" value="sender">
      <input id="p" type="password" placeholder="password" autocomplete="current-password" value="demo1234">
      <button class="p" data-a="login" style="width:100%;margin-top:6px">Authenticate</button>
      <div class="l" style="margin:16px 0 6px">Quick login presets</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">
        ${PRESETS.map(([u, lbl]) => `<button type="button" class="s" data-a="fill" data-v="${e(u)}" title="${e(lbl)}">${e(u)}</button>`).join('')}
      </div>
      <button data-a="reset" style="width:100%">Reset demo environment</button>
    </div>`;
    return;
  }

  // --- AUTHENTICATED EXPERIENCE ---
  const nav = NAV[ME.role]; if (!nav.some(n => n[0] === V)) V = 'dash';
  let body; try { body = await VIEW[V](); } catch (x) { body = `<div class="res er">${e(x.message)}</div>`; }
  const timeStr = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  A.innerHTML = `<aside><h1>PROVENANCE</h1>${nav.map(n => `<button class="nv ${V === n[0] ? 'on' : ''}" data-a="nav" data-v="${n[0]}">${n[1]}</button>`).join('')}</aside><main><div class="top"><span class="chip">DEMO MODE</span><span class="chip a">CRYPTO: SIMULATION</span><span class="chip" style="color:var(--tx);border-color:var(--bd-light);background:var(--pn-elevated)"><span style="display:inline-block;width:6px;height:6px;background:var(--ok);border-radius:50%;margin-right:6px;box-shadow:0 0 6px var(--ok)"></span><span id="live-clock" class="m">${timeStr}</span></span><span style="flex:1"></span><span>${e(ME.name)} <span class="mu m">${e(ME.id)} · ${e(ME.role)}</span></span><button class="s" data-a="tour-start" title="Replay Guided Walkthrough">Tour 🧭</button><button data-a="logout">Sign out</button></div>${body}</main>`;

  if (TOUR_MODAL || TOUR_ACTIVE) {
    renderTour();
  }
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

  // If user navigated away from the required view for this tour step, cancel tour
  if (step.view && V !== step.view) {
    TOUR_ACTIVE = false;
    document.querySelectorAll('.tour-highlighted-element').forEach(node => node.classList.remove('tour-highlighted-element'));
    return;
  }

  let el = document.querySelector(step.target);
  if (!el && step.fallback) el = document.querySelector(step.fallback);
  if (!el) el = document.querySelector('main');

  // Clear previous highlighted styles
  document.querySelectorAll('.tour-highlighted-element').forEach(node => node.classList.remove('tour-highlighted-element'));
  if (el) el.classList.add('tour-highlighted-element');

  // 1. Scroll target comfortably into view if offscreen or partially clipped
  if (el) {
    const initRect = el.getBoundingClientRect();
    if (initRect.top < 60 || initRect.bottom > window.innerHeight - 40) {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  }

  // 2. Measure target geometry after scroll has completed
  const rect = el ? el.getBoundingClientRect() : { top: 120, left: 100, width: 300, height: 100, right: 400, bottom: 220 };

  const d = document.createElement('div');
  d.id = 'tour-root';

  const isAutoplay = Boolean(TOUR_AUTOPLAY);
  const durationMs = getTourStepDuration(step);

  // 3. Dynamic layout evaluation: test candidate placements (Right, Left, Below, Above, and Docked Right for full-width)
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tipWidth = Math.min(360, Math.max(300, vw - 40));
  const estimatedTipHeight = 280;
  const margin = 16;

  const roomRight = vw - rect.right;
  const roomLeft = rect.left;
  const roomBelow = vh - rect.bottom;
  const roomAbove = rect.top;

  let tipLeft = 20;
  let tipTop = 80;
  let arrowClass = 'top';
  let arrowOffset = 30; // pixels along the tooltip edge

  // Determine if target spans most of the screen width (e.g. main, .c.wrapx tables, .g2)
  const isWideTarget = rect.width > vw * 0.65;
  const isTallTarget = rect.height > vh * 0.65;

  if (roomRight >= tipWidth + margin + 10 && !isWideTarget) {
    // Placement 1: RIGHT
    arrowClass = 'left';
    tipLeft = rect.right + margin;
    // Align tooltip center with target center, clamped inside viewport
    const idealTop = (rect.top + rect.height / 2) - estimatedTipHeight / 2;
    tipTop = Math.max(70, Math.min(vh - estimatedTipHeight - 20, idealTop));
    // Position arrow pointing directly to target center
    const targetCenterY = rect.top + rect.height / 2;
    arrowOffset = Math.max(20, Math.min(estimatedTipHeight - 30, targetCenterY - tipTop));
  } else if (roomLeft >= tipWidth + margin + 10 && !isWideTarget) {
    // Placement 2: LEFT
    arrowClass = 'right';
    tipLeft = rect.left - tipWidth - margin;
    const idealTop = (rect.top + rect.height / 2) - estimatedTipHeight / 2;
    tipTop = Math.max(70, Math.min(vh - estimatedTipHeight - 20, idealTop));
    const targetCenterY = rect.top + rect.height / 2;
    arrowOffset = Math.max(20, Math.min(estimatedTipHeight - 30, targetCenterY - tipTop));
  } else if (roomBelow >= estimatedTipHeight + margin + 10 && !isTallTarget) {
    // Placement 3: BELOW
    arrowClass = 'top';
    tipTop = rect.bottom + margin;
    // Align tooltip center with target center, clamped inside viewport
    const idealLeft = (rect.left + rect.width / 2) - tipWidth / 2;
    tipLeft = Math.max(20, Math.min(vw - tipWidth - 20, idealLeft));
    const targetCenterX = rect.left + rect.width / 2;
    arrowOffset = Math.max(24, Math.min(tipWidth - 36, targetCenterX - tipLeft));
  } else if (roomAbove >= estimatedTipHeight + margin + 10 && !isTallTarget) {
    // Placement 4: ABOVE
    arrowClass = 'bottom';
    tipTop = rect.top - estimatedTipHeight - margin;
    const idealLeft = (rect.left + rect.width / 2) - tipWidth / 2;
    tipLeft = Math.max(20, Math.min(vw - tipWidth - 20, idealLeft));
    const targetCenterX = rect.left + rect.width / 2;
    arrowOffset = Math.max(24, Math.min(tipWidth - 36, targetCenterX - tipLeft));
  } else {
    // Large container fallback: position in right-hand overlay dock or bottom-right negative space
    arrowClass = 'none';
    tipLeft = Math.max(20, vw - tipWidth - 30);
    tipTop = Math.max(75, Math.min(vh - estimatedTipHeight - 25, rect.top + 20));
  }

  // Arrow style attribute for dynamic pointer alignment
  const arrowStyle = (arrowClass === 'left' || arrowClass === 'right')
    ? `top:${Math.round(arrowOffset)}px;`
    : `left:${Math.round(arrowOffset)}px;`;

  d.innerHTML = `
    <div class="tour-spotlight-box" style="
      top: ${rect.top - 4 + window.scrollY}px;
      left: ${rect.left - 4}px;
      width: ${rect.width + 8}px;
      height: ${rect.height + 8}px;
    "></div>
    <div class="tour-tooltip-card" style="top: ${tipTop + window.scrollY}px; left: ${tipLeft}px; width: ${tipWidth}px">
      ${isAutoplay ? `<div class="tour-auto-progress-bar"><div class="tour-auto-progress-fill" style="animation-duration:${durationMs}ms"></div></div>` : ''}
      ${arrowClass !== 'none' ? `<div class="tour-pointer-arrow ${arrowClass}" style="${arrowStyle}"></div>` : ''}
      <div class="tour-header">
        <span class="tour-step-tag">STEP ${TOUR_STEP + 1} OF ${steps.length}${isAutoplay ? ` · AUTO (${Math.round(durationMs / 1000)}s)` : ''}</span>
        <button type="button" class="s" data-a="tour-skip" style="font-size:10.5px;padding:2px 6px">Skip</button>
      </div>
      <h4 class="tour-title">${e(step.title)}</h4>
      <div class="tour-desc">${e(step.desc)}</div>
      <div class="tour-why-box">
        <b>Why it matters:</b>
        ${e(step.why)}
      </div>
      <div class="tour-footer">
        <div style="display:flex;gap:6px;align-items:center">
          <button class="s" data-a="tour-back" ${TOUR_STEP === 0 ? 'disabled' : ''}>◀ Back</button>
          <button class="s tour-auto-btn ${isAutoplay ? 'active' : ''}" data-a="tour-toggle-auto" title="${isAutoplay ? 'Pause automated walkthrough' : 'Automatically advance after reading'}">
            ${isAutoplay ? '⏸ Pause' : '▶ Auto'}
          </button>
        </div>
        <div class="tour-footer-right">
          <button class="p s" data-a="tour-next">${TOUR_STEP === steps.length - 1 ? 'Finish Tour ✓' : 'Next ▶'}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(d);

  if (isAutoplay) {
    scheduleTourAutoplay(durationMs);
  }
}

function scheduleTourAutoplay(ms) {
  stopTourAutoplay();
  TOUR_AUTOPLAY = setTimeout(() => {
    TOUR_AUTOPLAY = null;
    const steps = getTourSteps();
    if (TOUR_STEP < steps.length - 1) {
      TOUR_STEP++;
      if (steps[TOUR_STEP] && steps[TOUR_STEP].view) V = steps[TOUR_STEP].view;
      // Mark autoplay active so next step continues autoplaying
      TOUR_AUTOPLAY = true;
      draw();
    } else {
      stopTourAutoplay();
      TOUR_ACTIVE = false;
      TOUR_MODAL = 'done';
      localStorage.setItem('sih_tour_done_' + (ME ? ME.id : 'anon'), '1');
      draw();
    }
  }, ms);
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
  if (a === 'tour-start' || a === 'tour-begin') {
    stopTourAutoplay();
    TOUR_STEP = 0;
    TOUR_MODAL = null;
    TOUR_ACTIVE = true;
    const steps = getTourSteps();
    if (steps[0] && steps[0].view) V = steps[0].view;
    return draw();
  }
  if (a === 'tour-toggle-auto') {
    if (TOUR_AUTOPLAY) {
      stopTourAutoplay();
    } else {
      TOUR_AUTOPLAY = true;
    }
    return draw();
  }
  if (a === 'tour-next') {
    stopTourAutoplay();
    const steps = getTourSteps();
    if (TOUR_STEP < steps.length - 1) {
      TOUR_STEP++;
      if (steps[TOUR_STEP] && steps[TOUR_STEP].view) V = steps[TOUR_STEP].view;
      return draw();
    } else {
      TOUR_ACTIVE = false;
      TOUR_MODAL = 'done';
      localStorage.setItem('sih_tour_done_' + (ME ? ME.id : 'anon'), '1');
      return draw();
    }
  }
  if (a === 'tour-back') {
    stopTourAutoplay();
    if (TOUR_STEP > 0) {
      TOUR_STEP--;
      const steps = getTourSteps();
      if (steps[TOUR_STEP] && steps[TOUR_STEP].view) V = steps[TOUR_STEP].view;
    }
    return draw();
  }
  if (a === 'tour-skip') {
    stopTourAutoplay();
    TOUR_ACTIVE = false;
    TOUR_MODAL = null;
    localStorage.setItem('sih_tour_done_' + (ME ? ME.id : 'anon'), '1');
    document.querySelectorAll('.tour-highlighted-element').forEach(node => node.classList.remove('tour-highlighted-element'));
    const old = $('tour-root');
    if (old) old.remove();
    return;
  }
  if (a === 'tour-close') {
    stopTourAutoplay();
    TOUR_MODAL = null;
    TOUR_ACTIVE = false;
    document.querySelectorAll('.tour-highlighted-element').forEach(node => node.classList.remove('tour-highlighted-element'));
    const old = $('tour-root');
    if (old) old.remove();
    return;
  }
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
    stopTourAutoplay();
    TOUR_ACTIVE = false;
    TOUR_MODAL = null;
    const old = $('tour-root');
    if (old) old.remove();
    return signout();
  }
  if (a === 'nav') {
    if (TOUR_ACTIVE || TOUR_MODAL) {
      stopTourAutoplay();
      TOUR_ACTIVE = false;
      TOUR_MODAL = null;
      document.querySelectorAll('.tour-highlighted-element').forEach(node => node.classList.remove('tour-highlighted-element'));
      const old = $('tour-root');
      if (old) old.remove();
    }
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
    else if (a === 'rot') { const r = await api('/identity/rotate', 'POST', {}); toast('New key ' + r.newKey); }
    else if (a === 'rev') { await api('/identity/revoke', 'POST', { userId: v }); toast('Key revoked; the identity can no longer sign'); }
    else if (a === 'lab') OUT = { lab: await api('/lab/run') };
  });
});
draw();
