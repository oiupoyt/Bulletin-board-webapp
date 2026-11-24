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

// Only the weight each icon is rendered at ships (regular above 14px, fill at 14px and under, or as forced
// by a caller). icons.js falls back to the other weight, so a new call site still renders.
const REGULAR_NAMES = ['bell', 'calendar', 'caretDown', 'check', 'close', 'copy', 'doc', 'download', 'exam', 'key', 'megaphone', 'phone', 'search', 'signOut', 'tag'];
const FILL_NAMES = ['archive', 'arrowUpRight', 'bellRinging', 'close', 'download', 'externalLink', 'pin', 'trash'];
const regular = {};
const fill = {};
for (const name of REGULAR_NAMES) regular[name] = inner(path.join(P, 'regular', `${PHOSPHOR[name]}.svg`));
for (const name of FILL_NAMES) fill[name] = inner(path.join(P, 'fill', `${PHOSPHOR[name]}-fill.svg`));
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
    // Only the weight each icon is drawn at ships; any other request falls back to the other weight.
    const paths = (useFill ? FILL : REGULAR)[name] || (useFill ? REGULAR : FILL)[name];
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
