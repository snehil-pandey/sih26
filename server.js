import path from 'node:path';
import { createApp } from './src/app.js';
import { createHttpServer } from './src/http.js';
const dataDir = process.env.SIH_DATA_DIR || path.resolve('data');
const appMode = process.env.APP_MODE || (process.env.SIH_DEMO_MODE === '0' ? 'production' : 'demo');
const app = createApp({
  dataDir,
  mode: appMode,
  demoMode: appMode.toLowerCase() !== 'production'
});
if (process.argv.includes('--reset')) { app.reset(); console.log('Demo environment reset.'); }
const port = +process.env.PORT || 3000, host = process.env.HOST || '127.0.0.1';
const isTls = Boolean(process.env.TLS_CERT_PATH && process.env.TLS_KEY_PATH);
const proto = isTls ? 'https' : 'http';
const envInfo = app.environment();
createHttpServer(app).listen(port, host, () => {
  console.log(`PROVENANCE (SIH26237) [${envInfo.mode} MODE] ${proto}://${host}:${port}  data: ${dataDir}`);
  console.log(`  Cryptography: ${envInfo.crypto.signatureAlgorithm}`);
  console.log(`  Key Establishment: ${envInfo.crypto.kemAlgorithm}`);
  console.log(`  Ledger: ${envInfo.ledger.provider}`);
});

