/**
 * Stable Base KeyStore / KeyManager Interface.
 */
export class KeyStore {
  /**
   * Returns provider metadata.
   */
  info() {
    throw new Error('info() not implemented');
  }

  seal(buffer, aad) {
    throw new Error('seal() not implemented');
  }

  open(envelope, aad) {
    throw new Error('open() not implemented');
  }

  forValidator(nodeId) {
    throw new Error('forValidator() not implemented');
  }
}
