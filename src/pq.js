// Cryptographic primitive boundary. Everything "post-quantum" here is a SIMULATION built from classical
// primitives, because Node 22 exposes no ML-DSA / ML-KEM. Swap this file for a real PQC library to upgrade.
import c from 'node:crypto';
export const SIG_ALG = 'ML-DSA-65 (SIMULATED: ECDSA-P256/SHA-256)';
export const KEM_ALG = 'ML-KEM-768 (SIMULATED: X25519 ECDH-KEM + HKDF-SHA256)';
export const NODE_SIG_ALG = 'Ed25519 (classical validator approval key)';
const b64 = b => Buffer.from(b).toString('base64');
// ---- signatures (recipient identities) ----
export function sigKeypair() {
  const { publicKey, privateKey } = c.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { pub: b64(publicKey.export({ type: 'spki', format: 'der' })), priv: privateKey.export({ type: 'pkcs8', format: 'der' }) };
}
export const sigSign = (privDer, data) => b64(c.sign('sha256', Buffer.from(data), { key: privDer, format: 'der', type: 'pkcs8' }));
export function sigVerify(pubB64, data, sigB64) {
  try { return c.verify('sha256', Buffer.from(data), { key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' }, Buffer.from(sigB64, 'base64')); }
  catch { return false; }
}
// ---- KEM (key establishment; NOT a signature and NOT bulk encryption) ----
export function kemKeypair() {
  const { publicKey, privateKey } = c.generateKeyPairSync('x25519');
  return { pub: b64(publicKey.export({ type: 'spki', format: 'der' })), priv: privateKey.export({ type: 'pkcs8', format: 'der' }) };
}
const kdf = shared => Buffer.from(c.hkdfSync('sha256', shared, Buffer.alloc(0), 'SIH26237-KEM-v1', 32));
export function kemEncap(pubB64) {
  const e = c.generateKeyPairSync('x25519');
  const shared = c.diffieHellman({ privateKey: e.privateKey, publicKey: c.createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' }) });
  return { ct: b64(e.publicKey.export({ type: 'spki', format: 'der' })), key: kdf(shared) };
}
export function kemDecap(privDer, ctB64) {
  const shared = c.diffieHellman({ privateKey: c.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' }), publicKey: c.createPublicKey({ key: Buffer.from(ctB64, 'base64'), format: 'der', type: 'spki' }) });
  return kdf(shared);
}
// ---- validator approval keys (Ed25519) ----
export function nodeKeypair() {
  const { publicKey, privateKey } = c.generateKeyPairSync('ed25519');
  return { pub: b64(publicKey.export({ type: 'spki', format: 'der' })), priv: privateKey.export({ type: 'pkcs8', format: 'der' }) };
}
export const nodeSign = (privDer, data) => b64(c.sign(null, Buffer.from(data), { key: privDer, format: 'der', type: 'pkcs8' }));
export function nodeVerify(pubB64, data, sigB64) {
  try { return c.verify(null, Buffer.from(data), { key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' }, Buffer.from(sigB64, 'base64')); }
  catch { return false; }
}
// ---- symmetric AEAD (bulk encryption, key wrapping, keystore) ----
export function aeadEnc(key, plain, aad) {
  const iv = c.randomBytes(12), ci = c.createCipheriv('aes-256-gcm', key, iv);
  ci.setAAD(Buffer.from(aad)); const ct = Buffer.concat([ci.update(plain), ci.final()]);
  return { iv: iv.toString('hex'), tag: ci.getAuthTag().toString('hex'), ct: ct.toString('hex') };
}
export function aeadDec(key, o, aad) {
  const d = c.createDecipheriv('aes-256-gcm', key, Buffer.from(o.iv, 'hex'));
  d.setAAD(Buffer.from(aad)); d.setAuthTag(Buffer.from(o.tag, 'hex'));
  return Buffer.concat([d.update(Buffer.from(o.ct, 'hex')), d.final()]);
}
