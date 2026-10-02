// Watermark module with provider delegation.
import { DemoWatermarkProvider, WM_RE } from './providers/demo-watermark-provider.js';

const defaultProvider = new DemoWatermarkProvider();

export { WM_RE };
export const generateWatermarkId = () => defaultProvider.generateWatermarkId();
export const embedWatermark = (text, id) => defaultProvider.embed(text, id);
export const extractWatermark = text => defaultProvider.extract(text);
export const stripInvisible = t => t.replace(/[\u200b\u200c\u2060]/g, '');
