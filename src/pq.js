// Cryptographic primitive boundary with provider delegation.
// Allows seamless backward compatibility while delegating all operations to the configured CryptoProvider.
import { DemoCryptoProvider } from './providers/demo-crypto-provider.js';

const defaultProvider = new DemoCryptoProvider();

export const SIG_ALG = defaultProvider.algorithmInfo().signatureAlgorithm;
export const KEM_ALG = defaultProvider.algorithmInfo().kemAlgorithm;
export const NODE_SIG_ALG = defaultProvider.algorithmInfo().validatorAlgorithm;

// ---- signatures (recipient identities) ----
export const sigKeypair = () => defaultProvider.generateSigningKeyPair();
export const sigSign = (privDer, data) => defaultProvider.sign(privDer, data);
export const sigVerify = (pubB64, data, sigB64) => defaultProvider.verify(pubB64, data, sigB64);

// ---- KEM (key establishment; NOT a signature and NOT bulk encryption) ----
export const kemKeypair = () => defaultProvider.generateKemKeyPair();
export const kemEncap = pubB64 => defaultProvider.encapsulate(pubB64);
export const kemDecap = (privDer, ctB64) => defaultProvider.decapsulate(privDer, ctB64);

// ---- validator approval keys ----
export const nodeKeypair = () => defaultProvider.generateNodeKeyPair();
export const nodeSign = (privDer, data) => defaultProvider.nodeSign(privDer, data);
export const nodeVerify = (pubB64, data, sigB64) => defaultProvider.nodeVerify(pubB64, data, sigB64);

// ---- symmetric AEAD (bulk encryption, key wrapping, keystore) ----
export const aeadEnc = (key, plain, aad) => defaultProvider.aeadEncrypt(key, plain, aad);
export const aeadDec = (key, o, aad) => defaultProvider.aeadDecrypt(key, o, aad);
