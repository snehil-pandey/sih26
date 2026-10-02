/**
 * Stable Base CryptoProvider Interface.
 * Every cryptographic provider implementation must conform to this interface.
 */
export class CryptoProvider {
  /**
   * Returns metadata describing the active cryptographic algorithms and provider implementation.
   * @returns {{
   *   provider: string,
   *   mode: 'DEMO' | 'PRODUCTION',
   *   isPostQuantum: boolean,
   *   signatureAlgorithm: string,
   *   kemAlgorithm: string,
   *   bulkEncryptionAlgorithm: string,
   *   validatorAlgorithm: string,
   *   details: string
   * }}
   */
  algorithmInfo() {
    throw new Error('algorithmInfo() not implemented');
  }

  // ---- Identity / Recipient Signatures ----
  generateSigningKeyPair() {
    throw new Error('generateSigningKeyPair() not implemented');
  }

  sign(privDer, data) {
    throw new Error('sign() not implemented');
  }

  verify(pubB64, data, sigB64) {
    throw new Error('verify() not implemented');
  }

  // ---- Key Establishment (KEM) ----
  generateKemKeyPair() {
    throw new Error('generateKemKeyPair() not implemented');
  }

  encapsulate(pubB64) {
    throw new Error('encapsulate() not implemented');
  }

  decapsulate(privDer, ctB64) {
    throw new Error('decapsulate() not implemented');
  }

  // ---- Validator Signatures ----
  generateNodeKeyPair() {
    throw new Error('generateNodeKeyPair() not implemented');
  }

  nodeSign(privDer, data) {
    throw new Error('nodeSign() not implemented');
  }

  nodeVerify(pubB64, data, sigB64) {
    throw new Error('nodeVerify() not implemented');
  }

  // ---- Bulk Content Encryption (AEAD) ----
  aeadEncrypt(key, plain, aad) {
    throw new Error('aeadEncrypt() not implemented');
  }

  aeadDecrypt(key, box, aad) {
    throw new Error('aeadDecrypt() not implemented');
  }
}
