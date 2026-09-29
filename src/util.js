import c from 'node:crypto';
export const sha = s => c.createHash('sha256').update(s).digest('hex');
export const rid = (p, bytes = 4) => p + '-' + c.randomBytes(bytes).toString('hex').toUpperCase();
// Recursive canonical JSON: sorted keys at every depth, no whitespace.
export const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
  : JSON.stringify(v ?? null);
export const now = () => new Date().toISOString();
export const ERR = (status, message) => Object.assign(new Error(message), { status });
export const J = JSON.stringify, P = JSON.parse;
