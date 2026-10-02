// Storage abstraction supporting local offline storage and hosted storage.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * StorageProvider Interface
 */
export class StorageProvider {
  info() { throw new Error('StorageProvider.info not implemented'); }
  read(key) { throw new Error('StorageProvider.read not implemented'); }
  write(key, data, options) { throw new Error('StorageProvider.write not implemented'); }
  exists(key) { throw new Error('StorageProvider.exists not implemented'); }
  delete(key) { throw new Error('StorageProvider.delete not implemented'); }
  mkdir(dirPath) { throw new Error('StorageProvider.mkdir not implemented'); }
}

/**
 * LocalStorageProvider
 * Persists data to the local filesystem (air-gapped, zero network requirements).
 */
export class LocalStorageProvider extends StorageProvider {
  constructor(baseDir = null) {
    super();
    this.baseDir = baseDir ? path.resolve(baseDir) : null;
    if (this.baseDir && !fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });
    }
  }

  info() {
    return {
      type: 'LOCAL',
      baseDir: this.baseDir,
      isEphemeral: !this.baseDir
    };
  }

  #resolve(relPath) {
    if (!this.baseDir) return relPath;
    return path.join(this.baseDir, relPath);
  }

  read(relPath) {
    const fullPath = this.#resolve(relPath);
    return fs.readFileSync(fullPath);
  }

  write(relPath, data, { mode = 0o600 } = {}) {
    const fullPath = this.#resolve(relPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(fullPath, data, { mode });
    return fullPath;
  }

  exists(relPath) {
    return fs.existsSync(this.#resolve(relPath));
  }

  delete(relPath) {
    const fullPath = this.#resolve(relPath);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }

  mkdir(relDir) {
    const fullPath = this.#resolve(relDir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true, mode: 0o700 });
    }
    return fullPath;
  }
}

/**
 * HostedStorageProvider
 * In serverless environments (e.g. Vercel), writable filesystem access is restricted to /tmp.
 * This adapter manages ephemeral /tmp staging or routes to an external blob/object storage provider.
 */
export class HostedStorageProvider extends StorageProvider {
  constructor(config = {}) {
    super();
    this.tmpDir = config.tmpDir || path.join(os.tmpdir(), 'sih26237-hosted');
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true, mode: 0o700 });
    }
    this.blobEndpoint = config.blobEndpoint || process.env.BLOB_READ_WRITE_TOKEN || null;
  }

  info() {
    return {
      type: 'HOSTED',
      tmpDir: this.tmpDir,
      hasBlobStorage: Boolean(this.blobEndpoint)
    };
  }

  #resolve(relPath) {
    return path.join(this.tmpDir, relPath);
  }

  read(relPath) {
    return fs.readFileSync(this.#resolve(relPath));
  }

  write(relPath, data, { mode = 0o600 } = {}) {
    const fullPath = this.#resolve(relPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(fullPath, data, { mode });
    return fullPath;
  }

  exists(relPath) {
    return fs.existsSync(this.#resolve(relPath));
  }

  delete(relPath) {
    const fullPath = this.#resolve(relPath);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }

  mkdir(relDir) {
    const fullPath = this.#resolve(relDir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true, mode: 0o700 });
    }
    return fullPath;
  }
}

/**
 * StorageProvider Factory
 */
export function createStorageProvider({ profile = 'local', dataDir = null } = {}) {
  const isHosted = String(profile).toLowerCase() === 'hosted' || Boolean(process.env.VERCEL);
  if (isHosted) {
    return new HostedStorageProvider();
  }
  return new LocalStorageProvider(dataDir);
}
