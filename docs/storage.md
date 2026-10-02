# Storage Architecture Specification

## 1. Purpose
The SIH26237 architecture decouples physical persistence from core cryptographic workflows through uniform provider interfaces:
- `DatabaseProvider` (defined in [src/db.js](file:///D:/Dev/Projects/sih26237/src/db.js))
- `StorageProvider` (defined in [src/storage.js](file:///D:/Dev/Projects/sih26237/src/storage.js))

This abstraction ensures that the application operates identically whether persisting locally to an air-gapped machine or inside a serverless environment (e.g. Vercel).

---

## 2. StorageProvider Interface
Every storage adapter implements:
- `info()`: Returns metadata describing the storage backend, directory, and ephemeral status.
- `read(relPath)`: Synchronously or asynchronously reads file buffers.
- `write(relPath, data, options)`: Writes file buffers with restrictive permissions (`mode: 0o600`).
- `exists(relPath)`: Confirms presence of a designated relative path.
- `delete(relPath)`: Securely removes files.
- `mkdir(relDir)`: Ensures parent directories exist (`mode: 0o700`).

---

## 3. Implementations

### LocalStorageProvider
- **Use Case**: Offline workstations, defense installations, standalone servers.
- **Behavior**: Direct synchronous file operations using Node's `node:fs`.
- **Directory**: `data/keystore`, `data/validators`, `data/app.db`.
- **Security**: Files sealed with restrictive posix permissions (`0o600` for files, `0o700` for directories).

### HostedStorageProvider
- **Use Case**: Hosted serverless cloud platforms (Vercel, AWS Lambda).
- **Behavior**: Routes persistent filesystem requests into `/tmp/sih26237-hosted` (the only writable directory in serverless containers).
- **Blob Extension**: Pluggable adapter hooks for Vercel Blob / S3-compatible endpoints when persistent multi-instance cold-start storage is required.

---

## 4. Factory Instantiation
```javascript
import { createStorageProvider } from './storage.js';

// Automatically selects Local or Hosted based on DEPLOYMENT_PROFILE or process.env.VERCEL
const storage = createStorageProvider({
  profile: process.env.DEPLOYMENT_PROFILE || 'local',
  dataDir: './data'
});
```
