# API

Base `http://127.0.0.1:3000`. JSON. Send `x-token: <token>` from login. Errors: `{"error": "..."}` with 400 (validation), 401 (no/expired token), 403 (role or authorization), 404, 409 (duplicate), 413 (body > 1 MB), 422 (validators rejected a transaction), 429 (throttled), 503 (no validator quorum), 500 (generic message; details only in server log). No CORS headers are sent. Static files are served only for `/`, `/app.js`, `/app.css`.

| Method & path | Roles | Notes |
|---|---|---|
| POST `/api/auth/login` | public | `{username,password}` → `{token,user}`; 5 failures / 10 min / username → 429 |
| POST `/api/auth/logout` | any | invalidates the token |
| GET `/api/me` | any | |
| POST `/api/reset` | ADMIN, or loopback when demo mode | re-seeds everything; invalidates all tokens |
| GET `/api/dashboard` | any | counts from the DB; provenance count and validator state from the ledger |
| GET `/api/documents` | SENDER (own), RECIPIENT (authorized only), ADMIN | |
| POST `/api/documents` | SENDER | `{name≤120,cls,content≤200000,recipients[]}`; encrypts, wraps keys, submits sender-signed AUTHORIZATION txs |
| POST `/api/documents/:id/decrypt` | RECIPIENT | 403 uniformly for unknown/unauthorized; returns `{sessionId,watermarkId,transactionId,block,approvals,keyId,evidence,representation}` where `evidence` is computed from the ledger |
| GET `/api/sessions` | any (scoped by role) | |
| POST `/api/leaks` | SENDER (own docs), RECIPIENT (own session), ADMIN | `{sessionId}` |
| GET `/api/leaks` | INVESTIGATOR, ADMIN | id, ts, size only |
| POST `/api/investigations` | INVESTIGATOR, ADMIN | `{leakId}` or `{text,label}` → InvestigationResult |
| GET `/api/investigations` | INVESTIGATOR, ADMIN | |
| GET `/api/ledger/blocks` | any | verified majority chain |
| GET `/api/ledger/keys` | any | key registry derived from ledger state |
| POST `/api/ledger/validate` | any | `{ok,agreed,height,head,inSync,total,nodes[{id,sync,reason}]}` |
| POST `/api/ledger/verify` | SENDER, INVESTIGATOR, ADMIN | `{txId,overrides?}` → evidence for the presented record (overrides replace fields) |
| GET `/api/validators` | any | per node: `status, ledgerHeight, latestBlockHash, validation, sync, divergence, reason` |
| POST `/api/validators/:id/toggle` | ADMIN | recorded as a signed ADMIN_OPERATION on the ledger |
| POST `/api/validators/:id/resync` | ADMIN | replaces that validator's storage from the verified majority; recorded on ledger |
| POST `/api/lab/compromise` | ADMIN, demo mode only | `{nodeId,kind}`: modify-transaction, modify-block, modify-previous-hash, delete-block, replace-public-key, rewrite-consistently — affects ONE validator |
| GET `/api/lab/run` | INVESTIGATOR, ADMIN | 32 checks: `[{n,name,expected,actual,pass}]` on live data / throw-away sandboxes |
| GET `/api/identities` | any (own; ADMIN all) | never includes private key material |
| POST `/api/identity/rotate` | any (own key only) | ledger-registered, endorsed by the previous key |
| POST `/api/identity/revoke` | ADMIN | `{userId,reason?}`; recorded on ledger |
| GET `/api/audit` | SENDER, INVESTIGATOR, ADMIN | `{ledger[] (authoritative), operational[] (not authoritative), note}` |

There is intentionally **no** endpoint that edits or deletes ledger data (tested: PUT/PATCH/DELETE and former tamper/delete paths return 404).

**InvestigationResult**: `id,label,ts,steps[{name,ok,detail}],watermarkRecovered,watermarkId,provenanceFound,transactionId,blockId,recipientId,recipientName,sessionId,documentId,keyId,keyVersion,signatureValid,transactionValid,blockValid,chainValid,validatorAgreement{agreed,inSync,total,quorum,diverged[]},ledgerValid,attributionStatus (VERIFIED_PROVENANCE_MATCH | EVIDENCE_INVALID | NO_ATTRIBUTION),reason,statement,evidence`.
