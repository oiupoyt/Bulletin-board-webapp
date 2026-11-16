import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './src/config.js';
import { publicRouter } from './src/routes/public.js';
import { adminRouter } from './src/routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
// Only cloudflared on loopback may set X-Forwarded-* (protocol, client address).
app.set('trust proxy', 'loopback');

// Inline styles stay allowed (style="" attributes throughout); scripts must be same-origin files.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
].join('; ');

// Global Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', CSP);
  next();
});

// Middleware
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// Cookie parser helper (zero external dependency)
app.use((req, res, next) => {
  req.cookies = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach((c) => {
      const [k, ...v] = c.trim().split('=');
      if (!k) return;
      try {
        req.cookies[k] = decodeURIComponent(v.join('='));
      } catch {
        // Malformed percent-encoding: ignore that cookie rather than failing the request.
      }
    });
  }
  next();
});

// Domain identification helper
const NO_CACHE_SEND_OPTS = { headers: { 'Cache-Control': 'no-cache, must-revalidate' } };
const PUBLIC_PAGE_FILES = new Set(['index.html', 'syllabus.html', 'phase-test.html', 'answer-keys.html', 'contacts.html']);
// X-Bulletin-Page tells the service worker which responses are safe to keep for offline use.
function sendPublicPage(res, file) {
  const headers = { ...NO_CACHE_SEND_OPTS.headers };
  if (PUBLIC_PAGE_FILES.has(file)) headers['X-Bulletin-Page'] = 'public';
  res.sendFile(path.join(__dirname, 'public', file), { headers });
}
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// Host header only. X-Forwarded-Host is client-controlled and passes through Cloudflare untouched.
function requestHost(req) {
  const raw = String(req.headers.host || '').toLowerCase();
  return raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.split(':')[0];
}

function getDomainContext(req) {
  const host = requestHost(req);
  if (config.redirectHosts.includes(host)) return 'redirect';
  if (config.adminHosts.includes(host)) return 'admin';
  if (LOCAL_HOSTS.has(host)) return 'local'; // direct or SSH-forwarded access on the device itself
  return 'public'; // configured public hosts and anything unrecognised
}

// Domain routing filter middleware
// Versioned asset requests (?v=) are cache-busted content; mark them immutable
app.use((req, res, next) => {
  if (req.query && req.query.v) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
});

app.use((req, res, next) => {
  const domain = getDomainContext(req);
  req.domain = domain;

  if (domain === 'redirect') {
    return res.redirect(301, `${config.canonicalOrigin}${req.originalUrl || '/'}`);
  }
  const pathLower = req.path.toLowerCase();

  // If request comes from the public website (mod.oiupoyt.space or modinfo.oiupoyt.space):
  // Completely block and hide the admin panel and admin API
  if (domain === 'public') {
    if (
      pathLower.startsWith('/api/admin') ||
      pathLower === '/admin' ||
      pathLower === '/admin.html' ||
      pathLower === '/login' ||
      pathLower === '/login.html' ||
      pathLower.endsWith('/admin.js') ||
      pathLower.endsWith('/login.js')
    ) {
      if (pathLower.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint not found.' });
      }
      return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'), NO_CACHE_SEND_OPTS);
    }
  }

  // If request comes from admin domain (adminmod.oiupoyt.space):
  if (domain === 'admin') {
    // Root should lead straight to admin panel
    if (pathLower === '/' || pathLower === '/admin') {
      return res.sendFile(path.join(__dirname, 'public', 'admin.html'), NO_CACHE_SEND_OPTS);
    }
  }

  next();
});

// Static assets (uploads with sandbox CSP and no execution, public web assets)
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  },
  express.static(config.uploadsDir, { maxAge: '7d' })
);
app.use(express.static(path.join(__dirname, 'public'), {
  index: false, // "/" goes through the alias below so it gets the page headers
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (res.getHeader('Cache-Control')) {
      return; // already set immutable by the ?v= middleware
    }
    // The worker script and manifest must reach browsers fresh or SW updates stall at the edge.
    const base = path.basename(filePath);
    if (filePath.endsWith('.html') || base === 'sw.js' || base === 'manifest.webmanifest') {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else if (filePath.endsWith('.css') || filePath.endsWith('.js') || filePath.endsWith('.svg') || filePath.endsWith('.png') || filePath.endsWith('.ico') || filePath.endsWith('.webmanifest')) {
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    }
  }
}));

// Friendly HTML page aliases
app.get('/', (req, res) => {
  const domain = getDomainContext(req);
  if (domain === 'admin') {
    return sendPublicPage(res, 'admin.html');
  }
  sendPublicPage(res, 'index.html');
});

app.get('/syllabus', (req, res) => {
  sendPublicPage(res, 'syllabus.html');
});

app.get(['/phase-test', '/phase-tests'], (req, res) => {
  sendPublicPage(res, 'phase-test.html');
});

app.get(['/answer-keys', '/answer-key'], (req, res) => {
  sendPublicPage(res, 'answer-keys.html');
});

app.get('/contacts', (req, res) => {
  sendPublicPage(res, 'contacts.html');
});

app.get('/admin', (req, res) => {
  sendPublicPage(res, 'admin.html');
});

app.get('/login', (req, res) => {
  sendPublicPage(res, 'login.html');
});

// API Routes
app.use('/api', publicRouter);
app.use('/api/admin', adminRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  if (req.domain !== 'local') {
    return res.json({ status: 'ok' });
  }
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
    },
  });
});

// 404 Handler
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found.' });
  }
  const domain = getDomainContext(req);
  if (domain === 'admin') {
    return res.redirect('/admin.html');
  }
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'), NO_CACHE_SEND_OPTS);
});

// Error handling middleware
// Client errors (bad JSON, rejected uploads) keep a safe message; anything else is logged, not echoed.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body.' });
  }
  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Request is too large.' });
  }
  if (err.name === 'MulterError' || err.isUploadError) {
    return res.status(400).json({ error: err.message });
  }
  console.error('[server error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(config.port, config.host, () => {
  console.log(`[noticeboard] Server running on http://${config.host}:${config.port}`);
  console.log(`[noticeboard] Database at ${config.dbPath}`);
  console.log(`[noticeboard] Uploads at ${config.uploadsDir}`);
});
