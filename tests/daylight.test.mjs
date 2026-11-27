import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readFile, root } from './helpers.mjs';

const PUBLIC_PAGES = ['index.html', 'syllabus.html', 'phase-test.html', 'answer-keys.html', 'contacts.html'];
const css = () => readFile('public/css/style.css');

function block(source, selector) {
  const start = source.indexOf(selector);
  assert.ok(start > -1, `missing ${selector}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

test('dark mode follows the OS with a full dark token set', () => {
  const dark = block(css(), '@media (prefers-color-scheme: dark)');
  assert.match(dark, /color-scheme:\s*dark/);
  for (const token of ['--canvas', '--surface', '--well', '--line', '--text-strong', '--text-body', '--text', '--text-muted',
    '--grey', '--blue-text', '--primary-text', '--gloss-top', '--gloss-bottom', '--on-gloss', '--sky', '--bezel', '--pane', '--invert-bg']) {
    assert.match(dark, new RegExp(`${token}:`), `dark theme sets ${token}`);
  }
  for (const page of [...PUBLIC_PAGES, 'admin.html', 'login.html']) {
    const html = readFile(`public/${page}`);
    assert.match(html, /<meta name="theme-color" content="#fafafb" media="\(prefers-color-scheme: light\)">/, page);
    assert.match(html, /<meta name="theme-color" content="#111113" media="\(prefers-color-scheme: dark\)">/, page);
  }
});

test('the footer slogan is gone and the footer line is readable', () => {
  for (const file of [...PUBLIC_PAGES.map((p) => `public/${p}`), 'scripts/build-pages.mjs', 'public/css/style.css']) {
    assert.doesNotMatch(readFile(file), /Makes everything positive|footer-meaning|footer-modulus/, file);
  }
  assert.match(block(css(), '\n.footer-line span {'), /color:\s*var\(--text-muted\)/);
});

test('one sans family: Inter Tight is dropped, only Inter is preloaded', () => {
  assert.ok(!fs.existsSync(path.join(root, 'public/fonts/inter-tight.woff2')));
  assert.doesNotMatch(css(), /Inter Tight/);
  for (const page of PUBLIC_PAGES) {
    const preloads = readFile(`public/${page}`).match(/rel="preload"[^>]*as="font"/g) || [];
    assert.equal(preloads.length, 1, `${page} preloads one font`);
  }
  assert.doesNotMatch(readFile('public/sw.js'), /inter-tight/);
});

test('stylesheet is smaller than the PR shipped it, dark theme included', () => {
  const size = Buffer.byteLength(readFile('public/css/style.min.css'));
  assert.ok(size < 48532, `style.min.css is ${size} bytes`);
});

test('phones: tabs are 44px and the current tab is scrolled into view', () => {
  const phone = block(css(), '@media (max-width: 650px)');
  assert.match(block(phone, '.nav-link {'), /height:\s*44px/);
  assert.match(readFile('public/js/app.js'), /function revealCurrentTab\(/);
});

test('no text below 12px on the countdown or avatars; Show more is a full tap target', () => {
  const s = css();
  for (const sel of ['\n.cal-head {', '\n.cal-day {', '\n.mini-avatar {']) {
    const size = /font-size:\s*([\d.]+)px/.exec(block(s, sel));
    assert.ok(size && Number(size[1]) >= 12, `${sel} font-size ${size && size[1]}`);
  }
  assert.match(block(s, '\n.show-more {'), /min-height:\s*44px/);
});

test('the feed timeline line never runs through answer-key titles', () => {
  assert.match(css(), /#answerKeysList \.feed-entries::before\s*\{[^}]*display:\s*none/);
});

test('unused selectors from the PR are removed', () => {
  for (const cls of ['eyebrow-icon', 'phase-when', 'time-chip', 'value-chip']) {
    assert.doesNotMatch(css(), new RegExp(`\\.${cls}\\b`), cls);
  }
});

test('the navbar |M| bars turn light on the dark sheet', () => {
  const svg = readFile('public/mark.svg');
  assert.match(svg, /@media \(prefers-color-scheme:\s*dark\)\{\.bar\{fill:#f2f2f4\}\}/);
  assert.equal((svg.match(/class="bar"/g) || []).length, 2);
});
