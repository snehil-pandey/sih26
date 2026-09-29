// Local keystore. Private keys are never stored in the clear:
//  * recipient/admin/etc. private keys are AES-256-GCM encrypted under a key-encryption key (KEK) derived
//    from the user's password (scrypt) — the server can only use them while that user is signed in;
//  * validator approval keys are sealed under a local master key (file with mode 0600, or a passphrase).
// This is NOT an HSM. Anyone who can read the master key AND the validator files can act as the validators.
import c from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { aeadEnc, aeadDec } from './pq.js';
export const deriveKek = (password, saltHex) => c.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 32);
export function createKeystore(dir, passphrase = process.env.SIH_KEYSTORE_PASSPHRASE) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  let master;
  if (passphrase) {
    const sf = path.join(dir, 'master.salt');
    if (!fs.existsSync(sf)) fs.writeFileSync(sf, c.randomBytes(16).toString('hex'), { mode: 0o600 });
    master = c.scryptSync(passphrase, Buffer.from(fs.readFileSync(sf, 'utf8'), 'hex'), 32);
  } else {
    const kf = path.join(dir, 'master.key');
    if (!fs.existsSync(kf)) fs.writeFileSync(kf, c.randomBytes(32).toString('hex'), { mode: 0o600 });
    master = Buffer.from(fs.readFileSync(kf, 'utf8'), 'hex');
  }
  return {
    seal: (buf, aad) => aeadEnc(master, buf, aad),
    open: (obj, aad) => aeadDec(master, obj, aad),
    hmacKey: label => c.createHmac('sha256', master).update('derive:' + label).digest(),
  };
}
// Volatile stand-in used ONLY for throw-away in-memory sandboxes (tests, lab clones). Provides no protection.
export const volatileKeystore = { seal: b => ({ iv: '', tag: '', ct: Buffer.from(b).toString('hex') }), open: o => Buffer.from(o.ct, 'hex') };
