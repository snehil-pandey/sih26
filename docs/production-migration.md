# Production Migration Guide: Moving from Demo to Production Mode

This operational document describes the process of transitioning the SIH26237 attribution system from **Demo Mode** to **Production Mode** without modifying or rewriting application logic.

---

## 1. Prerequisites Checklist

Before enabling Production Mode, ensure the following air-gapped infrastructure components are in place:

1. **PQC Runtime Environment**:
   - Node.js runtime supporting NIST FIPS 203 (ML-KEM) and FIPS 204 (ML-DSA) key generation, signature, and encapsulation natively or via an auditable local library.
   - Run `node -e "crypto.generateKeyPairSync('ml-dsa-65'); crypto.generateKeyPairSync('ml-kem-768');"` to verify local kernel/runtime readiness.
2. **Permissioned DLT Network**:
   - An organization-operated, private, air-gapped permissioned blockchain or DLT network (e.g. Hyperledger Fabric, private Raft consensus cluster).
   - Local IPC domain socket or TLS mutual-authentication endpoint reachable on the isolated network.
   - **Prohibited**: Public blockchains, cryptocurrencies, cloud RPC services (Infura, Alchemy, etc.).
3. **Secure Key Management**:
   - Hardware security module (HSM), TPM 2.0 enclave, or smart-card reader for recipient endpoints.
   - Air-gapped root trust anchors for identity public-key certification.
4. **Air-Gapped Policy Verification**:
   - Verify that no cloud KMS environment variables (`AWS_KMS`, `AZURE_KEYVAULT`, `GCP_KMS`) exist in the environment.

---

## 2. Step-by-Step Migration Procedure

### Step 1: Install and Verify Cryptographic Provider
Verify that `ProductionPQCProvider` (`src/providers/production-pqc-provider.js`) binds to the certified ML-DSA-65 and ML-KEM-768 implementations:
```bash
node -e "import('./src/providers/index.js').then(m => console.log(new m.ProductionPQCProvider().algorithmInfo()))"
```

### Step 2: Configure Permissioned DLT Connection
Configure the connection parameters for the private DLT network in an environment file or deployment descriptor:
```bash
export DLT_ENDPOINT="ipc:///var/run/dlt/validator.sock"
export DLT_NODES="NODE-01,NODE-02,NODE-03,NODE-04,NODE-05"
export DLT_QUORUM="3"
```

### Step 3: Enroll Operator and Recipient Identities
Generate and certify recipient keypairs with NIST ML-DSA-65:
- Each user signs an initial `PUBLIC_KEY_REGISTRATION` transaction with proof-of-possession.
- Submit key registration transactions directly to the genesis block of the permissioned DLT.

### Step 4: Configure Robust Watermark Pipeline
Ensure the media transform library is present if processing non-text representations (PDF, PNG raster artifacts):
- The `ProductionWatermarkProvider` will enforce transform-domain bounds.

### Step 5: Execute Startup Validation
Run startup validation in dry-run mode to confirm all prerequisites pass:
```bash
node -e "import('./src/providers/index.js').then(m => m.validateProductionEnvironment({ ledgerConfig: { endpoint: process.env.DLT_ENDPOINT, nodes: process.env.DLT_NODES.split(',') } }))"
```
*Note: If any production component is missing, startup validation will fail immediately with a fatal diagnostic error.*

### Step 6: Switch Mode to Production
Set the deployment mode environment variable:
```bash
export APP_MODE=production
```

### Step 7: Launch Server and Verify Active Mode
Launch the application:
```bash
node server.js
```

Verify that server startup logs and `/api/environment` reflect:
- `MODE: PRODUCTION`
- `CRYPTOGRAPHY: ML-DSA-65 (NIST FIPS 204)`
- `KEY ESTABLISHMENT: ML-KEM-768 (NIST FIPS 203)`
- `LEDGER: Enterprise Permissioned DLT`

Confirm that all attack simulation endpoints (`/api/lab/compromise`) and reset endpoints (`/api/reset`) are blocked with HTTP 403.
