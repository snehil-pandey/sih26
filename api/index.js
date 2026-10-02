import path from 'node:path';
import os from 'node:os';
import { createApp } from '../src/app.js';
import { createRequestHandler } from '../src/http.js';

let appInstance = null;
let requestHandler = null;

function getHandler() {
  if (!requestHandler) {
    const dataDir = process.env.DATA_DIR || path.join(os.tmpdir(), 'sih26237-hosted');
    const deploymentProfile = process.env.DEPLOYMENT_PROFILE || 'hosted';
    const mode = process.env.APP_MODE || 'demo';
    
    appInstance = createApp({
      dataDir,
      mode,
      deploymentProfile,
      demoMode: mode.toLowerCase() !== 'production'
    });
    
    requestHandler = createRequestHandler(appInstance);
  }
  return requestHandler;
}

export default function handler(req, res) {
  const handle = getHandler();
  return handle(req, res);
}
