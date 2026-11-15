import test from 'node:test';
import assert from 'node:assert/strict';
import { withServer, request, readFile } from './helpers.mjs';

const PROD_HOSTS = {
  PUBLIC_HOSTS: 'mod.oiupoyt.space,modinfo.oiupoyt.space',
  ADMIN_HOSTS: 'adminmod.oiupoyt.space',
  REDIRECT_HOSTS: 'modtest.oiupoyt.space',
};
const SECRETS = { SESSION_SECRET: 'test-secret-0123456789abcdef', ADMIN_PASSWORD: 'correct horse' };

test('forged X-Forwarded-Host cannot reach admin from the public host', async (t) => {
  await withServer(t, { ...PROD_HOSTS, ...SECRETS }, async (port) => {
    const forged = { host: 'mod.oiupoyt.space', 'x-forwarded-host': 'adminmod.oiupoyt.space' };
    assert.equal((await request(port, '/api/admin/check-auth', { headers: forged })).status, 404);
    assert.equal((await request(port, '/login.html', { headers: forged })).status, 404);
    // The real admin host still works
    assert.equal((await request(port, '/api/admin/check-auth', { headers: { host: 'adminmod.oiupoyt.space' } })).status, 401);
  });
});

test('default host config reproduces production routing', async (t) => {
  await withServer(t, SECRETS, async (port) => {
    const pub = await request(port, '/api/admin/check-auth', { headers: { host: 'mod.oiupoyt.space' } });
    assert.equal(pub.status, 404);
    const info = await request(port, '/admin.html', { headers: { host: 'modinfo.oiupoyt.space' } });
    assert.equal(info.status, 404);
    const admin = await request(port, '/', { headers: { host: 'adminmod.oiupoyt.space' } });
    assert.equal(admin.status, 200);
    assert.match(admin.text, /admin/i);
    const redirect = await request(port, '/syllabus', { headers: { host: 'modtest.oiupoyt.space' } });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.location, 'https://mod.oiupoyt.space/syllabus');
  });
});

test('unknown hosts are treated as public, not as local admin', async (t) => {
  await withServer(t, SECRETS, async (port) => {
    const res = await request(port, '/api/admin/check-auth', { headers: { host: 'evil.example' } });
    assert.equal(res.status, 404);
  });
});

test('host lists are configurable for the staging instance', async (t) => {
  await withServer(t, { PUBLIC_HOSTS: 'modtest.oiupoyt.space', ADMIN_HOSTS: '', REDIRECT_HOSTS: '', ...SECRETS }, async (port) => {
    const page = await request(port, '/syllabus', { headers: { host: 'modtest.oiupoyt.space' } });
    assert.equal(page.status, 200);
    const admin = await request(port, '/api/admin/check-auth', { headers: { host: 'modtest.oiupoyt.space' } });
    assert.equal(admin.status, 404);
    // Admin through an SSH port-forward (Host: localhost) still works
    assert.equal((await request(port, '/api/admin/check-auth', { headers: { host: 'localhost:4001' } })).status, 401);
  });
});

test('server binds to loopback by default', () => {
  const server = readFile('server.js');
  assert.match(server, /config\.host/);
  assert.match(readFile('src/config.js'), /HOST \|\| '127\.0\.0\.1'/);
});

test('push subscribe only accepts real push-service endpoints', async (t) => {
  await withServer(t, SECRETS, async (port) => {
    const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
    for (const endpoint of [
      'https://192.168.0.1/push',
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com.evil.example/x',
      'https://localhost/x',
      'not a url',
    ]) {
      const res = await request(port, '/api/push/subscribe', { method: 'POST', body: { endpoint, keys } });
      assert.equal(res.status, 400, `should reject ${endpoint}`);
    }
    const tooLong = await request(port, '/api/push/subscribe', {
      method: 'POST',
      body: { endpoint: 'https://fcm.googleapis.com/fcm/send/' + 'a'.repeat(2000), keys },
    });
    assert.equal(tooLong.status, 400);
    const ok = await request(port, '/api/push/subscribe', {
      method: 'POST',
      body: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys },
    });
    assert.equal(ok.status, 201);
    const moz = await request(port, '/api/push/subscribe', {
      method: 'POST',
      body: { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc', keys },
    });
    assert.equal(moz.status, 201);
    const apple = await request(port, '/api/push/subscribe', {
      method: 'POST',
      body: { endpoint: 'https://web.push.apple.com/QGuQyavXut', keys },
    });
    assert.equal(apple.status, 201);
  });
});

test('push subscribe is rate limited per client', async (t) => {
  await withServer(t, SECRETS, async (port) => {
    let last;
    for (let i = 0; i < 40; i += 1) {
      last = await request(port, '/api/push/subscribe', { method: 'POST', body: { endpoint: 'bad' } });
      if (last.status === 429) break;
    }
    assert.equal(last.status, 429);
  });
});

test('spoofed cf-connecting-ip does not reset the login lockout', async (t) => {
  await withServer(t, SECRETS, async (port) => {
    // Not via cloudflared: the server sees a direct client, so the header must be ignored.
    // Requests arrive from loopback in tests, so prove the header is not the key by varying it.
    const attempts = [];
    for (let i = 0; i < 7; i += 1) {
      attempts.push(
        await request(port, '/api/admin/login', {
          method: 'POST',
          headers: { 'cf-connecting-ip': `10.0.0.${i}`, 'x-forwarded-for': `10.1.0.${i}` },
          body: { password: 'wrong' },
        })
      );
    }
    assert.equal(attempts.at(-1).status, 429, 'lockout must apply despite rotating headers');
  });
});

test('login lockout records are pruned', () => {
  const auth = readFile('src/auth.js');
  assert.match(auth, /pruneLoginAttempts/);
  assert.match(auth, /\.unref\(\)/);
});

test('login sets a session cookie without echoing the token', async (t) => {
  await withServer(t, SECRETS, async (port) => {
    const res = await request(port, '/api/admin/login', { method: 'POST', body: { password: 'correct horse' } });
    assert.equal(res.status, 200);
    assert.equal(res.json.token, undefined);
    assert.match(String(res.headers['set-cookie']), /admin_session=.*HttpOnly/i);
    assert.doesNotMatch(String(res.headers['set-cookie']), /Secure/i, 'plain http on localhost is not secure');
    const https = await request(port, '/api/admin/login', {
      method: 'POST',
      headers: { 'x-forwarded-proto': 'https' },
      body: { password: 'correct horse' },
    });
    assert.match(String(https.headers['set-cookie']), /Secure/i, 'cookie must be Secure behind the https tunnel');
  });
});

test('server errors do not leak internal messages', async (t) => {
  for (const file of ['src/routes/admin.js', 'src/routes/public.js', 'server.js']) {
    assert.doesNotMatch(readFile(file), /details:\s*err\.message/, `${file} still returns err.message`);
  }
  await withServer(t, SECRETS, async (port) => {
    const res = await request(port, '/api/announcements', {
      method: 'GET',
    });
    assert.equal(res.status, 200);
    const bad = await request(port, '/api/push/subscribe', { method: 'POST', body: '{"broken', headers: { 'content-type': 'application/json' } });
    assert.equal(bad.status, 400);
    assert.doesNotMatch(bad.text, /JSON at position|Unexpected/i);
  });
});

test('health is minimal publicly and detailed locally', async (t) => {
  await withServer(t, SECRETS, async (port) => {
    const pub = await request(port, '/health', { headers: { host: 'mod.oiupoyt.space' } });
    assert.deepEqual(pub.json, { status: 'ok' });
    const local = await request(port, '/health');
    assert.equal(local.json.status, 'ok');
    assert.ok(local.json.memory);
  });
});

test('html responses carry a strict content security policy', async (t) => {
  await withServer(t, SECRETS, async (port) => {
    for (const p of ['/', '/syllabus', '/login.html', '/admin.html']) {
      const res = await request(port, p);
      const csp = res.headers['content-security-policy'] || '';
      assert.match(csp, /default-src 'self'/, `${p} csp`);
      assert.match(csp, /script-src 'self'(;|$)/, `${p} must not allow inline script`);
      assert.match(csp, /object-src 'none'/);
      assert.match(csp, /frame-ancestors/);
    }
  });
  for (const page of ['index.html', 'syllabus.html', 'phase-test.html', 'answer-keys.html', 'login.html', 'admin.html']) {
    const html = readFile(`public/${page}`);
    assert.doesNotMatch(html, /<script>(?!\s*<\/script>)/, `${page} has an inline script`);
    assert.doesNotMatch(html, /\son[a-z]+="/, `${page} has an inline handler`);
  }
  assert.doesNotMatch(readFile('public/js/admin.js'), /onclick=/, 'admin.js must not render inline handlers');
});

test('markdown is sanitized with DOMPurify', () => {
  const app = readFile('public/js/app.js');
  assert.match(app, /DOMPurify\.sanitize/);
  for (const page of ['index.html', 'answer-keys.html']) {
    assert.match(readFile(`public/${page}`), /\/js\/purify\.min\.js/);
  }
});

test('admin creates accept a silent flag that skips push', () => {
  const admin = readFile('src/routes/admin.js');
  const broadcasts = admin.match(/broadcastNotification\(/g) || [];
  const guarded = admin.match(/if \(!isSilent\(req\)\)/g) || [];
  assert.ok(broadcasts.length >= 4);
  assert.equal(guarded.length, broadcasts.length);
  const html = readFile('public/admin.html');
  assert.equal((html.match(/name="silent"/g) || []).length, 4);
});

test('notificationclick focuses or opens a window without relying on navigate()', () => {
  const sw = readFile('public/sw.js');
  const click = sw.slice(sw.indexOf("'notificationclick'"));
  assert.match(click, /openWindow/);
  assert.match(click, /catch/);
});

test('upload validation errors return 400 with a readable message', async (t) => {
  await withServer(t, SECRETS, async (port) => {
    const login = await request(port, '/api/admin/login', { method: 'POST', body: { password: 'correct horse' } });
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const boundary = '----t' + Date.now();
    const body =
      `--${boundary}\r\nContent-Disposition: form-data; name="week_label"\r\n\r\nWeek 1\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="x.exe"\r\nContent-Type: application/octet-stream\r\n\r\nMZ\r\n` +
      `--${boundary}--\r\n`;
    const res = await request(port, '/api/admin/syllabus', {
      method: 'POST',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /JPG, PNG, or WebP/);
  });
});

test('upload of a valid image succeeds silently', async (t) => {
  await withServer(t, SECRETS, async (port) => {
    const login = await request(port, '/api/admin/login', { method: 'POST', body: { password: 'correct horse' } });
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const boundary = '----t' + Date.now();
    const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('latin1');
    const body =
      `--${boundary}\r\nContent-Disposition: form-data; name="week_label"\r\n\r\nWeek 1\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="silent"\r\n\r\ntrue\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="s.png"\r\nContent-Type: image/png\r\n\r\n${png}\r\n` +
      `--${boundary}--\r\n`;
    const res = await request(port, '/api/admin/syllabus', {
      method: 'POST',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
    assert.equal(res.status, 201, res.text);
  });
});

test('config ships no hard-coded secrets', () => {
  const config = readFile('src/config.js');
  // No string fallback for a secret: every secret reads from the environment or defaults to ''.
  for (const key of ['ADMIN_PASSWORD', 'SESSION_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) {
    assert.match(config, new RegExp(`process\\.env\\.${key} \\|\\| ''`), `${key} must default to ''`);
  }
  assert.doesNotMatch(config, /['"][A-Za-z0-9_-]{32,}['"]/, 'no key-like literal in config');
});
