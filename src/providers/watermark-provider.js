/**
 * Stable Base WatermarkProvider Interface.
 */
export class WatermarkProvider {
  /**
   * Returns provider metadata.
   * @returns {{
   *   provider: string,
   *   mode: 'DEMO' | 'PRODUCTION',
   *   isRobustMedia: boolean,
   *   supportedTypes: string[],
   *   details: string
   * }}
   */
  algorithmInfo() {
    throw new Error('algorithmInfo() not implemented');
  }

  generateWatermarkId() {
    throw new Error('generateWatermarkId() not implemented');
  }

  isValidWatermarkId(id) {
    throw new Error('isValidWatermarkId() not implemented');
  }

  embed(artifact, watermarkId) {
    throw new Error('embed() not implemented');
  }

  extract(artifact) {
    throw new Error('extract() not implemented');
  }
}
