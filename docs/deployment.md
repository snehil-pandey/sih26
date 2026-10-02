# Dual-Profile Deployment Guide (Local Air-Gapped vs Hosted Vercel)

## 1. Architectural Philosophy
SIH26237 decouples the **Deployment Profile** from the **Cryptographic Mode**:

| Aspect | `DEPLOYMENT_PROFILE=local` | `DEPLOYMENT_PROFILE=hosted` |
|---|---|---|
| **Environment** | Air-gapped workstation, standalone server, field laptop | Vercel Serverless, AWS Lambda, Node Docker containers |
| **Network Dependency** | Zero internet access required | Standard web HTTP / HTTPS traffic |
| **Persistence Layer** | Local SQLite (`node:sqlite`) on disk or RAM | Ephemeral `/tmp` staging or hosted database adapter |
| **Key Enclaves** | Local filesystem keystore (`data/keystore`) | Isolated tmpfs or sealed memory keystores |
| **Web Server** | Native Node.js HTTP/HTTPS daemon (`src/server.js`) | Stateless Serverless Request Handler (`api/index.js`) |

Both deployment profiles run either **Demo Mode** (`APP_MODE=demo`) or **Production Mode** (`APP_MODE=production`).

---

## 2. Local Air-Gapped Deployment

### Prerequisites:
- Node.js `v22+` or `v24+` (Standard LTS).
- Zero npm installations required (runs entirely on built-in Node modules).

### Steps:
1. Clone or unpack the repository onto the offline machine:
   ```bash
   cd sih26237
   ```
2. Start the local server:
   ```bash
   node src/server.js
   ```
   Or explicitly pass the deployment environment:
   ```bash
   DEPLOYMENT_PROFILE=local APP_MODE=demo node src/server.js
   ```
3. Open in a desktop browser:
   `http://localhost:3000`

---

## 3. Hosted Vercel Deployment

### Overview:
Vercel executes applications inside short-lived serverless execution containers.
- The project includes `vercel.json` and `api/index.js`.
- The storage abstraction automatically stages volatile session files inside `/tmp/sih26237-hosted`.
- Authentication uses secure SameSite session cookies (`sih_token`).

### Configuration (`vercel.json`):
```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/index.js",
      "use": "@vercel/node"
    },
    {
      "src": "public/**/*",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/index.js"
    },
    {
      "src": "/(.*)",
      "dest": "/public/$1"
    }
  ],
  "env": {
    "DEPLOYMENT_PROFILE": "hosted",
    "APP_MODE": "demo"
  }
}
```

### Deploying to Vercel:
1. Install Vercel CLI (or connect GitHub repository):
   ```bash
   npx vercel
   ```
2. Set Environment Variables in Vercel Project Settings:
   - `DEPLOYMENT_PROFILE=hosted`
   - `APP_MODE=demo` (or `production` if native OpenSSL PQC provider is configured)
   - `SIH_BOOTSTRAP_ADMIN_USER=admin`
   - `SIH_BOOTSTRAP_ADMIN_PASSWORD=<secure-password>`
3. Access the deployed endpoint URL.
