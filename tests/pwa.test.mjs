import test from 'node:test';
import assert from 'node:assert/strict';
import { withServer, request, readFile, pngSize } from './helpers.mjs';

const PUBLIC_PAGES = ['index.html', 'syllabus.html', 'phase-test.html', 'answer-keys.html'];

test('manifest is valid and installable', async (t) => {
  const manifest = JSON.parse(readFile('public/manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.ok(manifest.name && manifest.short_name);
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'));
  assert.ok(sizes.includes('512x512'));
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const file = 'public' + icon.src.split('?')[0];
    const [w, h] = pngSize(file);
    assert.equal(`${w}x${h}`, icon.sizes, `${file} size`);
  }
  await withServer(t, {}, async (port) => {
    const res = await request(port, '/manifest.webmanifest');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/manifest\+json/);
  });
});

test('manifest is linked on public pages only', () => {
  for (const page of PUBLIC_PAGES) {
    assert.match(readFile(`public/${page}`), /<link rel="manifest" href="\/manifest\.webmanifest\?v=10.1">/, page);
    assert.match(readFile(`public/${page}`), /\/js\/install\.js\?v=10.1/, `${page} loads install.js`);
  }
  for (const page of ['admin.html', 'login.html']) {
    assert.doesNotMatch(readFile(`public/${page}`), /manifest/, page);
  }
});

test('service worker v8 serves pages offline and never caches admin', () => {
  const sw = readFile('public/sw.js');
  assert.match(sw, /const VERSION = 'v10.1'/);
  assert.match(sw, /campus-bulletin-static-\$\{VERSION\}/);
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /\/api\/admin/);
  assert.match(sw, /\/admin|\/login/);
  assert.match(sw, /caches\.match/);
});

test('install prompt handles Chromium and iOS and respects dismissal', () => {
  const js = readFile('public/js/install.js');
  assert.match(js, /beforeinstallprompt/);
  assert.match(js, /appinstalled/);
  assert.match(js, /display-mode: standalone/);
  assert.match(js, /navigator\.standalone/);
  assert.match(js, /Add to Home Screen/);
  assert.match(js, /localStorage/);
  const css = readFile('public/css/style.css');
  assert.match(css, /\.install-prompt/);
  assert.match(css, /safe-area-inset-bottom/);
});

test('service worker registers on every public page, not only when alerts are used', () => {
  const js = readFile('public/js/install.js');
  assert.match(js, /serviceWorker\.register\('\/sw\.js'\)/);
});

test('public pages are marked cacheable, admin pages are not', async (t) => {
  await withServer(t, { SESSION_SECRET: 's', ADMIN_PASSWORD: 'p' }, async (port) => {
    for (const p of ['/', '/syllabus', '/phase-test', '/answer-keys']) {
      const res = await request(port, p, { headers: { host: 'mod.oiupoyt.space' } });
      assert.equal(res.headers['x-bulletin-page'], 'public', `${p} marker`);
    }
    // Admin host root serves admin.html at "/" - it must never be marked as a public page.
    const adminRoot = await request(port, '/', { headers: { host: 'adminmod.oiupoyt.space' } });
    assert.equal(adminRoot.headers['x-bulletin-page'], undefined);
    const missing = await request(port, '/nope', { headers: { host: 'mod.oiupoyt.space' } });
    assert.equal(missing.status, 404);
    assert.equal(missing.headers['x-bulletin-page'], undefined);
  });
});

test('install prompt reserves space so it never covers page content', () => {
  const js = readFile('public/js/install.js');
  assert.match(js, /classList\.add\('has-install-prompt'\)/);
  assert.match(js, /classList\.remove\('has-install-prompt'\)/);
  assert.match(readFile('public/css/style.css'), /body\.has-install-prompt\s*\{[^}]*padding-bottom/);
});

test('service worker script and manifest are never edge-cached', async (t) => {
  await withServer(t, {}, async (port) => {
    for (const p of ['/sw.js', '/manifest.webmanifest']) {
      const res = await request(port, p);
      assert.equal(res.status, 200);
      assert.match(res.headers['cache-control'] || '', /no-cache/, `${p} cache-control`);
      assert.doesNotMatch(res.headers['cache-control'] || '', /max-age=[1-9]/, `${p} must not be cacheable`);
    }
  });
});

test('install prompt shows on the first visit', () => {
  const js = readFile('public/js/install.js');
  assert.doesNotMatch(js, /MIN_VISITS|bulletin-visits/, 'no visit gating');
  // The bar itself still respects dismissal; the event is kept for the footer button
  const handler = js.slice(js.indexOf("'beforeinstallprompt'"), js.indexOf("'appinstalled'"));
  assert.match(handler, /if \(canShow\(\)\)/);
});

test('install prompt covers browsers without beforeinstallprompt', () => {
  const js = readFile('public/js/install.js');
  assert.match(js, /Firefox/, 'Firefox for Android hint');
  assert.match(js, /Android/);
  // Every iOS browser can Add to Home Screen since iOS 16.4, not only Safari
  assert.doesNotMatch(js, /CriOS\|FxiOS\|EdgiOS/);
});

test('dismissing or installing hides the prompt permanently', () => {
  const js = readFile('public/js/install.js');
  assert.doesNotMatch(js, /DISMISS_DAYS/, 'no expiry on dismissal');
  assert.match(js, /read\(DISMISS_KEY\)/);
  const installed = js.slice(js.indexOf("'appinstalled'"));
  assert.match(installed.slice(0, 300), /write\(DISMISS_KEY/, 'installing also records dismissal');
});

test('installed app is named Modulus-bulletin', () => {
  const manifest = JSON.parse(readFile('public/manifest.webmanifest'));
  assert.equal(manifest.name, 'Modulus-bulletin');
  assert.equal(manifest.short_name, 'Modulus-bulletin');
  for (const page of PUBLIC_PAGES) {
    assert.match(readFile(`public/${page}`), /name="apple-mobile-web-app-title" content="Modulus-bulletin"/, page);
  }
  assert.match(readFile('public/js/install.js'), /Install Modulus-bulletin/);
});

test('footer offers a hidden-by-default Install as app button below the instagram link', () => {
  for (const page of PUBLIC_PAGES) {
    const html = readFile(`public/${page}`);
    const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
    const ig = footer.indexOf('footer-ig-link');
    const btn = footer.indexOf('id="footerInstallBtn"');
    assert.ok(ig > -1 && btn > ig, `${page}: install button must come after @oiupoyt`);
    assert.match(footer, /<button[^>]*type="button"[^>]*id="footerInstallBtn"[^>]*hidden[^>]*>Install as app<\/button>/, page);
  }
  const css = readFile('public/css/style.css');
  const block = css.slice(css.indexOf('.footer-install-link {'));
  assert.match(block.slice(0, 600), /min-height:\s*2\.75rem/);
  assert.match(block.slice(0, 600), /background:\s*none/);
  assert.match(css, /\.footer-install-link:focus-visible/);
  assert.match(css, /\.footer-install-link\[hidden\]\s*\{\s*display:\s*none/);
});

test('footer install button works after dismissal and uses the native prompt when available', () => {
  const js = readFile('public/js/install.js');
  assert.match(js, /footerInstallBtn/);
  // beforeinstallprompt is always captured for the footer, but the bar respects dismissal
  const handler = js.slice(js.indexOf("'beforeinstallprompt'"), js.indexOf("'appinstalled'"));
  assert.match(handler, /deferredPrompt = event/);
  assert.match(handler, /preventDefault/);
  assert.match(js, /function showHint\(\{ force \}/);
  assert.match(js, /force: true/);
  const installed = js.slice(js.indexOf("'appinstalled'"));
  assert.match(installed.slice(0, 400), /footerBtn\.hidden = true/);
});

test('footer install link text meets AA contrast', () => {
  const css = readFile('public/css/style.css');
  const block = css.slice(css.indexOf('.footer-install-link {'), css.indexOf('.footer-install-link:hover'));
  assert.match(block, /color:\s*var\(--text-muted\)/, 'text-dim is 4.35:1 on #000, below AA for 0.8rem');
});
