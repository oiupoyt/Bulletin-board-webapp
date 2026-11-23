// Builds public/js/icons.js from Phosphor (regular + fill) and Simple Icons brand marks.
// Usage: npm pack @phosphor-icons/core@2.1.1 simple-icons@16.38.1 into <pkgs>, extract each tarball
// into a folder named after it, then: node scripts/build-icons.mjs <pkgs> public/js/icons.js
import fs from 'node:fs';
import path from 'node:path';

const [, , pkgs, out] = process.argv;
const P = path.join(pkgs, 'phosphor-icons-core-2.1.1/package/assets');
const SI = path.join(pkgs, 'simple-icons-16.38.1/package/icons');

const PHOSPHOR = {
  bell: 'bell',
  bellRinging: 'bell-ringing',
  search: 'magnifying-glass',
  close: 'x',
  download: 'download-simple',
  pin: 'push-pin',
  archive: 'archive',
  star: 'star',
  calendar: 'calendar-blank',
  doc: 'file-text',
  externalLink: 'arrow-square-out',
  megaphone: 'megaphone',
  key: 'key',
  copy: 'copy',
  check: 'check',
  caretDown: 'caret-down',
  signOut: 'sign-out',
  trash: 'trash',
  arrowUpRight: 'arrow-up-right',
  exam: 'exam',
  phone: 'phone',
  tag: 'tag',
};

const inner = (file) =>
  fs.readFileSync(file, 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '').replace(/<title>[^<]*<\/title>/g, '').replace(/\s+/g, ' ').trim();

const regular = {};
const fill = {};
for (const [name, file] of Object.entries(PHOSPHOR)) {
  regular[name] = inner(path.join(P, 'regular', `${file}.svg`));
  fill[name] = inner(path.join(P, 'fill', `${file}-fill.svg`));
}
const brands = {};
for (const name of ['whatsapp', 'instagram']) brands[name] = inner(path.join(SI, `${name}.svg`));

const toObj = (o) => ['{', ...Object.entries(o).map(([k, v]) => `    ${k}: '${v}',`), '  }'].join('\n');
const js = `/**
 * Icon set. Generated from Phosphor Icons (MIT) and Simple Icons (CC0) brand marks; do not hand-edit paths.
 * One family, one look: Phosphor regular at 16px and up, Phosphor fill at 14px and under,
 * where thin outlines go wiry. Brand marks are the real ones, drawn on a 24px grid.
 */
(function () {
  const REGULAR = ${toObj(regular)};
  const FILL = ${toObj(fill)};
  const BRANDS = ${toObj(brands)};

  // Names kept for callers: bell, search, close, download, pin, archive, star, calendar, doc, externalLink.
  function icon(name, size = 16, opts = {}) {
    const brand = BRANDS[name];
    if (brand) {
      return \`<svg class="icon icon-\${name}" width="\${size}" height="\${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">\${brand}</svg>\`;
    }
    const useFill = opts.fill === true || (opts.fill !== false && size <= 14);
    const paths = (useFill ? FILL : REGULAR)[name];
    if (!paths) throw new Error(\`Unknown icon: \${name}\`);
    return \`<svg class="icon icon-\${name}" width="\${size}" height="\${size}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">\${paths}</svg>\`;
  }

  // Fill every static placeholder once, at parse time: <span data-icon="bell" data-icon-size="16">.
  document.querySelectorAll('[data-icon]').forEach((node) => {
    const fillAttr = node.dataset.iconFill;
    node.innerHTML = icon(node.dataset.icon, Number(node.dataset.iconSize) || 16, {
      fill: fillAttr === undefined ? undefined : fillAttr === 'true',
    });
  });

  window.AppIcons = { icon };
})();
`;
fs.writeFileSync(out, js);
console.log('wrote', out, js.length, 'bytes');
