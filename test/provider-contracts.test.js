import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoCryptoProvider } from '../src/providers/demo-crypto-provider.js';
import { ProductionPQCProvider } from '../src/providers/production-pqc-provider.js';
import { DemoWatermarkProvider } from '../src/providers/demo-watermark-provider.js';
import { ProductionWatermarkProvider } from '../src/providers/production-watermark-provider.js';
import { DemoLedgerProvider } from '../src/providers/demo-ledger-provider.js';
import { ProductionLedgerProvider } from '../src/providers/production-ledger-provider.js';
import { createProviderSuite, validateProductionEnvironment } from '../src/providers/index.js';
import { volatileKeystore } from '../src/keystore.js';
import { canon } from '../src/util.js';

test('Provider Contract: CryptoProvider implementations (DemoCryptoProvider & ProductionPQCProvider)', () => {
  const providers = [
    { name: 'DemoCryptoProvider', p: new DemoCryptoProvider() },
    { name: 'ProductionPQCProvider', p: new ProductionPQCProvider() }
  ];

  for (const { name, p } of providers) {
    const info = p.algorithmInfo();
    assert.ok(info.provider, `${name} has provider name`);
    assert.ok(info.signatureAlgorithm, `${name} has signatureAlgorithm`);
    assert.ok(info.kemAlgorithm, `${name} has kemAlgorithm`);
    assert.ok(info.bulkEncryptionAlgorithm, `${name} has bulkEncryptionAlgorithm`);

    // 1. Signature generation & verification contract
    const keyPair = p.generateSigningKeyPair();
    assert.ok(keyPair.pub, `${name} generated public key`);
    assert.ok(keyPair.priv, `${name} generated private key`);

    const data = canon({ documentId: 'DOC-0001', recipientId: 'REC-0192', timestamp: '2026-10-01T00:00:00Z' });
    const sig = p.sign(keyPair.priv, data);
    assert.ok(sig, `${name} generated digital signature`);

    const valid = p.verify(keyPair.pub, data, sig);
    assert.equal(valid, true, `${name} verified signature successfully`);

    // Mutated data must fail verification
    const invalidData = p.verify(keyPair.pub, data + ' mutated', sig);
    assert.equal(invalidData, false, `${name} rejected mutated data`);

    // Wrong key must fail verification
    const otherKeyPair = p.generateSigningKeyPair();
    const wrongKey = p.verify(otherKeyPair.pub, data, sig);
    assert.equal(wrongKey, false, `${name} rejected wrong public key`);

    // 2. KEM encapsulation & decapsulation contract
    const kemKeys = p.generateKemKeyPair();
    assert.ok(kemKeys.pub, `${name} generated KEM public key`);
    assert.ok(kemKeys.priv, `${name} generated KEM private key`);

    const encap = p.encapsulate(kemKeys.pub);
    assert.ok(encap.ct, `${name} generated ciphertext capsule`);
    assert.ok(encap.key, `${name} generated shared secret key`);
    assert.equal(encap.key.length, 32, `${name} shared key is 256 bits`);

    const decapsulatedKey = p.decapsulate(kemKeys.priv, encap.ct);
    assert.deepEqual(decapsulatedKey, encap.key, `${name} recovered identical shared key`);

    // Wrong private key cannot decapsulate
    const otherKem = p.generateKemKeyPair();
    const wrongDecap = p.decapsulate(otherKem.priv, encap.ct);
    assert.notDeepEqual(wrongDecap, encap.key, `${name} wrong key fails recovery`);

    // 3. Bulk AEAD encryption contract
    const plain = Buffer.from('CONFIDENTIAL DEFENSE DOCUMENT CONTENT');
    const aad = 'doc:DOC-0001:1.0';
    const box = p.aeadEncrypt(encap.key, plain, aad);
    assert.ok(box.iv && box.tag && box.ct, `${name} AEAD encryption generated envelope`);

    const decrypted = p.aeadDecrypt(encap.key, box, aad);
    assert.deepEqual(decrypted, plain, `${name} AEAD decrypted identical plaintext`);

    // Mutated AAD must fail
    assert.throws(() => p.aeadDecrypt(encap.key, box, 'wrong:aad'), `${name} AEAD rejects mismatched AAD`);
  }
});

test('Provider Contract: WatermarkProvider implementations (DemoWatermarkProvider & ProductionWatermarkProvider)', () => {
  const providers = [
    { name: 'DemoWatermarkProvider', p: new DemoWatermarkProvider() },
    { name: 'ProductionWatermarkProvider', p: new ProductionWatermarkProvider() }
  ];

  for (const { name, p } of providers) {
    const info = p.algorithmInfo();
    assert.ok(info.provider, `${name} has provider name`);
    assert.ok(Array.isArray(info.supportedTypes), `${name} lists supported types`);

    const id = p.generateWatermarkId();
    assert.ok(p.isValidWatermarkId(id), `${name} generated valid watermark ID format`);

    const sampleDoc = 'OPERATION LOGISTICS BRIEF\n1. Secure forward depots.\n2. Maintain tactical silence.\nEnd of document.';
    const embedded = p.embed(sampleDoc, id);
    assert.ok(embedded.length > sampleDoc.length, `${name} embedded watermark characters`);

    const extracted = p.extract(embedded);
    assert.equal(extracted.status, 'WATERMARK_FOUND', `${name} found watermark`);
    assert.equal(extracted.id, id, `${name} extracted correct watermark ID`);
    assert.ok(extracted.copies >= 1, `${name} recovered mark copies`);

    // Non-watermarked text fails closed
    const cleanExtracted = p.extract(sampleDoc);
    assert.equal(cleanExtracted.status, 'NO_SUPPORTED_WATERMARK_FOUND');
    assert.equal(cleanExtracted.id, null);

    // Unsupported artifact type fails closed
    const nonText = p.extract(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    assert.equal(nonText.status, 'UNSUPPORTED_ARTIFACT_TYPE');
  }
});

test('Provider Contract: LedgerProvider contract & consensus abstraction', () => {
  const demoLedger = new DemoLedgerProvider(null, volatileKeystore, { fresh: true });
  const info = demoLedger.info();
  assert.equal(info.mode, 'DEMO');
  assert.equal(info.quorumRequired, 3);

  const initialView = demoLedger.view();
  assert.equal(initialView.quorum, true);
  assert.equal(initialView.nodes.length, 5);

  demoLedger.close();
});

test('Startup Validation: Production Mode strictly fails when prerequisites are missing', () => {
  // Missing ledger configuration
  assert.throws(() => {
    validateProductionEnvironment({});
  }, /config\.ledgerConfig missing/);

  // Prohibited public blockchain endpoints
  assert.throws(() => {
    validateProductionEnvironment({
      ledgerConfig: { endpoint: 'https://mainnet.infura.io/v3/fake-key' }
    });
  }, /Public blockchain endpoints are strictly prohibited/);
});

test('Provider Suite Factory: Seamless mode switching between DEMO and PRODUCTION', () => {
  const demoSuite = createProviderSuite({ mode: 'DEMO' });
  assert.equal(demoSuite.mode, 'DEMO');
  assert.equal(demoSuite.isDemo, true);
  assert.equal(demoSuite.crypto.algorithmInfo().mode, 'DEMO');

  // Production factory instantiation with valid air-gapped ledger configuration
  const prodSuite = createProviderSuite({
    mode: 'PRODUCTION',
    ledgerConfig: { endpoint: 'ipc:///var/run/dlt/validator.sock', nodes: ['NODE-01', 'NODE-02', 'NODE-03'] }
  });
  assert.equal(prodSuite.mode, 'PRODUCTION');
  assert.equal(prodSuite.isDemo, false);
  assert.equal(prodSuite.crypto.algorithmInfo().mode, 'PRODUCTION');
  assert.equal(prodSuite.crypto.algorithmInfo().isPostQuantum, true);
});
