import c from 'node:crypto';
import { CryptoProvider } from './crypto-provider.js';

const b64 = b => Buffer.from(b).toString('base64');

/**
 * ProductionPQCProvider:
 * Production-ready post-quantum cryptographic provider.
 * Implements NIST-standardized FIPS 203 (ML-KEM) and FIPS 204 (ML-DSA) algorithms.
 * Uses native Node.js crypto (OpenSSL 3.5+ provider) with complete offline/air-gapped execution.
 *
 * Algorithm details:
 * - Digital Signatures: ML-DSA-65 (NIST FIPS 204, Module-Lattice-Based Digital Signature Standard)
 * - Key Encapsulation: ML-KEM-768 (NIST FIPS 203, Module-Lattice-Based Key-Encapsulation Mechanism)
 * - Bulk Encryption: AES-256-GCM (NIST SP 800-38D) with AAD binding
 * - Validator Approvals: Ed25519 (RFC 8032)
 */
export class ProductionPQCProvider extends CryptoProvider {
  constructor() {
    super();
    // Validate runtime support upon instantiation
    ProductionPQCProvider.validateRuntime();
  }

  static validateRuntime() {
    try {
      const dsaTest = c.generateKeyPairSync('ml-dsa-65');
      if (!dsaTest.publicKey || !dsaTest.privateKey) {
        throw new Error('ML-DSA-65 key generation returned invalid key objects');
      }
      const kemTest = c.generateKeyPairSync('ml-kem-768');
      if (!kemTest.publicKey || !kemTest.privateKey) {
        throw new Error('ML-KEM-768 key generation returned invalid key objects');
      }
      if (typeof c.encapsulate !== 'function' || typeof c.decapsulate !== 'function') {
        throw new Error('Runtime lacks crypto.encapsulate / crypto.decapsulate functions for ML-KEM');
      }
    } catch (err) {
      throw new Error(`Production PQC runtime validation failed: ${err.message}. Ensure Node.js >= 24 with OpenSSL 3.5+ PQC support or a configured local PQC module.`);
    }
  }

  algorithmInfo() {
    return {
      provider: 'NIST Standardized PQC Provider (FIPS 203 / FIPS 204)',
      mode: 'PRODUCTION',
      isPostQuantum: true,
      signatureAlgorithm: 'ML-DSA-65 (NIST FIPS 204)',
      kemAlgorithm: 'ML-KEM-768 (NIST FIPS 203)',
      bulkEncryptionAlgorithm: 'AES-256-GCM',
      validatorAlgorithm: 'Ed25519',
      details: 'Standardized post-quantum module-lattice algorithms for digital signatures and key establishment with offline air-gapped execution.'
    };
  }

  // ---- Identity / Recipient Signatures: ML-DSA-65 ----
  generateSigningKeyPair() {
    const { publicKey, privateKey } = c.generateKeyPairSync('ml-dsa-65');
    return {
      pub: b64(publicKey.export({ type: 'spki', format: 'der' })),
      priv: privateKey.export({ type: 'pkcs8', format: 'der' })
    };
  }

  sign(privDer, data) {
    const key = c.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
    return b64(c.sign(null, Buffer.from(data), key));
  }

  verify(pubB64, data, sigB64) {
    try {
      const key = c.createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' });
      return c.verify(null, Buffer.from(data), key, Buffer.from(sigB64, 'base64'));
    } catch {
      return false;
    }
  }

  // ---- Key Establishment: ML-KEM-768 ----
  generateKemKeyPair() {
    const { publicKey, privateKey } = c.generateKeyPairSync('ml-kem-768');
    return {
      pub: b64(publicKey.export({ type: 'spki', format: 'der' })),
      priv: privateKey.export({ type: 'pkcs8', format: 'der' })
    };
  }

  encapsulate(pubB64) {
    const key = c.createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' });
    const res = c.encapsulate(key);
    // res.ciphertext (Buffer/Uint8Array), res.sharedKey (Buffer/Uint8Array, 32 bytes)
    return {
      ct: b64(res.ciphertext),
      key: Buffer.from(res.sharedKey)
    };
  }

  decapsulate(privDer, ctB64) {
    const key = c.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
    const sharedKey = c.decapsulate(key, Buffer.from(ctB64, 'base64'));
    return Buffer.from(sharedKey);
  }

  // ---- Validator Signatures (Ed25519) ----
  generateNodeKeyPair() {
    const { publicKey, privateKey } = c.generateKeyPairSync('ed25519');
    return {
      pub: b64(publicKey.export({ type: 'spki', format: 'der' })),
      priv: privateKey.export({ type: 'pkcs8', format: 'der' })
    };
  }

  nodeSign(privDer, data) {
    return b64(c.sign(null, Buffer.from(data), { key: privDer, format: 'der', type: 'pkcs8' }));
  }

  nodeVerify(pubB64, data, sigB64) {
    try {
      return c.verify(
        null,
        Buffer.from(data),
        { key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' },
        Buffer.from(sigB64, 'base64')
      );
    } catch {
      return false;
    }
  }

  // ---- Bulk Content Encryption (AES-256-GCM) ----
  aeadEncrypt(key, plain, aad) {
    const iv = c.randomBytes(12);
    const ci = c.createCipheriv('aes-256-gcm', key, iv);
    ci.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([ci.update(plain), ci.final()]);
    return { iv: iv.toString('hex'), tag: ci.getAuthTag().toString('hex'), ct: ct.toString('hex') };
  }

  aeadDecrypt(key, o, aad) {
    const d = c.createDecipheriv('aes-256-gcm', key, Buffer.from(o.iv, 'hex'));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(Buffer.from(o.tag, 'hex'));
    return Buffer.concat([d.update(Buffer.from(o.ct, 'hex')), d.final()]);
  }
}
