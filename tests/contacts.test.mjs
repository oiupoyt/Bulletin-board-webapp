import test from 'node:test';
import assert from 'node:assert/strict';
import { withServer, request, readFile } from './helpers.mjs';

const SECRETS = { SESSION_SECRET: 'contacts-test-secret', ADMIN_PASSWORD: 'pw' };
const PUBLIC_PAGES = ['index.html', 'syllabus.html', 'phase-test.html', 'answer-keys.html', 'contacts.html'];

async function login(port) {
  const res = await request(port, '/api/admin/login', { method: 'POST', body: { password: 'pw' } });
  return String(res.headers['set-cookie']).split(';')[0];
}

test('contacts: admin CRUD, validation, ordering and public listing', async (t) => {
  await withServer(t, SECRETS, async (port) => {
    const cookie = await login(port);
    const post = (body) => request(port, '/api/admin/contacts', { method: 'POST', headers: { cookie }, body });

    // validation
    for (const bad of [
      { name: '', phone: '9000000001', group: 'general' },
      { name: 'A', phone: '12345', group: 'general' },
      { name: 'A', phone: '+1 202 555 0100', group: 'general' },
      { name: 'A', phone: '9000000001', group: 'staff' },
      { name: 'x'.repeat(81), phone: '9000000001', group: 'general' },
      { name: 'A', phone: '9000000001', group: 'general', note: 'y'.repeat(81) },
    ]) {
      const res = await post(bad);
      assert.equal(res.status, 400, JSON.stringify(bad));
    }

    // accepts common Indian formats and normalises to 10 digits
    const a = await post({ name: 'Transport Two', phone: '+91 90000 00002', group: 'transport' });
    const b = await post({ name: 'First', phone: '+91 90000 00001', group: 'general' });
    const c = await post({ name: 'Second', phone: '09000000003', group: 'general', note: 'MCB app' });
    for (const r of [a, b, c]) assert.equal(r.status, 201, r.text);
    assert.equal(b.json.contact.phone, '9000000001');
    assert.equal(c.json.contact.phone, '9000000003');

    // public list: general before transport, insertion order within a group
    const pub = await request(port, '/api/contacts', { headers: { host: 'mod.oiupoyt.space' } });
    assert.equal(pub.status, 200);
    assert.deepEqual(pub.json.contacts.map((x) => [x.group, x.name]), [
      ['general', 'First'],
      ['general', 'Second'],
      ['transport', 'Transport Two'],
    ]);
    assert.equal(pub.json.contacts[1].note, 'MCB app');

    // edit + delete
    const id = c.json.contact.id;
    const edit = await request(port, `/api/admin/contacts/${id}`, {
      method: 'PUT', headers: { cookie }, body: { name: 'Second Edited', phone: '9000000003', group: 'general', note: '' },
    });
    assert.equal(edit.status, 200, edit.text);
    assert.equal(edit.json.contact.note, null);
    const del = await request(port, `/api/admin/contacts/${a.json.contact.id}`, { method: 'DELETE', headers: { cookie } });
    assert.equal(del.status, 200);
    const after = await request(port, '/api/contacts');
    assert.deepEqual(after.json.contacts.map((x) => x.name), ['First', 'Second Edited']);
    assert.equal((await request(port, '/api/admin/contacts/999999', { method: 'DELETE', headers: { cookie } })).status, 404);

    // auth: unauthenticated admin routes are refused; admin is hidden on the public host
    const anon = await request(port, '/api/admin/contacts', { method: 'POST', body: { name: 'A', phone: '9876543210', group: 'general' } });
    assert.equal(anon.status, 401);
    assert.equal((await request(port, '/api/admin/contacts', { method: 'POST', headers: { host: 'mod.oiupoyt.space', cookie }, body: {} })).status, 404);
  });
});

test('contact routes never send push notifications', () => {
  const admin = readFile('src/routes/admin.js');
  const start = admin.indexOf('// ── Contacts');
  assert.ok(start > -1);
  const end = admin.indexOf('// ──', start + 10);
  const section = admin.slice(start, end === -1 ? undefined : end);
  assert.doesNotMatch(section, /broadcastNotification/);
});

test('contacts page is served, marked public, and cached offline', async (t) => {
  await withServer(t, SECRETS, async (port) => {
    const res = await request(port, '/contacts', { headers: { host: 'mod.oiupoyt.space' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-bulletin-page'], 'public');
    assert.match(res.text, /id="contactsList"/);
  });
  const sw = readFile('public/sw.js');
  assert.match(sw, /'\/contacts'/);
});

test('every public page links to College contacts in the footer', () => {
  for (const page of PUBLIC_PAGES) {
    const html = readFile(`public/${page}`);
    const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
    assert.match(footer, /<a href="\/contacts" class="footer-contacts-link">College contacts<\/a>/, page);
    assert.doesNotMatch(html.slice(html.indexOf('<nav'), html.indexOf('</nav>')), /\/contacts/, `${page}: not in navbar`);
  }
});

test('contact cards offer WhatsApp and Copy with accessible names and a clipboard fallback', () => {
  const js = readFile('public/js/app.js');
  assert.match(js, /function renderContacts\(/);
  assert.match(js, /https:\/\/wa\.me\/91\$\{/);
  assert.match(js, /rel="noopener noreferrer"/);
  assert.match(js, /aria-label="WhatsApp \$\{/);
  assert.match(js, /aria-label="Copy \$\{/);
  assert.match(js, /navigator\.clipboard\.writeText/);
  assert.match(js, /Press and hold to copy/);
  assert.match(js, /function formatPhone\(/);
  assert.match(js, /Transport/);
  const icons = readFile('public/js/icons.js');
  assert.match(icons, /whatsapp:/);
  assert.match(icons, /copy:/);
  const css = readFile('public/css/style.css');
  assert.match(css, /\.contact-action\s*\{[^}]*min-height:\s*2\.75rem/);
  assert.match(css, /\.contact-action:focus-visible/);
});

test('admin panel has a Contacts tab with a form', () => {
  const html = readFile('public/admin.html');
  assert.match(html, /data-target="tab-contacts"/);
  assert.match(html, /id="contactForm"/);
  for (const field of ['name', 'phone', 'group', 'note']) {
    assert.match(html, new RegExp(`id="contactForm"[\\s\\S]*name="${field}"`));
  }
  const js = readFile('public/js/admin.js');
  assert.match(js, /async function loadAdminContacts\(/);
  assert.match(js, /deleteContact/);
  assert.match(js, /editContact/);
});

test('no phone numbers are committed outside tests', () => {
  // Contacts live only in the database. Any 10-digit Indian mobile in source is a leak.
  const mobile = /(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/;
  for (const file of ['src/db.js', 'src/routes/admin.js', 'src/routes/public.js', 'scripts/seed.js', 'public/contacts.html', 'public/js/app.js', 'public/js/admin.js', 'public/admin.html', 'README.md']) {
    assert.doesNotMatch(readFile(file).replaceAll('98765 43210', '').replaceAll('9876543210', ''), mobile, file);
  }
});
