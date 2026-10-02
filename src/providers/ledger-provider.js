/**
 * Stable Base LedgerProvider Interface.
 * Defines operations required by the application without binding to SQLite or in-process mechanics.
 */
export class LedgerProvider {
  /**
   * Returns metadata describing the ledger implementation.
   * @returns {{
   *   provider: string,
   *   mode: 'DEMO' | 'PRODUCTION',
   *   consensus: string,
   *   isDistributedNetwork: boolean,
   *   quorumRequired: number,
   *   details: string
   * }}
   */
  info() {
    throw new Error('info() not implemented');
  }

  /**
   * Submits an array of transactions to consensus.
   * @param {Array<object>} txs 
   * @returns {{ block: number, hash: string, approvals: number, txIds: string[] }}
   */
  submit(txs) {
    throw new Error('submit() not implemented');
  }

  /**
   * Retrieves the current verified majority view of the ledger.
   * @returns {object}
   */
  view() {
    throw new Error('view() not implemented');
  }

  /**
   * Locates a provenance transaction by its embedded watermark identifier.
   * @param {string} watermarkId
   * @returns {{ view: object, found: { tx: object, block: object } | null }}
   */
  findProvenance(watermarkId) {
    throw new Error('findProvenance() not implemented');
  }

  /**
   * Locates a transaction by its transaction ID.
   * @param {string} txId
   * @returns {{ tx: object, block: object, view: object } | null }
   */
  findTx(txId) {
    throw new Error('findTx() not implemented');
  }

  /**
   * Closes underlying storage / network connections.
   */
  close() {
    throw new Error('close() not implemented');
  }
}
