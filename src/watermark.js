// FORENSIC WATERMARK SIMULATOR. The mark is an opaque random identifier (no identity data, no key material)
// carried as invisible zero-width characters inside TEXT artefacts. It is not robust: stripping/normalising
// zero-width characters, OCR, screenshots, re-typing or format conversion destroy it. Not tested against attacks.
import c from 'node:crypto';
import { sha } from './util.js';
const ZW = ['\u200b', '\u200c'], MARK = '\u2060';
export const WM_RE = /^WM-[0-9A-F]{16}$/;
export const generateWatermarkId = () => 'WM-' + c.randomBytes(8).toString('hex').toUpperCase();
const chk = id => sha('wm-check:' + id).slice(0, 4);
const encode = id => MARK + [...`${id}|${chk(id)}`].map(ch => ch.charCodeAt(0).toString(2).padStart(8, '0')).join('').replace(/./g, b => ZW[+b]) + MARK;
export function embedWatermark(text, id) {
  if (!WM_RE.test(id)) throw new Error('invalid watermark id');
  const nl = []; for (let i = 0; i < text.length; i++) if (text[i] === '\n') nl.push(i);
  const at = nl.length ? [...new Set([nl[0], nl[Math.floor(nl.length / 2)], nl[nl.length - 1]])] : [];
  const m = encode(id); let out = '', last = 0;
  for (const p of at) { out += text.slice(last, p) + m; last = p; }
  out += text.slice(last); return at.length ? out : out + m;
}
export function extractWatermark(text) {
  if (typeof text !== 'string') {
    return { id: null, copies: 0, status: 'UNSUPPORTED_ARTIFACT_TYPE', reason: 'Artifact is not a valid text representation' };
  }
  const marks = [...String(text).matchAll(/\u2060([\u200b\u200c]+)\u2060/g)].map(m => m[1]);
  if (!marks.length) {
    return { id: null, copies: 0, status: 'NO_SUPPORTED_WATERMARK_FOUND', reason: 'no watermark signal found' };
  }
  const votes = new Map();
  for (const z of marks) {
    const bits = [...z].map(x => ZW.indexOf(x)).join(''); let s = '';
    for (let i = 0; i + 8 <= bits.length; i += 8) s += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
    const [id, k] = s.split('|');
    if (id && WM_RE.test(id) && k === chk(id)) votes.set(id, (votes.get(id) || 0) + 1);
  }
  if (!votes.size) {
    return { id: null, copies: marks.length, status: 'WATERMARK_INTEGRITY_FAILED', reason: 'signal present but checksum/structure invalid' };
  }
  const [id, copies] = [...votes].sort((a, b) => b[1] - a[1])[0];
  return { id, copies, status: 'WATERMARK_FOUND', reason: null };
}
export const stripInvisible = t => t.replace(/[\u200b\u200c\u2060]/g, '');
