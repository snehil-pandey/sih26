import { LedgerProvider } from './ledger-provider.js';
import { Network, QUORUM } from '../ledger.js';

/**
 * DemoLedgerProvider:
 * Local permissioned DLT provider for hackathon demonstration and offline testing.
 * Runs 5 independent validator SQLite databases with 3-of-5 quorum consensus in-process.
 * Honestly documents in-process multi-store simulation.
 */
export class DemoLedgerProvider extends LedgerProvider {
  constructor(dataDir, keystore, options = {}) {
    super();
    this.network = new Network(dataDir, keystore, options);
  }

  info() {
    return {
      provider: 'Local Permissioned DLT (Demo Provider)',
      mode: 'DEMO',
      consensus: 'Local Permissioned Multi-Node Consensus (3-of-5 Quorum)',
      isDistributedNetwork: false,
      quorumRequired: QUORUM,
      details: '5 independent validator stores with isolated validator keys and independent transaction validation in-process.'
    };
  }

  submit(txs) {
    return this.network.submit(txs);
  }

  view() {
    return this.network.view();
  }

  findProvenance(wm) {
    return this.network.findProvenance(wm);
  }

  findTx(id) {
    return this.network.findTx(id);
  }

  close() {
    if (this.network) this.network.close();
  }

  // Demo / Testing specific methods
  node(id) { return this.network.node(id); }
  get nodes() { return this.network.nodes; }
  setStatus(id, status) { return this.network.setStatus(id, status); }
  catchUp(id) { return this.network.catchUp(id); }
  resync(id) { return this.network.resync(id); }
  compromise(id, kind, arg) { return this.network.compromise(id, kind, arg); }
  clone() { return this.network.clone(); }
}
