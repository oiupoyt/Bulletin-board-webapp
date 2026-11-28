import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readFileSafe(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const PUBLIC_PAGES = ['/', '/syllabus', '/phase-test', '/answer-keys'];
const PAGE_FILES = ['index.html', 'syllabus.html', 'phase-test.html', 'answer-keys.html'];

const REQUIRED_META = [
  'og:title',
  'og:description',
  'og:type',
  'og:url',
  'og:image',
  'twitter:card',
  'twitter:title',
  'twitter:description',
  'twitter:image',
  'theme-color',
];

async function fetchWithRetry(url, attempts = 30) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetch(url);
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

async function withServer(t, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'modulus-bulletin-test-'));
  const dbPath = path.join(tmp, 'test.db');
  const uploads = path.join(tmp, 'uploads');
  fs.mkdirSync(uploads, { recursive: true });

  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: '0', DB_PATH: dbPath, UPLOADS_DIR: uploads },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  const close = async () => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(), 1500);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };
  t.after(async () => {
    await close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const port = await boundPort(child);
  await fetchWithRetry(`http://127.0.0.1:${port}/health`);
  return fn(port, output);
}

function readPageFile(name) {
  return fs.readFileSync(path.join(root, 'public', name), 'utf8');
}

test('public HTML files carry social embed tags', () => {
  for (const file of PAGE_FILES) {
    const html = readPageFile(file);
    for (const marker of REQUIRED_META) {
      assert.match(html, new RegExp(marker, 'i'), `${file} missing ${marker}`);
    }
    assert.match(html, /https:\/\/mod\.oiupoyt\.space\/og-image\.png\?v=12.4/i, `${file} og image must be absolute and versioned`);
    assert.match(html, /property=["']og:type["']\s+content=["']website["']/i, `${file} og type`);
  }
});

test('embed image exists and is served as png', async (t) => {
  const imagePath = path.join(root, 'public', 'og-image.png');
  assert.ok(fs.existsSync(imagePath), 'public/og-image.png must exist');

  await withServer(t, async (port) => {
    const res = await fetchWithRetry(`http://127.0.0.1:${port}/og-image.png`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /image\/png/i);
    const buffer = Buffer.from(await res.arrayBuffer());
    assert.equal(buffer.readUInt32BE(16), 1200, 'PNG width is 1200px');
    assert.equal(buffer.readUInt32BE(20), 630, 'PNG height is 630px');
  });
});

test('versioned static assets are served immutable', async (t) => {
  await withServer(t, async (port) => {
    const res = await fetchWithRetry(`http://127.0.0.1:${port}/css/style.css?v=12.4`);
    assert.equal(res.status, 200);
    const cache = res.headers.get('cache-control') || '';
    assert.match(cache, /immutable/i);
    assert.match(cache, /max-age=31536000/i);
  });
});

test('html is served no-cache and revalidates', async (t) => {
  await withServer(t, async (port) => {
    const res = await fetchWithRetry(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    const cache = res.headers.get('cache-control') || '';
    assert.match(cache, /no-cache/i);
    assert.match(cache, /must-revalidate/i);
  });
});

test('mobile stylesheet renders alerts as fixed icon below navbar', () => {
  const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
  const mobile = css.slice(css.indexOf('@media (max-width: 650px)'));
  assert.match(mobile, /\.notif-toggle-btn[\s\S]*position:\s*fixed/);
  assert.match(mobile, /\.notif-toggle-btn[\s\S]*top:/);
  assert.match(mobile, /\.notif-toggle-btn[\s\S]*right:/);
  assert.match(mobile, /\.notif-toggle-btn[\s\S]*z-index:/);
  assert.match(mobile, /\.notif-btn-label[\s\S]*display:\s*none/);
});

test('service worker caches static assets only and keeps push handlers', () => {
  const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
  assert.match(sw, /cache/i);
  assert.match(sw, /addEventListener\(\s*['"]fetch['"]/);
  assert.match(sw, /\/api\//);
  assert.match(sw, /\/health/);
  assert.match(sw, /self\.addEventListener\(\s*['"]push['"]/);
  assert.match(sw, /self\.addEventListener\(\s*['"]notificationclick['"]/);
  assert.match(sw, /caches\.(delete|keys)/);
});

test('favicon set and embed use the |M| modulus mark, drawn as paths', () => {
  // The fixed-image icons (PNG, app icons, share card) render from the tiled source in scripts/brand.
  const svg = fs.readFileSync(path.join(root, 'scripts', 'brand', 'app-icon.svg'), 'utf8');
  assert.match(svg, /id="modulus-mark"/);
  // No <text>: the mark must not depend on a font being installed.
  assert.doesNotMatch(svg, /<text/);
  assert.equal((svg.match(/<rect x="\d+" y="112" width="26" height="288"/g) || []).length, 2, 'two modulus bars');
  assert.match(svg, /stop-color="#f5c518"/, 'the app icon M is marked with the brand-yellow highlighter');
  assert.match(svg, /stroke="#141417"/, 'the M is drawn in ink');
  assert.match(readFileSafe('scripts/build-brand.mjs'), /scripts\/brand\/app-icon\.svg|brand', 'app-icon\.svg/);
  const maskable = fs.readFileSync(path.join(root, 'public', 'icon-maskable.svg'), 'utf8');
  assert.match(maskable, /scale\(0\.78\)/, 'maskable mark stays inside the safe zone');

  for (const file of ['public/og-image.png']) {
    const imagePath = path.join(root, file);
    assert.ok(fs.existsSync(imagePath), `${file} must exist`);
    const { default: childProcess } = { default: null };
    const buffer = fs.readFileSync(imagePath);
    assert.equal(buffer.readUInt32BE(16), 1200, `${file} width is 1200px`);
    assert.equal(buffer.readUInt32BE(20), 630, `${file} height is 630px`);
  }
});

test('no decorative emoji remain in rendered public files', () => {
  const files = [
    'public/index.html',
    'public/syllabus.html',
    'public/phase-test.html',
    'public/answer-keys.html',
    'public/admin.html',
    'public/login.html',
    'public/js/app.js',
    'public/js/admin.js',
    'public/js/notifications.js',
  ];
  const emojiPattern = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{E000}-\u{F8FF}\u{FE0F}]/u;
  for (const file of files) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(content, emojiPattern, `${file} still contains emoji`);
  }
});

test('inline SVG icon set ships with the public bundle', () => {
  const icons = fs.readFileSync(path.join(root, 'public', 'js', 'icons.js'), 'utf8');
  for (const name of ['bell', 'search', 'close', 'download', 'pin', 'archive', 'star', 'calendar', 'doc', 'externalLink']) {
    assert.match(icons, new RegExp(name), `icons.js missing ${name}`);
  }
  for (const page of PAGE_FILES) {
    const html = readPageFile(page);
    assert.match(html, /\/js\/icons\.js/, `${page} must load icons.js`);
  }
});

test('mobile alerts button is not clipped by the navbar', () => {
  const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
  const mobile = css.slice(css.indexOf('@media (max-width: 650px)'));
  assert.match(mobile, /\.notif-toggle-btn[\s\S]*position:\s*fixed/);
  assert.match(mobile, /\.notif-toggle-btn[\s\S]*top:/);
  assert.match(mobile, /\.notif-toggle-btn[\s\S]*right:/);
  assert.match(mobile, /\.notif-toggle-btn[\s\S]*z-index:/);
  assert.match(mobile, /\.notif-btn-label[\s\S]*display:\s*none/);
  // The navbar must not establish a containing block that clips the fixed button.
  const navbar = css.slice(css.indexOf('.navbar {'), css.indexOf('.nav-container {'));
  assert.doesNotMatch(navbar, /backdrop-filter/);
  assert.doesNotMatch(navbar, /transform:|filter:|contain:/);
});

test('alert button announces state and subscribe shows a toast', () => {
  const notifications = fs.readFileSync(path.join(root, 'public', 'js', 'notifications.js'), 'utf8');
  assert.match(notifications, /aria-pressed/);
  assert.match(notifications, /function showToast/);
  assert.match(notifications, /showToast\(/);
  const pages = readPageFile('index.html');
  assert.match(pages, /aria-live/, 'index.html must have a live toast region');
});

test('favicon link tags are versioned so browsers refresh the tab icon', () => {
  for (const page of PAGE_FILES.concat(['login.html', 'admin.html'])) {
    const html = readPageFile(page);
    assert.match(html, /rel="icon"[^>]*\/favicon\.svg\?v=12.4/, `${page} favicon link must carry ?v=12.4`);
  }
});

test('desktop alerts control is a labelled outline pill, glow-free', () => {
  const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
  const notif = css.slice(css.indexOf('.notif-toggle-btn {'), css.indexOf('.notif-btn-label {'));
  assert.doesNotMatch(notif, /box-shadow/);
  assert.doesNotMatch(notif, /backdrop-filter/);
  assert.match(notif, /border:\s*1px solid/);
  assert.match(notif, /border-radius:\s*var\(--radius-pill\)/);
  assert.match(notif, /height:\s*var\(--control\)/);
  const active = css.slice(css.indexOf('.notif-toggle-btn.active {'), css.indexOf('.notif-toggle-btn.active {') + 400);
  assert.doesNotMatch(active, /box-shadow/);
  // The label shows on desktop; only the phone layout hides it.
  const [firstBody] = css.split('.notif-btn-label {');
  assert.doesNotMatch(firstBody, /notif-btn-label\s*{[^}]*display:\s*none/);
});

test('subscribed bell fills amber with no external glow or filter', () => {
  const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
  const block = css.slice(css.indexOf('.notif-toggle-btn[aria-pressed="true"]'));
  assert.doesNotMatch(block.slice(0, 400), /filter:|box-shadow|drop-shadow/);
  assert.match(block.slice(0, 400), /#f59e0b|#fbbf24|var\(--primary/);
});

test('service worker cache is bumped to v12.4 and pages reference ?v=12.4', () => {
  const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
  assert.match(sw, /v12.4/);
  for (const page of PAGE_FILES.concat(['login.html', 'admin.html'])) {
    const html = readPageFile(page);
    assert.match(html, /\?v=12.4/, `${page} must reference ?v=12.4`);
    assert.doesNotMatch(html, /\?v=[4-8]\.\d/, `${page} still references old ?v=`);
  }
});
