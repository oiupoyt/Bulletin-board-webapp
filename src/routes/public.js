import { Router } from 'express';
import { dbQueries } from '../db.js';
import { config } from '../config.js';

export const publicRouter = Router();

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
    res.status(500).json({ error: 'Failed to fetch announcements.', details: err.message });
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
    res.status(500).json({ error: 'Failed to fetch announcement.', details: err.message });
  }
});

// Categories list
publicRouter.get('/categories', (req, res) => {
  try {
    const categories = dbQueries.getAllCategories();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories.', details: err.message });
  }
});

// Latest Syllabus Post
publicRouter.get('/syllabus/current', (req, res) => {
  try {
    const current = dbQueries.getLatestSyllabus();
    res.json({ syllabus: current || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch current syllabus.', details: err.message });
  }
});

// Full Syllabus Archive (Collapsible past weeks)
publicRouter.get('/syllabus/archive', (req, res) => {
  try {
    const archive = dbQueries.getSyllabusArchive();
    res.json({ archive });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch syllabus archive.', details: err.message });
  }
});

// Phase Tests (Major exams every 2-3 months)
publicRouter.get('/phase-tests', (req, res) => {
  try {
    const tests = dbQueries.getAllPhaseTests();
    res.json({ phaseTests: tests });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch phase tests.', details: err.message });
  }
});

publicRouter.get('/phase-tests/current', (req, res) => {
  try {
    const current = dbQueries.getLatestPhaseTest();
    res.json({ phaseTest: current || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch current phase test.', details: err.message });
  }
});

publicRouter.get('/phase-tests/archive', (req, res) => {
  try {
    const archive = dbQueries.getPhaseTestsArchive();
    res.json({ archive });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch phase tests archive.', details: err.message });
  }
});

// Answer Keys
publicRouter.get('/answer-keys', (req, res) => {
  try {
    const { search } = req.query;
    const keys = dbQueries.getActiveAnswerKeys(search);
    res.json({ answerKeys: keys });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch answer keys.', details: err.message });
  }
});

publicRouter.get('/answer-keys/archive', (req, res) => {
  try {
    const { search } = req.query;
    const archive = dbQueries.getArchivedAnswerKeys(search);
    res.json({ archive });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch answer keys archive.', details: err.message });
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
    res.status(500).json({ error: 'Failed to fetch answer key.', details: err.message });
  }
});

// Push Notifications Endpoints
publicRouter.get('/push/public-key', (req, res) => {
  res.json({ publicKey: config.vapidPublicKey });
});

publicRouter.post('/push/subscribe', (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Invalid push subscription payload.' });
    }
    dbQueries.addPushSubscription({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
    res.status(201).json({ success: true, subscribed: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save push subscription.', details: err.message });
  }
});

publicRouter.post('/push/unsubscribe', (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) {
      dbQueries.deletePushSubscription(endpoint);
    }
    res.json({ success: true, unsubscribed: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove subscription.', details: err.message });
  }
});

