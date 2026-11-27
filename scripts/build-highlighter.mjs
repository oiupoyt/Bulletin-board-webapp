// Generates the torn-paper highlighter used by `.hl` (the exam date) in public/css/style.css.
// The page itself looks torn open over a yellow sheet. The yellow is cut to the torn shape by a
// CSS mask, so everything outside the tear is the real page (its light streaks, whatever sits
// behind), never a painted stand-in for it. Inside the cut: the white fibrous rim of exposed paper,
// loose fibres, the rim's shadow on the yellow, a smaller bottom rim, paper grain and a peeled
// curl at the right end. Deterministic (seeded): re-running produces the same CSS.
// Usage: node scripts/build-highlighter.mjs
// Writes the SVGs to public/img/hl/ (fetched only on pages that show a highlight, cached for good:
// each URL carries a hash of its file) and rewrites the block between the HIGHLIGHTER markers.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const CSS = path.join(PUBLIC, 'css', 'style.css');
const OUT = path.join(PUBLIC, 'img', 'hl');

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1200; // one tile; it repeats seamlessly, since every wave below completes in W
const f = (n) => Math.round(n * 10) / 10;

// A tear line: two slow waves that complete within the tile, plus fine jitter that fades to zero
// at both ends so the tile joins its neighbour without a step.
function tearLine(rand, base, amp, step, jitter) {
  const pts = [];
  let x = 0;
  while (x < W) {
    const fade = Math.min(1, Math.min(x, W - x) / 40);
    const y = base
      + amp * Math.sin((x / W) * Math.PI * 2 * 5 + 0.7)
      + amp * 0.55 * Math.sin((x / W) * Math.PI * 2 * 17 + 2.1)
      + (rand() - 0.5) * 2 * jitter * fade;
    pts.push([x, y]);
    x += step[0] + rand() * (step[1] - step[0]);
  }
  pts.push([W, pts[0][1]]);
  return pts;
}

const poly = (pts) => pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L');
const open = (H) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;

// The mask and the paint for one edge go through the same displacement, so the cut and the rim
// stay in register.
const displace = (seed, scale) => `<filter id="r" x="0" y="-20%" width="100%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".55 .9" numOctaves="2" seed="${seed}" stitchTiles="stitch"/><feDisplacementMap in="SourceGraphic" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`;

// A smooth, closed random signal over the tile: a random walk with its drift removed so it ends
// where it starts, then smoothed. Real tears bite irregularly; sines alone look machined.
function walk(rand, n, smooth) {
  const w = [0];
  for (let i = 1; i <= n; i++) w.push(w[i - 1] + (rand() - 0.5));
  const drift = w[n];
  const closed = w.map((v, i) => v - (drift * i) / n);
  const out = closed.map((_, i) => {
    let s = 0;
    for (let k = -smooth; k <= smooth; k++) s += closed[(i + k + n) % n];
    return s / (2 * smooth + 1);
  });
  const max = Math.max(...out.map(Math.abs)) || 1;
  return (x) => out[Math.round((x / W) * n) % n] / max;
}

function topEdge() {
  const rand = rng(20261127);
  const H = 64;
  const bites = walk(rand, 600, 6);   // the tear's irregular bites
  const split = walk(rand, 300, 9);   // where the paper layers split, the white rim widens
  const tear = tearLine(rand, 21, 2.2, [1.2, 4], 1.9).map(([x, y]) => [x, y + bites(x) * 6.5]);
  // How far the white paper core shows below the cut: thin in places, wide where layers split.
  const fringe = tear.map(([x, y]) => {
    const fade = Math.min(1, Math.min(x, W - x) / 40);
    return [x, y + (1.2 + Math.max(0, split(x)) ** 2 * 7 + rand() * 1.6) * fade + (1 - fade) * 2];
  });
  const below = `M0 ${H} L${W} ${H} L${poly(tear.slice().reverse())} Z`;
  const rim = `M0 0 L${W} 0 L${poly(fringe.slice().reverse())} Z`;
  let fibres = '';
  for (let i = 0; i < 120; i++) {
    const x = 30 + rand() * (W - 60);
    const at = fringe.reduce((a, p) => (Math.abs(p[0] - x) < Math.abs(a[0] - x) ? p : a));
    const len = 1.2 + rand() ** 2 * 7;
    const ang = (rand() - 0.5) * 1.4;
    const x2 = x + Math.sin(ang) * len;
    const y2 = at[1] + Math.cos(ang) * len;
    fibres += `<path d="M${f(x)} ${f(at[1] - 1)} Q${f((x + x2) / 2 + (rand() - 0.5) * 3)} ${f((at[1] + y2) / 2)} ${f(x2)} ${f(y2)}" stroke-opacity="${f(0.45 + rand() * 0.5)}" stroke-width="${f(0.3 + rand() * 0.6)}"/>`;
  }
  const mask = `${open(H)}<defs>${displace(7, 3.4)}</defs><path d="${below}" fill="#000" filter="url(#r)"/></svg>`;
  // Two shadows lift the torn paper off the yellow: a tight contact shadow and a soft wide one.
  const paint = `${open(H)}<defs>${displace(7, 3.4)}<filter id="s" x="-5%" y="-50%" width="110%" height="250%"><feGaussianBlur stdDeviation="3.2"/></filter><filter id="c" x="-5%" y="-50%" width="110%" height="250%"><feGaussianBlur stdDeviation="1"/></filter>`
    + `<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset=".25" stop-color="#ffffff"/><stop offset=".5" stop-color="#f3f1ec"/></linearGradient><path id="rim" d="${rim}"/></defs>`
    + '<use href="#rim" transform="translate(0 5)" fill="#5c3800" fill-opacity=".42" filter="url(#s)"/>'
    + '<use href="#rim" transform="translate(0 1.6)" fill="#4a2d00" fill-opacity=".45" filter="url(#c)"/>'
    + '<use href="#rim" fill="url(#w)" filter="url(#r)"/>'
    + `<g filter="url(#r)" stroke="#fff" fill="none" stroke-linecap="round">${fibres}</g></svg>`;
  return { mask, paint };
}

function bottomEdge() {
  const rand = rng(1130);
  const H = 40;
  const tear = tearLine(rand, 24, 1.8, [2, 7], 1.2);
  const rimLine = tear.map(([x, y]) => [x, y - 1 - rand() * 2 * Math.min(1, Math.min(x, W - x) / 40)]);
  const above = `M0 0 L${W} 0 L${poly(tear.slice().reverse())} Z`;
  const rim = `M0 ${H} L${W} ${H} L${poly(rimLine.slice().reverse())} Z`;
  const mask = `${open(H)}<defs>${displace(3, 2.4)}</defs><path d="${above}" fill="#000" filter="url(#r)"/></svg>`;
  const paint = `${open(H)}<defs>${displace(3, 2.4)}</defs><path d="${rim}" fill="#ffffff" fill-opacity=".92" filter="url(#r)"/></svg>`;
  return { mask, paint };
}

// Paper grain on the yellow: fine fractal noise, faint, tiled.
const grain = '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="11" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .28  0 0 0 0 0  0 0 0 .16 0"/></filter><rect width="180" height="180" filter="url(#n)"/></svg>';

// The peeled curl at the right end: a roll of the torn paper, a shaded cylinder with rounded ends.
// It is exempt from the tear mask, so it stands a little proud of the torn edges, as a roll would.
// Its left side throws a shadow onto the yellow.
const curl = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 130" preserveAspectRatio="none">'
  + '<defs><linearGradient id="cyl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9b7b2"/><stop offset=".18" stop-color="#e4e2de"/><stop offset=".46" stop-color="#ffffff"/><stop offset=".72" stop-color="#f4f3f0"/><stop offset="1" stop-color="#cfcdc8"/></linearGradient>'
  + '<linearGradient id="sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5c3800" stop-opacity="0"/><stop offset="1" stop-color="#5c3800" stop-opacity=".42"/></linearGradient>'
  + '<filter id="b" x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation="2"/></filter></defs>'
  + '<rect x="0" y="16" width="12" height="98" fill="url(#sh)" filter="url(#b)"/>'
  + '<rect x="9" y="2" width="29" height="126" rx="14.5" ry="8" fill="url(#cyl)"/>'
  + '<path d="M18 12 V118" stroke="#fff" stroke-opacity=".9" stroke-width="1.4" stroke-linecap="round"/>'
  + '<path d="M35.5 11 V119" stroke="#a9a7a2" stroke-opacity=".5" stroke-width="1"/>'
  + '</svg>';
// The roll's silhouette only, for the mask: its shadow must not punch through above the tear.
const curlMask = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 130" preserveAspectRatio="none"><rect x="9" y="2" width="29" height="126" rx="14.5" ry="8" fill="#000"/></svg>';

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let total = 0;
const files = new Map();
const url = (svg, name) => {
  if (!files.has(name)) {
    fs.writeFileSync(path.join(OUT, `${name}.svg`), svg);
    total += svg.length;
    files.set(name, crypto.createHash('sha256').update(svg).digest('hex').slice(0, 8));
  }
  return `url("/img/hl/${name}.svg?v=${files.get(name)}")`;
};

const top = topEdge();
const bottom = bottomEdge();
const TOP_H = '0.3em';
const BOTTOM_H = '0.15em';
const CURL_W = '0.32em';
const maskLayers = `
    ${url(top.mask, 'top-mask')} left top / auto ${TOP_H} repeat-x,
    ${url(bottom.mask, 'bottom-mask')} left bottom / auto ${BOTTOM_H} repeat-x,
    linear-gradient(#000, #000) left calc(${TOP_H} - 1px) / 100% calc(100% - ${TOP_H} - ${BOTTOM_H} + 2px) no-repeat,
    ${url(curlMask, 'curl-mask')} right top / ${CURL_W} 100% no-repeat`;

const block = `/* HIGHLIGHTER:START (generated by scripts/build-highlighter.mjs; edit the script, not this) */
/* The highlighter: the page itself looks torn open over a sheet of the |M| yellow. The yellow is
 * cut to the torn shape by a mask, so the page around it is the real page. Inside the cut, top
 * first: the exposed white paper rim with loose fibres and its shadow, the bottom rim, the peeled
 * curl at the right end, the shadow falling down from the rim, paper grain, the yellow. Every
 * layer and the mask clone onto each line the phrase wraps to. */
.hl {
  padding: 0.07em 0.36em 0.05em 0.12em;
  margin: 0 -0.06em;
  background:
    ${url(top.paint, 'top')} left top / auto ${TOP_H} repeat-x,
    ${url(bottom.paint, 'bottom')} left bottom / auto ${BOTTOM_H} repeat-x,
    ${url(curl, 'curl')} right top / ${CURL_W} 100% no-repeat,
    linear-gradient(180deg, rgba(120, 70, 0, 0.24), rgba(120, 70, 0, 0) 0.42em) left 0.08em / 100% 100% no-repeat,
    ${url(grain, 'grain')} 0 0 / 180px 180px,
    linear-gradient(180deg, #ffd955 0%, #f7c41a 45%, #eeaa0d 100%);
  -webkit-mask:${maskLayers};
  mask:${maskLayers};
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  color: #241a00;
}

/* The warm glow follows the torn outline: a drop shadow on the highlight's parent (the exam date),
 * since the mask would cut any shadow drawn by the highlighter itself. */
.phase-date {
  filter: drop-shadow(0 0.12em 0.32em rgba(233, 160, 12, 0.42));
}
/* HIGHLIGHTER:END */`;

let css = fs.readFileSync(CSS, 'utf8');
const start = css.indexOf('/* HIGHLIGHTER:START');
const end = css.indexOf('/* HIGHLIGHTER:END */');
if (start === -1 || end === -1) throw new Error('style.css needs the HIGHLIGHTER:START and HIGHLIGHTER:END markers');
css = css.slice(0, start) + block + css.slice(end + '/* HIGHLIGHTER:END */'.length);
fs.writeFileSync(CSS, css);
console.log(`highlighter: ${block.length} bytes of CSS, ${files.size} SVGs (${total} bytes) in public/img/hl/`);
