# Threat model

| Threat | Mitigation in this prototype | Residual risk |
|---|---|---|
| Admin edits a historical record | Signature covers every field; hash chain; per-validator copies; no API mutates the ledger | Full-host compromise |
| Admin edits one validator's storage | Chain verification fails; approvals can't be re-forged; majority disagrees | Needs ≥3 validators to defeat |
| Admin replaces a public key | Ledger rejects duplicate key ids; rotation needs the prior key's endorsement | – |
| Admin/insider frames a recipient | Ledger requires the signing key to be bound to the named recipient; keys are sealed under the owner's credential | Server can sign for a logged-in user (KNOWN_LIMITATIONS) |
| Admin deletes/rewrites via the app DB | App DB is not authoritative; investigation uses ledger | – |
| Replay of a session/watermark/tx | Ledger rules + UNIQUE constraints | – |
| Unauthorized decryption | Backend check, uniform 403, atomic | – |
| Revoked/rotated key used | Ledger rejects | Compromise-window policy not modelled |
| Watermark stripped or degraded | Fails closed: NO_ATTRIBUTION | **Trivially removable text mark; robustness untested** |
| Forged well-formed watermark | No ledger record → no attribution | – |
| Validators offline | <3 in sync → commits refused (503, nothing persisted) | – |
| Session theft | 256-bit random tokens, in-memory, 8 h expiry, logout | No TLS by default; no MFA |
| Brute force | Per-username throttling (5/10 min) | Lockout DoS; scrypt offline guessing if DB stolen |
| Web attacks | CSP (`script-src 'self'`), output escaping, allow-listed static files, no CORS, parameterised SQL, body limit | Not pen-tested |
