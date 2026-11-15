import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Raw HTTP so tests can set Host and X-Forwarded-* headers, which fetch() refuses.
export function request(port, urlPath, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: {
          ...(payload !== undefined ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try { json = JSON.parse(text); } catch { json = undefined; }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      }
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function waitForHealth(port) {
  let lastError;
  for (let i = 0; i < 50; i += 1) {
    try {
      return await request(port, '/health');
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw lastError;
}

export async function withServer(t, env, fn) {
  const port = 4200 + Math.floor(Math.random() * 2000);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'modulus-bulletin-test-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, ENV_FILE: path.join(tmp, 'none.env'), PORT: String(port), DB_PATH: path.join(tmp, 'test.db'), UPLOADS_DIR: path.join(tmp, 'uploads'), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (c) => { output += c; });
  child.stderr.on('data', (c) => { output += c; });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1500);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  await waitForHealth(port);
  return fn(port, () => output);
}

export function readFile(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

export function pngSize(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}
