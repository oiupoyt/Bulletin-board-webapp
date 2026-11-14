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
app.enable('trust proxy');

// Global Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser helper (zero external dependency)
app.use((req, res, next) => {
  req.cookies = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach((c) => {
      const [k, ...v] = c.trim().split('=');
      if (k) req.cookies[k] = decodeURIComponent(v.join('='));
    });
  }
  next();
});

// Domain identification helper
const NO_CACHE_SEND_OPTS = { headers: { 'Cache-Control': 'no-cache, must-revalidate' } };
function sendPublicPage(res, file) {
  res.sendFile(path.join(__dirname, 'public', file), NO_CACHE_SEND_OPTS);
}
function getDomainContext(req) {
  const rawHost = (req.headers['x-forwarded-host'] || req.headers.host || req.hostname || '').toLowerCase();
  const host = rawHost.split(':')[0];

  if (host === 'adminmod.oiupoyt.space' || host.startsWith('adminmod.')) {
    return 'admin';
  }
  if (
    host === 'mod.oiupoyt.space' ||
    host === 'modinfo.oiupoyt.space' ||
    host.startsWith('mod.') ||
    host.startsWith('modinfo.') ||
    host.startsWith('modtest.')
  ) {
    return 'public';
  }
  return 'local'; // localhost, 127.0.0.1, direct IP for development
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
  const rawHost = (req.headers['x-forwarded-host'] || req.headers.host || req.hostname || '').toLowerCase();
  const host = rawHost.split(':')[0];

  // If accessed via old modtest subdomain, 301 redirect to main mod.oiupoyt.space
  if (host === 'modtest.oiupoyt.space' || host.startsWith('modtest.')) {
    return res.redirect(301, `https://mod.oiupoyt.space${req.originalUrl || '/'}`);
  }

  const domain = getDomainContext(req);
  const pathLower = req.path.toLowerCase();

  // If request comes from the public website (mod.oiupoyt.space or modinfo.oiupoyt.space):
  // Completely block and hide the admin panel and admin API
  if (domain === 'public') {
    if (
      pathLower === '/admin' ||
      pathLower === '/admin.html' ||
      pathLower === '/login' ||
      pathLower === '/login.html' ||
      pathLower.startsWith('/api/admin') ||
      pathLower.endsWith('/admin.js')
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
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (res.getHeader('Cache-Control')) {
      return; // already set immutable by the ?v= middleware
    }
    if (filePath.endsWith('.html')) {
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
app.use((err, req, res, next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[noticeboard] Server running on http://0.0.0.0:${config.port}`);
  console.log(`[noticeboard] Database at ${config.dbPath}`);
  console.log(`[noticeboard] Uploads at ${config.uploadsDir}`);
});
