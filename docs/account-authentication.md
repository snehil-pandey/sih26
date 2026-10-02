# Account Lifecycle & Authentication Specification

## 1. Overview
The SIH26237 system operates an account model where every actor is bound to a cryptographic identity on the permissioned ledger.

Unlike systems with static or pre-seeded accounts, SIH26237 supports dynamic self-registration, strong password-derived cryptographic sealing, authenticated sessions via HTTP-only cookies and bearer headers, and strict multi-user data isolation.

## 2. User Roles & Clearance Levels
- **RECIPIENT**: Authorized personnel who decrypt operational briefs. Decryption generates invisible watermarks and signs provenance records.
- **SENDER**: Operational commanders who author, classify, bulk-encrypt (AES-256-GCM), and encapsulate content keys (ML-KEM-768) for authorized recipients.
- **INVESTIGATOR**: Forensic officers who ingest leaked documents, recover zero-width watermarks, and verify multi-node ledger evidence.
- **ADMIN**: Infrastructure operators who manage node consensus, resynchronization, and user lifecycle. **Admins cannot be self-registered.**

## 3. Account Self-Registration (`POST /api/auth/register`)
### Allowed Self-Registration Roles:
- `RECIPIENT`
- `SENDER`
- `INVESTIGATOR`

*Attempting to register with `ADMIN` role is rejected with HTTP 400/403.*

### Registration Protocol:
1. **Input Validation**:
   - `name`: 1–100 characters.
   - `username`: 3–32 alphanumeric characters (`^[a-z0-9_.-]{3,32}$`).
   - `password`: 8–128 characters.
2. **Deterministic Monotonic Identifier**:
   - Sequential user IDs generated per prefix: `REC-0001`, `USR-0001`, etc.
3. **Cryptographic Key Generation**:
   - **Signature Keypair**: ML-DSA-65 (or Demo ECDSA-P256) keypair generated.
   - **Key Encapsulation Keypair**: ML-KEM-768 (or Demo X25519) keypair generated.
   - **Key Encryption Key (KEK)**: 256-bit key derived via `scrypt` from user password and dedicated salt.
   - Private keys sealed locally with AES-256-GCM under KEK. Private keys are never stored plaintext or shared with administrators.
4. **Ledger Public Key Registration**:
   - A `PUBLIC_KEY_REGISTRATION` transaction is signed and committed to the 5-node permissioned ledger network.
5. **Session Establishment**:
   - Issues an opaque 256-bit session token, sets an HTTP-only SameSite cookie (`sih_token`), and unlocks the KEK in memory for the active session.

## 4. Session & Cookie Authentication
- **Header**: `x-token: <hex-token>`
- **Cookie**: `sih_token=<hex-token>; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800; [Secure]`
- **Invalidation**: `POST /api/auth/logout` clears both server-side session memory and the browser cookie.
- **Password Rotation**: `POST /api/auth/change-password` re-seals private keys under a new scrypt-derived KEK and invalidates all existing sessions across devices.

## 5. Multi-User Isolation (IDOR Protection)
- **Documents**: Senders only see documents they created; recipients only see documents with active `GRANTED` ledger authorizations; investigators cannot view unshared classified briefs.
- **Investigations**: Investigators only see forensic investigation cases executed under their own account (`where by = ?`). Administrators maintain cross-case oversight.
- **Decryption Sessions**: Recipients only see sessions they initiated; senders see sessions for documents they authored.
- **Key Unsealing**: Key envelopes are protected under owner-specific KEKs. No administrator or peer account can unlock another user's private key.
