# Architecture

    Browser UI (public/*) ──HTTP/JSON──▶ src/http.js (auth, roles, validation, headers)
                                              │
                                        src/app.js  services: auth · identities · documents · decrypt · leak · investigate · admin · lab
                          ┌───────────────────┼─────────────────────┐
                    src/pq.js + keystore   src/watermark.js     src/provenance.js ── src/ledger.js
                    (primitives, sealing)  (text mark, sim.)    (tx builders,         (5 validators, own storage,
                                                                 evidence)             tx rules, consensus)
    Application DB (data/app.db, operational state)          Validator DBs (data/validators/NODE-0x.db, one full chain each)

## Two stores, on purpose
* **Application DB** – operational state: users, sealed keys, documents, authorizations, sessions, artefacts, investigation records, operational log. Administrator-writable and **not authoritative** for provenance.
* **Ledger** – five validators, each with its **own** SQLite file holding its own copy of the chain. Authoritative for public keys (registrations, rotations, revocations), authorizations, provenance records and administrative operations. Investigations resolve keys and records from the ledger, never from the application DB (tested: editing the app DB does not change attribution).

## Cryptographic roles (never mixed)
| Purpose | Primitive | Status |
|---|---|---|
| Bulk document encryption | AES-256-GCM (AAD-bound) | real |
| Recipient key establishment | "ML-KEM-768" = X25519 + HKDF | **simulated** |
| Recipient signatures | "ML-DSA-65" = ECDSA P-256 / SHA-256 | **simulated** |
| Validator approvals | Ed25519 over block hash | real, classical |
| Private-key protection | AES-256-GCM under scrypt(password) (users) / master key (validators) | real; not an HSM |

## Ledger transaction types and rules (`applyTx`, enforced independently by every validator)
`VALIDATOR_REGISTRATION` (genesis only) · `PUBLIC_KEY_REGISTRATION` (proof of possession; rotation needs the previous key's endorsement, same role and subject) · `KEY_STATUS_CHANGE` (revocation; ADMIN, or the identity itself) · `AUTHORIZATION` (SENDER-signed: document, version, content hash, recipient) · `PROVENANCE` (must name a registered ACTIVE key bound to that recipient, match its ledger authorization, and carry a valid signature; session and watermark ids must be unused) · `ADMIN_OPERATION` (ADMIN-signed record of legitimate admin actions).

Block = `{idx, ts, prev, txs, proposer, hash, approvals[{node, sig}]}`, `hash = SHA-256(canonical{idx,ts,prev,txs,proposer})`. A block commits when ≥3 validators, each having validated the transactions against **their own** ledger state, sign it. `verifyChain` checks continuity, link, every transaction, block hash and approvals against validator keys registered in the genesis block. Validator status: IN_SYNC, BEHIND (valid prefix), INVALID (chain fails verification), DIVERGED, OFFLINE.

## Decryption (`decrypt`)
Backend authorization check (uniform 403 for unknown or unauthorized document) → active-key check → unwrap KEM secret with the caller's unlocked key → unwrap content key → decrypt → new session id + random watermark id → embed → build canonical provenance record → sign → in one DB transaction: `ledger.submit` (validators validate and approve) + insert session. Any failure rolls back: no session, watermark or transaction is left behind (tested).

## Investigation
Input is only an artefact. Extract watermark → validate structure → search the verified majority chain → resolve the historical key from ledger state → verify signature over the presented record → verify transaction/block (hash + approvals)/chain → compare all validators. Status: `VERIFIED_PROVENANCE_MATCH`, `EVIDENCE_INVALID`, `NO_ATTRIBUTION`.

## Not architecture, but honest: all five validators run in one process under one master key (KNOWN_LIMITATIONS.md).
