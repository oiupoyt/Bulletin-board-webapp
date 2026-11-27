// Minifies the stylesheets for serving: public/css/style.css -> style.min.css, admin.css -> admin.min.css.
// Edit the readable sources, then run: npm run build:css
// Each output starts with a hash of its source so the tests can tell when a build is stale.
// esbuild is fetched by npx on demand and is not a runtime dependency (the tablet never needs it).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ESBUILD = 'esbuild@0.24.2';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const name of ['style', 'admin']) {
  const src = path.join(root, 'public', 'css', `${name}.css`);
  const out = path.join(root, 'public', 'css', `${name}.min.css`);
  const source = fs.readFileSync(src, 'utf8');
  // On Windows npx is npx.cmd, which Node only runs through a shell.
  const win = process.platform === 'win32';
  const minified = execFileSync(win ? 'npx.cmd' : 'npx', ['-y', ESBUILD, '--loader=css', '--minify', '--log-level=warning'], {
    input: source,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
    shell: win,
  });
  const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
  fs.writeFileSync(out, `/* build:${hash} */\n${minified}`);
  console.log(`${name}.min.css  ${source.length} -> ${minified.length} bytes`);
}
