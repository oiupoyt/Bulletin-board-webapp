import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from './helpers.mjs';

const PUBLIC_PAGES = ['index.html', 'syllabus.html', 'phase-test.html', 'answer-keys.html'];
const css = () => readFile('public/css/style.css');
const app = () => readFile('public/js/app.js');

function motionSection() {
  const s = css();
  const start = s.indexOf('/* ── Motion');
  assert.ok(start > -1, 'style.css needs a Motion section');
  return s.slice(start);
}

test('motion section uses short durations and transform/opacity only', () => {
  const m = motionSection();
  const durations = [...m.matchAll(/(\d*\.?\d+)(ms|s)\b/g)].map(([, n, u]) => (u === 's' ? parseFloat(n) * 1000 : parseFloat(n)));
  assert.ok(durations.length > 0);
  for (const d of durations) assert.ok(d <= 260, `duration ${d}ms exceeds 260ms`);
  assert.doesNotMatch(m, /infinite/, 'no endless loops');
  assert.doesNotMatch(m, /transition:[^;]*\b(width|height|top|left|margin|padding)\b/, 'no layout-property transitions');
  assert.doesNotMatch(m, /filter:\s*blur/, 'no blur animations');
});

test('reduced-motion disables the new motion', () => {
  const m = motionSection();
  const rm = m.slice(m.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(m.includes('@media (prefers-reduced-motion: reduce)'));
  for (const sel of ['.card-enter', '.archive-collapse', '.modal-overlay', '::view-transition']) {
    assert.ok(rm.includes(sel), `reduced-motion block must cover ${sel}`);
  }
  assert.match(rm, /animation:\s*none/);
});

test('filters keep old cards (dimmed, aria-busy) instead of flashing a loading message', () => {
  const js = app();
  for (const fn of ['loadAnnouncements', 'loadAnswerKeys']) {
    const body = js.slice(js.indexOf(`async function ${fn}(`), js.indexOf('\n}\n', js.indexOf(`async function ${fn}(`)));
    assert.match(body, /setBusy\(container, true\)/, `${fn} sets busy`);
    assert.match(body, /requestId/, `${fn} ignores stale responses`);
    assert.match(body, /hasCards\(container\)/, `${fn} only shows Loading on first load`);
  }
  assert.match(css(), /\[aria-busy="true"\]/);
});

test('first cards stagger in, capped at six', () => {
  const js = app();
  assert.match(js, /function animateCards\(container\)/);
  assert.match(js, /slice\(0, 6\)/);
  assert.match(js, /--enter-delay/);
  const m = motionSection();
  assert.match(m, /\.card-enter\s*\{[^}]*animation:/);
});

test('archive sections animate open and close accessibly', () => {
  const js = app();
  assert.match(js, /function setupArchiveToggle\(/);
  assert.match(js, /setAttribute\('aria-expanded'/);
  assert.match(js, /\.inert = /);
  for (const page of ['syllabus.html', 'phase-test.html', 'answer-keys.html']) {
    const html = readFile(`public/${page}`);
    assert.match(html, /class="archive-collapse"[^>]*inert/, `${page} wraps the archive grid in a collapsed region`);
    assert.doesNotMatch(html, /class="archive-grid" style="display: none;"/, `${page} no longer toggles display`);
  }
  assert.match(motionSection(), /\.archive-collapse\s*\{[^}]*grid-template-rows:\s*0fr/);
  assert.match(motionSection(), /\.archive-collapse\.is-open\s*\{[^}]*grid-template-rows:\s*1fr/);
});

test('lightbox fades and scales instead of snapping', () => {
  const js = app();
  const open = js.slice(js.indexOf('function openLightbox'), js.indexOf('function closeLightbox'));
  assert.match(open, /is-open/);
  const close = js.slice(js.indexOf('function closeLightbox'), js.indexOf('// Lightbox click delegation'));
  assert.match(close, /transitionend/);
  assert.match(close, /setTimeout/, 'fallback when no transition fires (reduced motion)');
  const m = motionSection();
  assert.match(m, /\.modal-overlay\.is-open/);
  assert.match(m, /scale\(0\.96\)/);
});

test('cross-page view transitions with a static navbar', () => {
  const m = motionSection();
  assert.match(m, /@view-transition\s*\{\s*navigation:\s*auto;?\s*\}/);
  assert.match(m, /view-transition-name:\s*site-nav/);
  for (const page of PUBLIC_PAGES) {
    assert.match(readFile(`public/${page}`), /\?v=10.1/, `${page} assets bumped to 10.1`);
  }
});

test('press feedback on buttons and pills', () => {
  const m = motionSection();
  assert.match(m, /:active[^{]*\{[^}]*transform:\s*scale\(0\.98\)/);
});

test('lightbox opens even when no animation frame is delivered', () => {
  const js = app();
  const open = js.slice(js.indexOf('function openLightbox'), js.indexOf('function closeLightbox'));
  assert.doesNotMatch(open, /requestAnimationFrame/, 'a throttled tab would leave the lightbox invisible');
  assert.match(open, /offsetWidth/, 'flush styles so the transition starts from the hidden state');
});
