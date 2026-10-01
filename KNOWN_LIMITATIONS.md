# Known limitations (read before relying on anything here)

Legend: **Implemented** = code exists and an automated test exercises it. **Simulated** = a technically honest stand-in for a production primitive/component. **Hardened (Prototype)** = architectural gap closed at prototype level, pending production infrastructure. **Not implemented** = absent. **Unverified** = code exists but was not exercised in this environment.

---

## Cryptography
| Item | Status | Technical Details |
|---|---|---|
| ML-DSA-65 signatures | **Simulated.** | ECDSA P-256/SHA-256 (classical, *not* post-quantum) behind the label `ML-DSA-65 (SIMULATED PQC ECDSA P-256 / SHA-256)`. Node 22 offers no native ML-DSA/SLH-DSA. All PQ calls sit in `src/pq.js`; swapping in a real FIPS 204 library requires changing only that one file. |
| ML-KEM-768 key establishment | **Simulated.** | X25519 ECDH + HKDF-SHA256 wraps the content encryption key (CEK) per recipient under label `ML-KEM-768 (SIMULATED PQC X25519 + HKDF-SHA256)`. Kept strictly separate from signatures and bulk encryption (tested). |
| Bulk encryption | **Implemented.** | AES-256-GCM with authenticated associated data (AAD) binding to document ID and version. |
| Validator approvals | **Implemented, classical.** | Ed25519 signatures over the canonical block hash. |
| Recipient client-side signing | **Hardened (Prototype).** | The backend supports an explicit **client-side signing architecture**: when a client provides a pre-signed provenance record (`clientSignedRecord: { record, sig }`), the server accepts and commits the client-held signature to the ledger **without unsealing the recipient's private signing key on the server**. A backward-compatible server-unsealing fallback remains supported for clients lacking local key storage. True hardware isolation (HSM/smart-card/WebAuthn PIV) requires physical client hardware. |
| Private-key storage & Isolation | **Hardened (Prototype).** | User private keys are sealed with AES-256-GCM under scrypt-derived per-user KEKs. **Validator key isolation is implemented**: each validator node derives an independent, domain-separated master key (`keystore.forValidator(nodeId)`) rather than sharing a single global key. Compromise of an individual validator node key does not yield the keys of other validators. True hardware security modules (HSM) remain a production requirement. |
| Authenticated Password Change | **Implemented.** | Re-encrypts sealed signature and KEM private keys under a newly derived scrypt KEK and salt, invalidating all existing sessions. |
| Timestamps | **Simulated.** | Abstracted via `TimestampProvider` (`LocalServerClock` default). Production deployment requires an RFC 3161 / Authenticated Network Time Protocol / hardware TSA. |

---

## Ledger / Consensus
- **Simulated permissioned consensus for prototype demonstration.** Five validators run in **one process** with **isolated, domain-separated validator keys** and separate SQLite databases. Each validates transactions independently and signs approvals; a block requires 3-of-5 valid approvals. There is no distributed network socket layer, view-change protocol, or formal BFT proof. Do not call it BFT.
- **Authorization Revocation is Implemented:** Document owners can issue ledger-anchored `AUTHORIZATION_REVOCATION` transactions. The consensus engine enforces revocation at transaction submission time, and the application layer immediately terminates decryption capability (`HTTP 403`). Revocation is non-retroactive: pre-revocation provenance records remain cryptographically valid and tamper-evident on the ledger.
- Full chain re-verification occurs per block commit (appropriate for demonstration, not high-throughput distributed scale).
- Someone with total host root compromise (access to all validator data directories and physical server memory) can rewrite host state. The design defends against a *single* corrupted validator store, rogue database administrators, and compromised application servers unable to obtain validator keys.

---

## Watermark & Forensics
- **Simulated, text-only zero-width steganography.** Carries a 16-character random opaque ID with an 8-character checksum, repeated up to 3 times in decrypted document representations.
- **Explicit forensic classification is Implemented:** Forensic investigation returns explicit, machine-readable status codes:
  - `WATERMARK_FOUND`: Valid watermark extracted and checksum verified.
  - `NO_SUPPORTED_WATERMARK_FOUND`: Clean text or mark removed (investigation fails closed; no recipient attribution claimed).
  - `WATERMARK_INTEGRITY_FAILED`: Malformed mark, forged structure, or corrupted checksum detected.
  - `UNSUPPORTED_ARTIFACT_TYPE`: Non-text artifacts (PDF, PNG, JPG) explicitly rejected with no attribution.
- **Fragility limitation:** Zero-width Unicode marks do not survive OCR, screenshotting, rasterization, printing, or plain-text stripping. Robust media watermarking remains a production-grade requirement.

---

## Web, Network & Deployment Security
- **TLS Support is Implemented:** HTTPS is natively supported via `tls` server configuration or environment variables `TLS_CERT_PATH` and `TLS_KEY_PATH`.
- **Demo Mode Isolation:** Attack simulation (`/api/lab/compromise`) and `/api/reset` are explicitly gated behind `SIH_DEMO_MODE !== '0'` (returning `HTTP 403` when disabled).
- **Authentication & Sessions:** Opaque 256-bit memory-backed bearer tokens; brute-force login throttling per username; no persistent plain credentials.
- **Client UI:** Web portal provides role-based interfaces for Sender, Recipient, Investigator, and Administrator, including password management, authorization revocation, and validator health monitoring.

---

## Verification Gaps
- Tested on Node.js v22 on Windows and Linux. All 49 automated unit, cryptographic, and workflow tests pass cleanly.
- No hardware penetration testing, fault injection, fuzzing, or side-channel analysis has been performed.
