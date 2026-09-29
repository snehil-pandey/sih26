# Test results

Environment: Node v22.22.2, Linux, **network disabled** (npm registry returned 403). Zero npm dependencies. Command: `npm test` → `node --test`, run on the final code.

    # tests 45   # pass 45   # fail 0   # skipped 0   # duration ≈ 60 s

| File | Tests | Covers |
|---|---|---|
| crypto-keys.test.js | 8 | key generation, ledger registration, private-key protection (disk/API/ledger scan with positive control), signature generation/verification, every signed field, KEM/signature/AEAD separation |
| workflow.test.js | 10 | authorization (atomic denial), multiple decryptions, watermark uniqueness/extraction/checksum, block hashing, replay (session, watermark, tx, DB), signer binding, role checks in services, quorum loss, ledger-anchored authorizations |
| lifecycle-tamper.test.js | 8 | key rotation, revocation, end-to-end attribution (A and B decrypt → leak of B → investigation), artefact-only input, watermark attacks, six validator attack kinds + repair, specific failure reasons, majority tamper fails closed |
| admin-persistence.test.js | 7 | admin cannot use/replace keys or frame recipients, app-DB edits don't change attribution, audit separation, ledger-recorded admin ops, persistence across restart, sealed validator keys |
| http-security.test.js | 12 | login/logout/throttling, route roles, unauthorized decrypt over HTTP, IDOR, injection/validation/body limit, static allow-list & traversal, CORS/headers, no secrets in any response, no ledger-mutating routes, gated reset/attack simulation, computed validator/lab output |

## Live run (real server process, separate from the test runner)
Started `node server.js` on a fresh data dir: pages served (200); Nisha's decrypt of Falcon → 403; Riya's decrypt → signature valid, block committed; simulated leak → investigation `VERIFIED_PROVENANCE_MATCH` for REC-0217 with matching session and watermark, 10/10 steps ok, 5/5 validators in sync. Corrupted NODE-03 on disk, restarted the process: sessions/provenance/blocks unchanged (5/5/10), NODE-03 still reported INVALID (`signing key is not bound to the named recipient` at block #5), old login token rejected (401), resync → 5 IN_SYNC, new decrypt valid.

## Mutation check (each row: break one check in a copy of the code, run all 45 tests)
| Broken check | Failing tests |
|---|---|
| signature verify returns true on error | 4 |
| signature verify always true | 8 |
| block-hash check removed | 4 |
| previous-hash link check removed | 2 |
| validator-approval quorum check removed | 2 |
| replay check removed | 2 |
| revoked-key check removed | 3 |
| key↔recipient binding removed | 2 |
| authorization check in `decrypt` removed | 2 |
| investigation evidence ignores presented record | 2 |
| HTTP role check removed | 2 |
| private key stored unsealed | suite aborts (5 file-level failures; a crude break, since unlocking stops working) |
| watermark checksum ignored | **0 at first → 1 after adding a test** |
| ledger authorization anchoring removed | **1 (lab endpoint only) at first → 2 after adding a test** |
| control: no-op change | 0 (as required) |

## Not tested
The browser UI (never opened in a browser), load/scale, fuzzing, penetration testing, real PQC libraries, multi-host operation, watermark robustness, PDF/image artefacts, TLS deployment.
