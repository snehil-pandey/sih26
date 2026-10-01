import path from 'node:path';
import { createApp } from './src/app.js';
import { createHttpServer } from './src/http.js';
const dataDir = process.env.SIH_DATA_DIR || path.resolve('data');
const app = createApp({ dataDir, demoMode: process.env.SIH_DEMO_MODE !== '0' });
if (process.argv.includes('--reset')) { app.reset(); console.log('Demo environment reset.'); }
const port = +process.env.PORT || 3000, host = process.env.HOST || '127.0.0.1';
const isTls = Boolean(process.env.TLS_CERT_PATH && process.env.TLS_KEY_PATH);
const proto = isTls ? 'https' : 'http';
const modeLabel = app.demoMode ? 'DEVELOPMENT / DEMO' : 'SECURE DEPLOYMENT';
createHttpServer(app).listen(port, host, () => console.log(`PROVENANCE (SIH26237 simulation) [${modeLabel}] ${proto}://${host}:${port}  data: ${dataDir}`));
