# Security model

## What a `VERIFIED_PROVENANCE_MATCH` supports
The artefact carries a watermark that maps to a provenance record, signed by a key registered on the ledger to that recipient identity, committed in a block approved by a validator quorum, in a chain that verifies, with a validator majority in agreement. It identifies a **decryption event**. It does not prove who physically disclosed the document, and the "post-quantum" signature is simulated.

## Trust assumptions
* Application server and host are trusted not to be fully compromised. Users' private keys are unlocked in server memory during their login session; validator keys sit under one master key on the same host.
* Compromise of one validator's storage, or of the application DB, is detected/harmless (tested). Compromise of ≥3 validators' storage makes the system **fail closed** (tested). Total host compromise defeats it.

## Controls and where they are tested
| Control | Test file |
|---|---|
| Private keys sealed; absent from DB plaintext, files, API, ledger | crypto-keys, http-security |
| All 12 signed record fields protected | crypto-keys, lab |
| Backend authorization; uniform 403; atomic failure | workflow, http-security |
| Role checks in routes **and** services | http-security, workflow |
| Replay: session, watermark, tx id, DB UNIQUE | workflow |
| Key binding to recipient; rotation endorsement; role immutability | admin-persistence, lifecycle-tamper |
| Revocation forward-only; history verifies | lifecycle-tamper |
| Per-validator tamper detection (6 attack kinds) and repair | lifecycle-tamper |
| Ledger is authoritative over the app DB | admin-persistence |
| Input validation, injection, traversal, CORS, headers, throttling | http-security |
