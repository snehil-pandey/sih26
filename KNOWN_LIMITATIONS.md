# Known limitations (read before relying on anything here)

Legend: **Implemented** = code exists and a test exercises it. **Simulated** = a stand-in for a production primitive/component. **Not implemented** = absent. **Unverified** = code exists but was not exercised in this environment.

## Cryptography
| Item | Status |
|---|---|
| ML-DSA-65 signatures | **Simulated.** ECDSA P-256/SHA-256 (classical, *not* post-quantum) behind the label `ML-DSA-65 (SIMULATED…)`. Node 22 offers no ML-DSA/SLH-DSA (checked: `generateKeyPairSync('ml-dsa-65')` fails). All PQ calls sit in `src/pq.js`; swapping in a real library changes that one file. |
| ML-KEM-768 key establishment | **Simulated.** X25519 ECDH + HKDF-SHA256 wraps the content key per recipient. Kept separate from signatures and from bulk encryption (tested). |
| Bulk encryption | **Implemented.** AES-256-GCM with AAD binding to document/recipient. |
| Validator approvals | **Implemented, classical.** Ed25519 signatures over the block hash. |
| Recipient signs with their **own** private key | **Not achieved as specified.** The server signs on the recipient's behalf using a key it unseals with a key derived from the user's password, held in server memory for the life of the login session. A compromised server while a user is logged in can sign as that user. A real deployment needs client-side/ HSM/smart-card signing. |
| Private-key storage | **Implemented, weaker than an HSM.** Sealed with AES-256-GCM under a scrypt-derived per-user key (never stored). Offline guessing of a weak password from a stolen DB is possible. Validator keys are sealed under a master key kept in `keystore/master.key` (mode 0600) or a passphrase (`SIH_KEYSTORE_PASSPHRASE`); whoever holds the master key and the validator files controls all five validators. |
| Timestamps | Server clock only; no trusted time source. |

## Ledger / consensus
- **Simulated permissioned consensus for prototype demonstration.** Five validators run in **one process** with **one master key** and separate SQLite files. Each validates independently and signs approvals, and a block needs 3 valid approvals, but there is no networking, leader election, view change, or Byzantine-fault-tolerance argument. Do not call it BFT.
- Someone controlling the whole host (all validator files + the master key) can rewrite history consistently. The design defends against a *single* corrupted validator/store, an application-database administrator, and a compromised application server that cannot obtain validator keys. It does not defend against total host compromise.
- One transaction per block, full chain re-verification on each request (fine for hundreds of blocks, not thousands).
- Authorization *grants* are anchored on the ledger; authorization *revocation* is not implemented. Documents are single-version (`1.0`).
- Revocation is not retroactive: signatures made before revocation stay valid. No compromise-window policy.

## Watermark
- **Simulated, text-only.** Zero-width characters carrying a random opaque ID with a checksum, repeated up to 3 times. It is removed by stripping zero-width characters, and it does not survive OCR, screenshots, printing/scanning, re-typing, or format conversion. **No robustness measurements exist.** PDF/PNG/JPG artefacts are not supported: an investigation of them reports no watermark (fails closed).
- A mark's absence is not evidence about any recipient.

## Web/API
- No TLS (binds to 127.0.0.1 by default). Login throttling is in-memory per username (also lets an attacker lock a user out for 10 minutes). Tokens are random 256-bit values held in memory; a restart logs everyone out (deliberate: unlocked keys are not persisted). No password change/reset flow, no MFA.
- Demo accounts share one password (`demo1234` unless `SIH_DEMO_PASSWORD` is set). **Set `SIH_DEMO_MODE=0` and change the password outside demos**: demo mode enables loopback `POST /api/reset` and the admin attack-simulation endpoint.
- The plaintext document is recoverable server-side (the server unwraps content keys for the logged-in recipient, and stores each watermarked representation sealed under the master key).
- Node's `node:sqlite` module is used (Node ≥ 22.13); it may print an experimental warning on some versions.

## Verification gaps
- **The browser UI has not been run in a browser.** It was syntax-checked, is served correctly by the tested HTTP layer, and only renders API fields, but layout and click-paths are unverified.
- Tests ran on Node v22.22.2 on Linux with no network access. No load, fuzzing, penetration or side-channel testing was done.
- A test-suite mutation run (see TEST_RESULTS.md) is evidence the tests detect broken checks, not proof of security.
