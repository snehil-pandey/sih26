import c from 'node:crypto';
import { CryptoProvider } from './crypto-provider.js';

const b64 = b => Buffer.from(b).toString('base64');
const kdf = shared => Buffer.from(c.hkdfSync('sha256', shared, Buffer.alloc(0), 'SIH26237-KEM-v1', 32));

/**
 * DemoCryptoProvider:
 * Development/Demo cryptographic provider.
 * Implements classical primitives honestly labelled:
 * - Signature: ECDSA P-256 / SHA-256 (Development Provider)
 * - Key Establishment: X25519 ECDH + HKDF-SHA256 (Development Provider)
 * - Validator: Ed25519
 * - Bulk Encryption: AES-256-GCM
 */
export class DemoCryptoProvider extends CryptoProvider {
  algorithmInfo() {
    return {
      provider: 'Development / Demo Provider',
      mode: 'DEMO',
      isPostQuantum: false,
      signatureAlgorithm: 'ML-DSA-65 (SIMULATED: ECDSA-P256/SHA-256)',
      kemAlgorithm: 'ML-KEM-768 (SIMULATED: X25519 ECDH-KEM + HKDF-SHA256)',
      bulkEncryptionAlgorithm: 'AES-256-GCM',
      validatorAlgorithm: 'Ed25519 (classical validator approval key)',
      details: 'Classical development primitives for local testing and hackathon demonstration. Explicitly simulated; does not claim post-quantum security.'
    };
  }

  // ---- Identity / Recipient Signatures ----
  generateSigningKeyPair() {
    const { publicKey, privateKey } = c.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    return {
      pub: b64(publicKey.export({ type: 'spki', format: 'der' })),
      priv: privateKey.export({ type: 'pkcs8', format: 'der' })
    };
  }

  sign(privDer, data) {
    return b64(c.sign('sha256', Buffer.from(data), { key: privDer, format: 'der', type: 'pkcs8' }));
  }

  verify(pubB64, data, sigB64) {
    try {
      return c.verify(
        'sha256',
        Buffer.from(data),
        { key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' },
        Buffer.from(sigB64, 'base64')
      );
    } catch {
      return false;
    }
  }

  // ---- Key Establishment (KEM) ----
  generateKemKeyPair() {
    const { publicKey, privateKey } = c.generateKeyPairSync('x25519');
    return {
      pub: b64(publicKey.export({ type: 'spki', format: 'der' })),
      priv: privateKey.export({ type: 'pkcs8', format: 'der' })
    };
  }

  encapsulate(pubB64) {
    const e = c.generateKeyPairSync('x25519');
    const shared = c.diffieHellman({
      privateKey: e.privateKey,
      publicKey: c.createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' })
    });
    return {
      ct: b64(e.publicKey.export({ type: 'spki', format: 'der' })),
      key: kdf(shared)
    };
  }

  decapsulate(privDer, ctB64) {
    const shared = c.diffieHellman({
      privateKey: c.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' }),
      publicKey: c.createPublicKey({ key: Buffer.from(ctB64, 'base64'), format: 'der', type: 'spki' })
    });
    return kdf(shared);
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
