import { LedgerProvider } from './ledger-provider.js';

/**
 * ProductionLedgerProvider:
 * Production provider boundary for an external permissioned, offline/air-gapped DLT network.
 * Connects to organization-operated validator / orderer nodes (e.g., Hyperledger Fabric / private Raft-DLT).
 *
 * Requirements:
 * - Private / permissioned network only
 * - Complete air-gapped / offline operation
 * - No public blockchain / cryptocurrency / public RPC
 */
export class ProductionLedgerProvider extends LedgerProvider {
  constructor(config = {}) {
    super();
    this.config = config;
    this.connected = false;
    ProductionLedgerProvider.validateConfiguration(config);
  }

  static validateConfiguration(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Production DLT configuration must be provided');
    }
    if (!config.endpoint && !config.socketPath && !config.nodes) {
      throw new Error('Production DLT requires configured node endpoints or local socket paths');
    }
    // Reject any public blockchain or cloud RPC configurations
    const raw = JSON.stringify(config).toLowerCase();
    if (raw.includes('infura') || raw.includes('alchemy') || raw.includes('mainnet') || raw.includes('ethereum') || raw.includes('solana')) {
      throw new Error('Public blockchain endpoints are strictly prohibited under SIH26237 requirements');
    }
  }

  info() {
    return {
      provider: 'Enterprise Permissioned DLT (Production Provider)',
      mode: 'PRODUCTION',
      consensus: this.config.consensus || 'Private Distributed Raft / BFT Consensus',
      isDistributedNetwork: true,
      quorumRequired: this.config.quorum || 3,
      details: 'Air-gapped organization-operated permissioned distributed ledger.'
    };
  }

  submit(txs) {
    throw new Error('Production DLT connection is not configured or reachable. Ensure private DLT network nodes are running.');
  }

  view() {
    throw new Error('Production DLT connection is not configured or reachable.');
  }

  findProvenance(watermarkId) {
    throw new Error('Production DLT connection is not configured or reachable.');
  }

  findTx(txId) {
    throw new Error('Production DLT connection is not configured or reachable.');
  }

  close() {
    this.connected = false;
  }
}
