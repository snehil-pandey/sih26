# SIH26237 User Guide & System Walkthrough (HOW-TO.md)

This document provides a comprehensive operational guide for the **SIH26237 Cryptographic Decryption Provenance & Attribution System**. It explains how to launch and navigate the system, what each type of user can do, what to expect from each action, and the realistic boundaries of the prototype.

---

## 1. Quick Start & Setup

### System Prerequisites
- **Node.js**: Version `>= 22.13` (uses native `node:sqlite`, `node:crypto`, `node:http`).
- **Dependencies**: Zero external dependencies (no `npm install` needed).

### Starting the Application
From the project root (`D:\Dev\Projects\sih26237`):

1. **Local Access Only (Default):**
   ```powershell
   npm start
   ```
   Open your browser to: [http://127.0.0.1:3000](http://127.0.0.1:3000)

2. **Access via Local Wi-Fi / LAN (Multi-device Testing):**
   ```powershell
   $env:HOST="0.0.0.0"; npm start
   ```
   Open your browser on any phone or laptop on the same Wi-Fi using your machine's IP (e.g. `http://<YOUR_WIFI_IP>:3000`).

3. **Reset Database to Clean State:**
   ```powershell
   npm run reset
   ```

4. **Execute Test Suite (45 automated tests):**
   ```powershell
   npm test
   ```

---

## 2. Pre-Seeded Accounts & Roles

All demo accounts use the standard password: **`demo1234`**

| Username | Role | Primary Function |
| :--- | :--- | :--- |
| `sender` | **SENDER** | Creates and encrypts broadcast documents; authorizes recipients |
| `aarav` | **RECIPIENT** | Authorized field officer; decrypts documents; receives unique watermark |
| `riya` | **RECIPIENT** | Authorized field officer; decrypts documents; can simulate leaks |
| `kabir` | **RECIPIENT** | Authorized field officer; decrypts documents |
| `nisha` | **RECIPIENT (Unauthorized)** | Recipient not authorized for standard files; tests access control |
| `forensic` | **INVESTIGATOR** | Inspects leaked documents; extracts watermarks; verifies ledger provenance |
| `admin` | **ADMIN** | Manages validator nodes, inspects ledger health, simulates attacks |

---

## 3. User Walkthroughs (Role-by-Role Point of View)

```
       [ HQ Sender ]
             │
             ▼ Encrypt & Authorize
   [ Broadcast Package ] ──▶ Multiple Authorized Recipients
             │
             ▼ Recipient Decrypts (Dynamic Watermarking + Signature)
  [ Decentralized Ledger ] ──▶ 5 Validator Nodes (≥ 3 Quorum Required)
             │
             ▼ Document Leaks
  [ Forensic Station ] ──▶ Trace watermark -> Verify ledger & signature -> Attribution
```

---

### POV 1: Document Creator (`sender`)
**Objective:** Publish classified documents, encrypt them using post-quantum key encapsulation, and submit authorization transactions to the ledger.

#### Step-by-Step Actions:
1. Log in as **`sender`** (password: `demo1234`).
2. Go to the **Documents** view.
3. Review the existing pre-seeded document: `Operation Falcon` (Classified: SECRET).
4. Click **Create Document** (or use the form):
   - **Title / Name**: e.g., `Border Reconnaissance Report Alpha`
   - **Classification**: `TOP_SECRET`
   - **Content**: Enter the sensitive intelligence text.
   - **Authorized Recipients**: Select `aarav`, `riya`, and `kabir`. (Exclude `nisha`).
5. Click **Publish / Encrypt**.

#### What Happens Behind the Scenes:
- A random 256-bit symmetric content key (CEK) is generated.
- The document content is encrypted once using **AES-256-GCM**.
- The CEK is individually encapsulated for each authorized recipient using their public KEM key (`kemEncap()`).
- The sender creates and signs an `AUTHORIZATION` transaction for every recipient with their private signing key.
- These authorization transactions are submitted to the 5 validator nodes and committed in a new ledger block.

#### What to Expect:
- The document is added to the system catalog.
- Only the sender and the explicitly selected authorized recipients can see or unlock the document.

---

### POV 2: Authorized Recipient (`aarav` or `riya`)
**Objective:** Unlock and read authorized documents, inspect the dynamically generated forensic watermark, and understand provenance commitment.

#### Step-by-Step Actions:
1. Log in as **`aarav`** (or **`riya`**).
2. Go to **Documents**.
3. Select an authorized document (e.g. `Operation Falcon`).
4. Click **Decrypt**.
5. Navigate to the **Sessions** view to review the decrypted record.

#### What Happens Behind the Scenes:
1. **Key Decapsulation:** The recipient unseals their private KEM key and decapsulates the shared secret to obtain the document's symmetric CEK.
2. **Dynamic Watermarking:** The client creates a fresh, random watermark identifier (`WM-XXXX`) and embeds it invisibly into the text using zero-width characters.
3. **Cryptographic Signing:** The recipient builds a canonical provenance record (containing `documentId`, `recipientId`, `sessionId`, `watermarkId`, and timestamp) and signs it using their **private signing key** (`ML-DSA / ECDSA`).
4. **Ledger Commit:** The signed provenance record is submitted as a `PROVENANCE` transaction to the decentralized ledger. Validators verify that:
   - The recipient's public key is active on the ledger.
   - The recipient has an active `AUTHORIZATION` transaction from the sender.
   - The session ID and watermark ID have never been used before (replay prevention).
5. Once $\ge 3$ validators approve the block, the decrypted document is shown.

#### What to Expect:
- Both `aarav` and `riya` read the **exact same text**. To human eyes, there is zero difference.
- However, if you inspect their **Sessions** tab:
  - `aarav` will have a session with its own `sessionId`, `watermarkId` (e.g. `WM-A94F...`), and block number.
  - `riya` will have a completely different `sessionId`, `watermarkId` (e.g. `WM-E12B...`), and transaction hash.
- **Simulate Leak Feature:** When logged in as `riya`, you can go to **Sessions** and click **Simulate Leak**. This exports her uniquely watermarked plaintext into the leak inbox for investigation.

---

### POV 3: Unauthorized User (`nisha`)
**Objective:** Verify that access control and cryptographic boundaries strictly prevent unauthorized access.

#### Step-by-Step Actions:
1. Log in as **`nisha`** (password: `demo1234`).
2. Go to **Documents**.

#### What to Expect:
- Nisha does not have an encapsulated key capsule or an `AUTHORIZATION` transaction on the ledger for `Operation Falcon`.
- If an unauthorized direct API request is attempted (`POST /api/documents/:id/decrypt`), the server returns a uniform `403 Forbidden`.
- **Zero Evidence Left Behind:** No session is created, no watermark is issued, and no transaction is appended to the ledger.

---

### POV 4: Forensic Investigator (`forensic`)
**Objective:** Inspect a leaked document, extract the hidden forensic watermark, query the distributed ledger, and prove attribution.

#### Step-by-Step Actions:
1. Ensure a leak was simulated (e.g., by `riya` in Step 2).
2. Log in as **`forensic`** (password: `demo1234`).
3. Navigate to **Investigations**.
4. You will see the list of leaked artefacts. Click **Investigate** on the recent leak.
   *(Alternatively, paste arbitrary suspected text into the manual investigation box).*
5. Review the forensic verdict.

#### What to Expect & Output Breakdown:
The system performs a 7-step automated verification pipeline:
1. **Watermark Recovery:** The extractor strips zero-width encodings and recovers the `watermarkId` and validates its checksum.
2. **Ledger Search:** Queries the verified majority blockchain for the corresponding `PROVENANCE` transaction.
3. **Key Resolution:** Identifies the recipient public key registered on the ledger at the time of decryption.
4. **Signature Verification:** Verifies the cryptographic signature against the canonical record.
5. **Ledger & Consensus Check:** Confirms the block hash, verifies that at least 3 of 5 validators approved the block, and verifies hash-chain continuity back to the genesis block.
6. **Authorization Matching:** Matches the record back to the sender's original authorization transaction.
7. **Final Verdict:** Displays `VERIFIED_PROVENANCE_MATCH`:
   - Identified Recipient: **Riya**
   - Exact Decryption Timestamp & Session ID
   - Validator Agreement: 5/5 In-Sync
   - Mathematical Certainty: The leaker cannot claim "someone else decrypted it" or "the server framed me".

---

### POV 5: System Administrator & Auditor (`admin`)
**Objective:** Monitor decentralized ledger consensus, inspect validator health, simulate adversarial tamper attacks, and run security tests.

#### Step-by-Step Actions:

#### 1. Monitor Consensus & Validators
- Go to the **Validators** tab.
- View the 5 validator nodes (`NODE-01` to `NODE-05`).
- Check their sync state, block height, and latest block hash. All 5 should normally show `IN_SYNC`.

#### 2. Simulate Adversarial Attacks (Tamper Testing)
The system includes built-in adversarial attack simulation to prove resilience against corrupt or rogue nodes:
- Select a node (e.g., `NODE-03`).
- Choose an attack from the lab dropdown:
  - `modify-transaction`: Alters transaction payload inside `NODE-03`'s database.
  - `modify-block`: Changes block metadata.
  - `modify-previous-hash`: Breaks the cryptographic block hash chain.
  - `delete-block`: Drops a block to simulate data loss.
  - `replace-public-key`: Attempts to substitute an identity's public key.
- Click **Apply Attack**.

#### What to Expect After an Attack:
- `NODE-03` immediately flags as **`INVALID`** or **`DIVERGED`**.
- **Consensus Remains Operational:** The other 4 nodes still hold the valid majority ($\ge 3$ quorum).
- If you run a forensic investigation now, the investigation **still succeeds** because it queries the verified consensus majority, while displaying a clear audit warning that `NODE-03` is diverged.
- Click **Resync** on `NODE-03`: The node is repaired from the majority ledger and returns to `IN_SYNC`.

#### 3. Run the Security Lab
- Go to the **Security Lab** view.
- Click **Run All 32 Security Checks**.
- Evaluates test cases including replay attacks, malformed signatures, role privilege escalation, unauthorized key rotations, and ledger tampering.

---

## 4. Summary of System Expectations & Guarantees

| Guarantee | System Behavior |
| :--- | :--- |
| **Identical Plaintext** | All authorized recipients see the same readable document text. |
| **Unique Fingerprint** | Every single decryption event receives a completely distinct watermark and session ID. |
| **Non-Repudiation** | The recipient's private key signs the decryption event. An officer cannot claim they did not decrypt it. |
| **Tamper Resistance** | An administrator editing the application database cannot forge or rewrite provenance. Provenance is resolved exclusively from the multi-validator ledger. |
| **Fault Tolerance** | Up to 2 of the 5 validator nodes can fail or be corrupted without stopping verification or corrupting historical truth. |

---

## 5. Prototype Limitations (Realistic Transparency)

As documented in `KNOWN_LIMITATIONS.md`:
1. **PQC Simulation:** Uses classical algorithms (ECDSA P-256 and X25519) under simulated post-quantum labels (`ML-DSA-65`, `ML-KEM-768`) because standard Node.js does not yet provide native post-quantum primitives.
2. **Text-Only Watermarking:** Uses zero-width unicode characters. It demonstrates the complete end-to-end attribution lifecycle in software, but zero-width characters do not survive image OCR, camera capture, or printouts.
3. **Local Multi-Node Simulation:** All 5 validator SQLite databases run on the local machine within the same host environment for ease of hackathon evaluation and demonstration.
