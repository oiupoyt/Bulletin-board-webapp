import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from './helpers.mjs';

const PUBLIC_PAGES = ['index.html', 'syllabus.html', 'phase-test.html', 'answer-keys.html', 'contacts.html'];
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

test('minified stylesheets are built from the current sources', () => {
  for (const [src, min] of [['public/css/style.css', 'public/css/style.min.css'], ['public/css/admin.css', 'public/css/admin.min.css']]) {
    const built = readFile(min);
    const stamp = /^\/\* build:([0-9a-f]{16}) \*\//.exec(built);
    assert.ok(stamp, `${min} carries a source hash`);
    assert.equal(stamp[1], sha(readFile(src)), `${min} is stale: run npm run build:css`);
  }
});

test('students download only the public stylesheet, minified and at least 20% smaller', () => {
  const publicMin = Buffer.byteLength(readFile('public/css/style.min.css'));
  assert.ok(publicMin <= 61530 * 0.8, `style.min.css is ${publicMin} bytes`);
  for (const page of PUBLIC_PAGES) {
    const html = readFile(`public/${page}`);
    assert.match(html, /href="\/css\/style\.min\.css\?v=12.2"/, page);
    assert.doesNotMatch(html, /admin(\.min)?\.css/, `${page} must not load admin CSS`);
  }
  for (const page of ['admin.html', 'login.html']) {
    const html = readFile(`public/${page}`);
    assert.match(html, /href="\/css\/style\.min\.css\?v=12.2"/, page);
    assert.match(html, /href="\/css\/admin\.min\.css\?v=12.2"/, page);
  }
  assert.match(readFile('public/sw.js'), /'\/css\/style\.min\.css\?v=12.2'/);
});

test('admin-only rules live in admin.css, not in the public stylesheet', () => {
  const pub = readFile('public/css/style.css');
  for (const cls of ['admin-shell', 'admin-tabs', 'login-card', 'panel-card', 'form-grid', 'sets-upload-grid']) {
    assert.doesNotMatch(pub, new RegExp(`\\.${cls}\\b`), `${cls} still in style.css`);
    assert.match(readFile('public/css/admin.css'), new RegExp(`\\.${cls}\\b`), `${cls} missing from admin.css`);
  }
});

function phoneBlock() {
  const css = readFile('public/css/style.css');
  const start = css.indexOf('@media (max-width: 650px)');
  assert.ok(start > -1);
  return css.slice(start);
}

test('phones: inputs are 16px so iOS does not zoom, the bell is a 44px target', () => {
  const phone = phoneBlock();
  assert.match(phone, /\.search-input\s*\{[^}]*font-size:\s*16px/);
  assert.match(phone, /\.notif-toggle-btn\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/);
  assert.match(phone, /\.cat-pill\s*\{[^}]*height:\s*36px/);
});

test('faint text that carries information meets 4.5:1 in both themes', () => {
  const css = readFile('public/css/style.css');
  for (const sel of ['.disclaimer-text', '.search-input::placeholder']) {
    const block = css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
    assert.match(block, /color:\s*var\(--text-muted\)/, `${sel} must use --text-muted`);
  }
});

test('installed app splash and toolbar match the paper of the light |M| tile', () => {
  const manifest = JSON.parse(readFile('public/manifest.webmanifest'));
  assert.equal(manifest.theme_color, '#fafafb');
  assert.equal(manifest.background_color, '#fafafb');
});

test('design notes do not point at files outside the repo', () => {
  assert.doesNotMatch(readFile('docs/design.md'), /\.claude\/skills/);
});

test('icons.js ships only the icon weights the pages render, with a safe fallback', () => {
  const js = readFile('public/js/icons.js');
  const regular = js.slice(js.indexOf('const REGULAR = {'), js.indexOf('const FILL = {'));
  const fill = js.slice(js.indexOf('const FILL = {'), js.indexOf('const BRANDS = {'));
  const count = (block) => (block.match(/^\s{4}\w+: '/gm) || []).length;
  assert.ok(count(regular) + count(fill) <= 26, `${count(regular)} regular + ${count(fill)} fill entries`);
  assert.match(js, /\(useFill \? FILL : REGULAR\)\[name\] \|\| \(useFill \? REGULAR : FILL\)\[name\]/, 'falls back to the other weight');
  assert.ok(Buffer.byteLength(js) < 12500, `icons.js is ${Buffer.byteLength(js)} bytes (was 18,516)`);
});

test('rules that exclude the admin navbar stay in the public stylesheet', () => {
  // ".navbar:not(.admin-navbar)" targets the public navbar; it must not move to admin.css.
  assert.doesNotMatch(readFile('public/css/admin.css'), /:not\(\.admin-/);
  assert.match(readFile('public/css/style.css'), /\.navbar:not\(\.admin-navbar\) \.nav-links\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(readFile('public/css/style.css'), /\.navbar:not\(\.admin-navbar\) \.brand\s*\{[^}]*display:\s*none/);
});
