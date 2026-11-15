import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load .env if present
const envPath = process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.join(rootDir, '.env');
if (fs.existsSync(envPath)) {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(envPath);
    } else {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[config] Could not load .env file:', err.message);
  }
}

function hostList(name, fallback) {
  const raw = process.env[name] === undefined ? fallback : process.env[name];
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  // Loopback only: cloudflared reaches the app on 127.0.0.1, nothing else needs to.
  host: process.env.HOST || '127.0.0.1',
  dbPath: process.env.DB_PATH || path.join(rootDir, 'data', 'noticeboard.db'),
  uploadsDir: process.env.UPLOADS_DIR || path.join(rootDir, 'uploads'),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  maxUploadMB: parseInt(process.env.MAX_UPLOAD_MB || '15', 10),
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidEmail: process.env.VAPID_EMAIL || 'mailto:admin@example.com',
  // Hostnames are matched against the Host header only (set by cloudflared, not by clients).
  publicHosts: hostList('PUBLIC_HOSTS', 'mod.oiupoyt.space,modinfo.oiupoyt.space'),
  adminHosts: hostList('ADMIN_HOSTS', 'adminmod.oiupoyt.space'),
  redirectHosts: hostList('REDIRECT_HOSTS', 'modtest.oiupoyt.space'),
  canonicalOrigin: process.env.CANONICAL_ORIGIN || 'https://mod.oiupoyt.space',
  rootDir,
};
