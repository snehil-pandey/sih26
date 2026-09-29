# Security audit

Scope: the prototype generated earlier in this project (v0.1) was treated as untrusted, audited, attacked and rebuilt as v0.2. Status words: **Verified** (a test in `test/` passes), **Partially verified**, **Simulated**, **Not implemented**, **Known limitation**.

## A. Initial audit of v0.1
v0.1 could not be installed in the audit environment (`npm install better-sqlite3` → E403, registry blocked), so it was **UNTESTED as delivered**. It was then run once through a temporary node:sqlite shim to exercise the API; the findings below come from reading the code and that run.

| # | Finding | Class |
|---|---|---|
| 1 | Private keys stored as plaintext PEM in a normal SQLite column | SECURITY RISK |
| 2 | Public keys were not registered on the ledger; verification trusted the application DB (admin could swap a key) | SECURITY RISK / NOT IMPLEMENTED |
| 3 | "Validators" were rows in one table; one chain in one DB; no per-validator state; no divergence detection | PARTIALLY WORKING / SIMULATED |
| 4 | Ledger `restore` and `tamper` endpoints existed as normal admin API; `delete-tx` was a fixed refusal not a computed rule | SECURITY RISK / misleading |
| 5 | ML-KEM was a hash of a stored secret, not a KEM | SIMULATED, weak |
| 6 | Watermark = 8 hex characters, embedded once, no checksum | PARTIALLY WORKING |
| 7 | Tokens never expired; unauthenticated `/api/reset`; no login throttling; recipients could list all document names | SECURITY RISK |
| 8 | No CSP (inline script), watermarked plaintext stored unsealed, no input limits/validation on most fields | SECURITY RISK |
| 9 | Records did not include key id/version or document hash; authorizations not anchored | PARTIALLY WORKING |
| 10 | Audit log was a single administrator-writable SQL table used as the only history | SECURITY RISK |
| 11 | No automated tests | UNTESTED |
| 12 | UI verdicts were rendered from backend fields (no hardcoded `valid:true` found by grep) | WORKING (by inspection) |

## B. Fixes (v0.2) and their status
| Area | Status |
|---|---|
| Private keys AES-256-GCM sealed under scrypt(password); scan of every on-disk file, API responses and ledger finds no key material (with a positive control) | **Verified** |
| Public keys, versions, revocations, authorizations on the ledger; historical keys resolved from ledger state | **Verified** |
| Independent per-validator chains, per-validator tx validation, Ed25519 approvals, divergence/behind/invalid states | **Verified** (simulated consensus) |
| Six per-validator attack kinds detected with specific reasons; majority-tamper fails closed; resync repairs | **Verified** |
| All 12 provenance fields signature-protected; extra fields break the signature | **Verified** |
| Replay: ledger rules + DB UNIQUE | **Verified** |
| Rotation (V1/V2 both verify; V1 cannot sign), revocation (historical still verifies, new signing rejected at app and ledger) | **Verified** |
| Key-to-recipient binding, sender-signed authorizations, role rules on ledger (framing/forgery attempts rejected) | **Verified** |
| Admin cannot unlock recipient keys; app-DB edits do not alter attribution; audit split (ledger vs operational) | **Verified** |
| HTTP: authn, throttling, role checks, IDOR, injection strings, body limit, traversal, CORS, headers | **Verified** (targeted tests, not a pen-test) |
| Watermark: checksum, 3 copies, strip/forge/truncate cases | **Verified** for the simulated text mark only |
| KEM/signature/AEAD separation | **Verified** (separate primitives, tables, tests) |
| Offline operation: no dependencies, no network calls; tests and live run executed with network disabled | **Verified** |
| Post-quantum algorithms | **Simulated** (Node has no ML-DSA/ML-KEM) |
| Recipient-side signing with their own device key | **Not implemented** |
| Real distributed consensus/BFT, separate hosts | **Not implemented** |
| Watermark robustness, PDF/PNG/JPG embedding | **Not implemented / untested** |
| Browser UI | **Unverified** (never run in a browser) |

## C. Anti-pattern scan (grep over `src/`, `public/`, `server.js`)
No hardcoded verdicts (`valid:true` etc. appear only as initial values overwritten by computed results), no external hosts, no `Math.random`, no `eval`/child processes, no private-key logging, no third-party dependencies. The only literal secret is the documented demo password default (`demo1234`, overridable, flagged in KNOWN_LIMITATIONS).

## D. Test-suite quality check
Mutation run: 15 deliberate breakages of security checks. Two initially escaped (watermark checksum; ledger authorization anchoring caught only by the lab endpoint), tests were added, and both are now caught by dedicated tests. See TEST_RESULTS.md.
