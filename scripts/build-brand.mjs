// Renders the brand rasters from the SVG sources in public/:
//   favicon.svg       -> favicon-32x32.png, favicon-192x192.png, icon-512.png, favicon.ico (16, 32, 48)
//   icon-maskable.svg -> icon-maskable-192.png, icon-maskable-512.png, apple-touch-icon.png (180)
//   og-card.svg       -> og-image.png (1200 x 630)
// The rasteriser is not a project dependency. Install it somewhere else and pass its folder:
//   npm install --prefix <dir> @resvg/resvg-js@2.6.2 png-to-ico@2.1.8
//   node scripts/build-brand.mjs <dir>/node_modules
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const modules = process.argv[2];
if (!modules) throw new Error('usage: node scripts/build-brand.mjs <node_modules with @resvg/resvg-js and png-to-ico>');
const require = createRequire(path.join(path.resolve(modules), 'noop.js'));
const { Resvg } = require('@resvg/resvg-js');
const pngToIco = require('png-to-ico');

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (f) => fs.readFileSync(path.join(pub, f), 'utf8');

function render(svg, width) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' },
  }).render().asPng();
  return Buffer.from(png);
}

const mark = read('favicon.svg');
const maskable = read('icon-maskable.svg');
const og = read('og-card.svg');

const out = {
  'favicon-32x32.png': render(mark, 32),
  'favicon-192x192.png': render(mark, 192),
  'icon-512.png': render(mark, 512),
  'icon-maskable-192.png': render(maskable, 192),
  'icon-maskable-512.png': render(maskable, 512),
  'apple-touch-icon.png': render(maskable, 180),
  'og-image.png': render(og, 1200),
};
for (const [file, buf] of Object.entries(out)) {
  fs.writeFileSync(path.join(pub, file), buf);
  console.log('wrote', file, buf.length, 'bytes');
}

const ico = await pngToIco([render(mark, 16), render(mark, 32), render(mark, 48)]);
fs.writeFileSync(path.join(pub, 'favicon.ico'), ico);
console.log('wrote favicon.ico', ico.length, 'bytes');
