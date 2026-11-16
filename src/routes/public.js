import { Router } from 'express';
import { dbQueries } from '../db.js';
import { config } from '../config.js';
import { clientIp } from '../auth.js';

export const publicRouter = Router();

function serverError(res, message, err) {
  console.error(`[public] ${message}`, err);
  return res.status(500).json({ error: message });
}

// Browser push services. Anything else would make broadcasts POST to an attacker-chosen URL.
const PUSH_SERVICE_SUFFIXES = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];
const MAX_ENDPOINT_LENGTH = 1024;
const KEY_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;

export function isValidPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function isValidKey(value, maxLength) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && KEY_PATTERN.test(value);
}

// Fixed-window limiter for the unauthenticated push endpoints.
const PUSH_WINDOW_MS = 10 * 60 * 1000;
const PUSH_MAX_PER_WINDOW = 20;
const pushHits = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, hit] of pushHits) if (now - hit.start > PUSH_WINDOW_MS) pushHits.delete(ip);
}, PUSH_WINDOW_MS).unref();

function pushRateLimit(req, res, next) {
  const ip = clientIp(req);
  const now = Date.now();
  let hit = pushHits.get(ip);
  if (!hit || now - hit.start > PUSH_WINDOW_MS) {
    hit = { start: now, count: 0 };
    pushHits.set(ip, hit);
  }
  hit.count += 1;
  if (hit.count > PUSH_MAX_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  next();
}

// Feed: list announcements with filtering & search
publicRouter.get('/announcements', (req, res) => {
  try {
    const { category, search, startDate, endDate, limit, offset } = req.query;
    const posts = dbQueries.getAnnouncements({
      category,
      search,
      startDate,
      endDate,
      limit: limit ? Math.min(parseInt(limit, 10), 100) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ announcements: posts });
  } catch (err) {
    serverError(res, 'Failed to fetch announcements.', err);
  }
});

// Single announcement detail
publicRouter.get('/announcements/:id', (req, res) => {
  try {
    const post = dbQueries.getAnnouncementById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }
    res.json({ announcement: post });
  } catch (err) {
    serverError(res, 'Failed to fetch announcement.', err);
  }
});

// Categories list
publicRouter.get('/categories', (req, res) => {
  try {
    const categories = dbQueries.getAllCategories();
    res.json({ categories });
  } catch (err) {
    serverError(res, 'Failed to fetch categories.', err);
  }
});

// Latest Syllabus Post
publicRouter.get('/syllabus/current', (req, res) => {
  try {
    const current = dbQueries.getLatestSyllabus();
    res.json({ syllabus: current || null });
  } catch (err) {
    serverError(res, 'Failed to fetch current syllabus.', err);
  }
});

// Full Syllabus Archive (Collapsible past weeks)
publicRouter.get('/syllabus/archive', (req, res) => {
  try {
    const archive = dbQueries.getSyllabusArchive();
    res.json({ archive });
  } catch (err) {
    serverError(res, 'Failed to fetch syllabus archive.', err);
  }
});

// Phase Tests (Major exams every 2-3 months)
publicRouter.get('/phase-tests', (req, res) => {
  try {
    const tests = dbQueries.getAllPhaseTests();
    res.json({ phaseTests: tests });
  } catch (err) {
    serverError(res, 'Failed to fetch phase tests.', err);
  }
});

publicRouter.get('/phase-tests/current', (req, res) => {
  try {
    const current = dbQueries.getLatestPhaseTest();
    res.json({ phaseTest: current || null });
  } catch (err) {
    serverError(res, 'Failed to fetch current phase test.', err);
  }
});

publicRouter.get('/phase-tests/archive', (req, res) => {
  try {
    const archive = dbQueries.getPhaseTestsArchive();
    res.json({ archive });
  } catch (err) {
    serverError(res, 'Failed to fetch phase tests archive.', err);
  }
});

// Answer Keys
publicRouter.get('/answer-keys', (req, res) => {
  try {
    const { search } = req.query;
    const keys = dbQueries.getActiveAnswerKeys(search);
    res.json({ answerKeys: keys });
  } catch (err) {
    serverError(res, 'Failed to fetch answer keys.', err);
  }
});

publicRouter.get('/answer-keys/archive', (req, res) => {
  try {
    const { search } = req.query;
    const archive = dbQueries.getArchivedAnswerKeys(search);
    res.json({ archive });
  } catch (err) {
    serverError(res, 'Failed to fetch answer keys archive.', err);
  }
});

publicRouter.get('/answer-keys/:id', (req, res) => {
  try {
    const key = dbQueries.getAnswerKeyById(req.params.id);
    if (!key) {
      return res.status(404).json({ error: 'Answer key not found.' });
    }
    res.json({ answerKey: key });
  } catch (err) {
    serverError(res, 'Failed to fetch answer key.', err);
  }
});

// Official contacts directory
publicRouter.get('/contacts', (req, res) => {
  try {
    res.json({ contacts: dbQueries.getContacts() });
  } catch (err) {
    serverError(res, 'Failed to fetch contacts.', err);
  }
});

// Push Notifications Endpoints
publicRouter.get('/push/public-key', (req, res) => {
  res.json({ publicKey: config.vapidPublicKey });
});

publicRouter.post('/push/subscribe', pushRateLimit, (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!isValidPushEndpoint(endpoint) || !keys || !isValidKey(keys.p256dh, 128) || !isValidKey(keys.auth, 64)) {
      return res.status(400).json({ error: 'Invalid push subscription payload.' });
    }
    dbQueries.addPushSubscription({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
    res.status(201).json({ success: true, subscribed: true });
  } catch (err) {
    serverError(res, 'Failed to save push subscription.', err);
  }
});

publicRouter.post('/push/unsubscribe', pushRateLimit, (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (typeof endpoint === 'string' && endpoint.length <= MAX_ENDPOINT_LENGTH) {
      dbQueries.deletePushSubscription(endpoint);
    }
    res.json({ success: true, unsubscribed: true });
  } catch (err) {
    serverError(res, 'Failed to remove subscription.', err);
  }
});

