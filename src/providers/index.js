import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DemoCryptoProvider } from './demo-crypto-provider.js';
import { ProductionPQCProvider } from './production-pqc-provider.js';
import { DemoWatermarkProvider } from './demo-watermark-provider.js';
import { ProductionWatermarkProvider } from './production-watermark-provider.js';
import { DemoLedgerProvider } from './demo-ledger-provider.js';
import { ProductionLedgerProvider } from './production-ledger-provider.js';
import { createKeystore, volatileKeystore, deriveKek } from '../keystore.js';

export {
  DemoCryptoProvider,
  ProductionPQCProvider,
  DemoWatermarkProvider,
  ProductionWatermarkProvider,
  DemoLedgerProvider,
  ProductionLedgerProvider
};

/**
 * Validates whether the current environment and configuration satisfy Production Mode.
 * Fails fast with clear diagnostic errors if any required component is missing or invalid.
 * NEVER allows silent fallback to demo/classical components.
 */
export function validateProductionEnvironment(config = {}) {
  const errors = [];

  // 1. Validate PQC runtime support (NIST FIPS 203 ML-KEM & FIPS 204 ML-DSA)
  try {
    ProductionPQCProvider.validateRuntime();
  } catch (err) {
    errors.push(`Cryptography: ${err.message}`);
  }

  // 2. Validate Ledger configuration
  if (!config.ledgerConfig) {
    errors.push('Ledger: Production Mode requires a configured permissioned DLT (config.ledgerConfig missing)');
  } else {
    try {
      ProductionLedgerProvider.validateConfiguration(config.ledgerConfig);
    } catch (err) {
      errors.push(`Ledger: ${err.message}`);
    }
  }

  // 3. Validate air-gapped constraints (no cloud KMS, no public chain)
  const envStr = JSON.stringify(process.env).toLowerCase();
  if (envStr.includes('aws_kms') || envStr.includes('azure_keyvault') || envStr.includes('gcp_kms')) {
    errors.push('Deployment: External cloud KMS detected in environment variables. Air-gapped policy violated.');
  }

  if (errors.length > 0) {
    throw new Error(`PRODUCTION MODE STARTUP FAILED:\n - ${errors.join('\n - ')}`);
  }

  return true;
}

/**
 * Initializes and returns the active provider suite based on mode.
 * Centralized provider factory for the entire application.
 */
export function createProviderSuite({
  mode = 'DEMO',
  dataDir = null,
  passphrase = process.env.SIH_KEYSTORE_PASSPHRASE,
  ledgerConfig = null,
  isVolatile = false
} = {}) {
  const normalizedMode = String(mode).toUpperCase() === 'PRODUCTION' ? 'PRODUCTION' : 'DEMO';

  const ksDir = dataDir ? `${dataDir}/keystore` : fs.mkdtempSync(path.join(os.tmpdir(), 'sih-ks-prov-'));
  if (normalizedMode === 'PRODUCTION') {
    // Enforce strict startup validation. Throws if any production component is missing.
    validateProductionEnvironment({ ledgerConfig });

    const crypto = new ProductionPQCProvider();
    const watermark = new ProductionWatermarkProvider();
    const keystore = isVolatile ? volatileKeystore : createKeystore(ksDir, passphrase);
    const ledger = new ProductionLedgerProvider(ledgerConfig);

    return {
      mode: 'PRODUCTION',
      isDemo: false,
      crypto,
      watermark,
      ledger,
      keystore,
      deriveKek
    };
  }

  // DEMO MODE
  const crypto = new DemoCryptoProvider();
  const watermark = new DemoWatermarkProvider();
  const keystore = isVolatile ? volatileKeystore : createKeystore(ksDir, passphrase);
  const ledger = new DemoLedgerProvider(dataDir ? `${dataDir}/validators` : null, keystore, { fresh: false });

  return {
    mode: 'DEMO',
    isDemo: true,
    crypto,
    watermark,
    ledger,
    keystore,
    deriveKek
  };
}
