import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { dbQueries } from '../db.js';
import { config } from '../config.js';
import {
  authenticateAdmin,
  createSessionToken,
  requireAdminAuth,
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from '../auth.js';
import { announcementUpload, syllabusUpload, answerKeyUpload } from '../upload.js';
import { broadcastNotification } from '../notifications.js';

export const adminRouter = Router();

// Helper to safely delete an uploaded file without path traversal
function safeUnlink(relativeUrl) {
  if (!relativeUrl || typeof relativeUrl !== 'string') return;
  const filename = path.basename(relativeUrl);
  const fullPath = path.join(config.uploadsDir, filename);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch (e) {
      console.warn('[upload cleanup error]', e.message);
    }
  }
}

// ── Admin Authentication Routes ───────────────────────────────────────────────
adminRouter.post('/login', (req, res) => {
  const clientIp =
    req.headers['cf-connecting-ip'] ||
    req.ip ||
    req.socket.remoteAddress ||
    'unknown';

  // Check rate limit
  const rateLimitStatus = checkLoginRateLimit(clientIp);
  if (!rateLimitStatus.allowed) {
    return res.status(429).json({ error: rateLimitStatus.error });
  }

  const { password } = req.body || {};
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required.' });
  }

  if (authenticateAdmin(password)) {
    recordLoginSuccess(clientIp);
    const token = createSessionToken();
    res.cookie('admin_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.json({ success: true, token });
  }

  recordLoginFailure(clientIp);
  return res.status(401).json({ error: 'Incorrect administrator password.' });
});

adminRouter.post('/logout', (req, res) => {
  res.clearCookie('admin_session');
  res.json({ success: true });
});

adminRouter.get('/check-auth', requireAdminAuth, (req, res) => {
  res.json({ authenticated: true });
});

// ── Announcements Management ──────────────────────────────────────────────────
adminRouter.post(
  '/announcements',
  requireAdminAuth,
  announcementUpload.single('attachment'),
  (req, res) => {
    try {
      const { category, title, body, pinned, author } = req.body;
      if (!title || !body || !category) {
        return res.status(400).json({ error: 'Category, title, and body are required.' });
      }

      let attachment_url = null;
      let attachment_name = null;
      if (req.file) {
        attachment_url = `/uploads/${req.file.filename}`;
        attachment_name = req.file.originalname;
      }

      const post = dbQueries.createAnnouncement({
        category: category.trim(),
        title: title.trim(),
        body: body.trim(),
        attachment_url,
        attachment_name,
        pinned: pinned === 'true' || pinned === '1' || pinned === true,
        author: author ? author.trim() : 'Administration',
      });

      broadcastNotification({
        title: `📢 ${post.title}`,
        body: post.body.slice(0, 120),
        url: '/',
        tag: `announcement-${post.id}`,
      }).catch((e) => console.warn('[push error]', e.message));

      res.status(201).json({ announcement: post });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create announcement.', details: err.message });
    }
  }
);

adminRouter.put(
  '/announcements/:id',
  requireAdminAuth,
  announcementUpload.single('attachment'),
  (req, res) => {
    try {
      const id = req.params.id;
      const current = dbQueries.getAnnouncementById(id);
      if (!current) {
        return res.status(404).json({ error: 'Announcement not found.' });
      }

      const { category, title, body, pinned, author, remove_attachment } = req.body;

      let attachment_url = current.attachment_url;
      let attachment_name = current.attachment_name;

      if (req.file) {
        if (current.attachment_url) safeUnlink(current.attachment_url);
        attachment_url = `/uploads/${req.file.filename}`;
        attachment_name = req.file.originalname;
      } else if (remove_attachment === 'true' || remove_attachment === '1') {
        if (current.attachment_url) safeUnlink(current.attachment_url);
        attachment_url = null;
        attachment_name = null;
      }

      let resolvedPinned = undefined;
      if (pinned !== undefined) {
        resolvedPinned = (pinned === 'true' || pinned === '1' || pinned === true || pinned === 1);
      } else if (title !== undefined || req.is('multipart/form-data')) {
        // In standard browser HTML FormData submissions, unchecked checkboxes are omitted.
        // Therefore, if the announcement form is being updated, an omitted pinned field means false.
        resolvedPinned = false;
      }

      const updated = dbQueries.updateAnnouncement(id, {
        category: category ? category.trim() : undefined,
        title: title ? title.trim() : undefined,
        body: body ? body.trim() : undefined,
        attachment_url,
        attachment_name,
        pinned: resolvedPinned,
        author: author ? author.trim() : undefined,
      });

      res.json({ announcement: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update announcement.', details: err.message });
    }
  }
);

adminRouter.patch('/announcements/:id/pin', requireAdminAuth, (req, res) => {
  try {
    const id = req.params.id;
    const current = dbQueries.getAnnouncementById(id);
    if (!current) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }

    const { pinned } = req.body;
    const newPinned = pinned !== undefined
      ? (pinned === true || pinned === 'true' || pinned === 1 || pinned === '1' ? 1 : 0)
      : (current.pinned ? 0 : 1);

    const updated = dbQueries.updateAnnouncement(id, { pinned: newPinned });
    res.json({
      announcement: updated,
      message: newPinned ? 'Announcement pinned to top.' : 'Announcement unpinned.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update pin status.', details: err.message });
  }
});

adminRouter.delete('/announcements/:id', requireAdminAuth, (req, res) => {
  try {
    const post = dbQueries.deleteAnnouncement(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }

    if (post.attachment_url) {
      safeUnlink(post.attachment_url);
    }

    res.json({ success: true, deleted: post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete announcement.', details: err.message });
  }
});

// ── Weekly Syllabus Management ────────────────────────────────────────────────
adminRouter.post(
  '/syllabus',
  requireAdminAuth,
  syllabusUpload.single('image'),
  (req, res) => {
    try {
      const { week_label } = req.body;
      if (!week_label || !week_label.trim()) {
        return res.status(400).json({ error: 'Week label / date is required (e.g. Week 4 - Oct 2026).' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Syllabus image file is required.' });
      }

      const image_url = `/uploads/${req.file.filename}`;
      const post = dbQueries.createSyllabusPost({
        week_label: week_label.trim(),
        image_url,
      });

      broadcastNotification({
        title: '📅 Weekly Exam Syllabus Published',
        body: post.week_label,
        url: '/syllabus',
        tag: `syllabus-${post.id}`,
      }).catch((e) => console.warn('[push error]', e.message));

      res.status(201).json({ syllabus: post });
    } catch (err) {
      res.status(500).json({ error: 'Failed to upload syllabus.', details: err.message });
    }
  }
);

adminRouter.get('/syllabus', requireAdminAuth, (req, res) => {
  try {
    const list = dbQueries.getAllSyllabusPosts();
    res.json({ syllabusList: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch syllabus list.', details: err.message });
  }
});

adminRouter.patch('/syllabus/:id/archive', requireAdminAuth, (req, res) => {
  try {
    const id = req.params.id;
    const post = dbQueries.getSyllabusById(id);
    if (!post) {
      return res.status(404).json({ error: 'Syllabus post not found.' });
    }
    const targetArchived = req.body.is_archived !== undefined ? (req.body.is_archived ? 1 : 0) : (post.is_archived ? 0 : 1);
    const updated = dbQueries.setSyllabusArchived(id, targetArchived);
    res.json({ success: true, syllabus: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update syllabus archive status.', details: err.message });
  }
});

adminRouter.delete('/syllabus/:id', requireAdminAuth, (req, res) => {
  try {
    const post = dbQueries.deleteSyllabusPost(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Syllabus post not found.' });
    }

    if (post.image_url) {
      safeUnlink(post.image_url);
    }

    res.json({ success: true, deleted: post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete syllabus post.', details: err.message });
  }
});

// ── Phase Test Management (Major Exams Every 2-3 Months) ──────────────────────
adminRouter.get('/phase-tests', requireAdminAuth, (req, res) => {
  try {
    const list = dbQueries.getAllPhaseTests();
    res.json({ phaseTests: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch phase tests.', details: err.message });
  }
});

adminRouter.patch('/phase-tests/:id/archive', requireAdminAuth, (req, res) => {
  try {
    const id = req.params.id;
    const post = dbQueries.getPhaseTestById(id);
    if (!post) {
      return res.status(404).json({ error: 'Phase test not found.' });
    }
    const targetArchived = req.body.is_archived !== undefined ? (req.body.is_archived ? 1 : 0) : (post.is_archived ? 0 : 1);
    const updated = dbQueries.setPhaseTestArchived(id, targetArchived);
    res.json({ success: true, phaseTest: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update phase test archive status.', details: err.message });
  }
});

adminRouter.post(
  '/phase-tests',
  requireAdminAuth,
  announcementUpload.single('attachment'),
  (req, res) => {
    try {
      const { title, phase_label, description, exam_date } = req.body;
      if (!title || !phase_label) {
        return res.status(400).json({ error: 'Title and Phase label are required.' });
      }

      let attachment_url = null;
      let attachment_name = null;
      if (req.file) {
        attachment_url = `/uploads/${req.file.filename}`;
        attachment_name = req.file.originalname;
      }

      const post = dbQueries.createPhaseTest({
        title: title.trim(),
        phase_label: phase_label.trim(),
        description: description ? description.trim() : '',
        attachment_url,
        attachment_name,
        exam_date: exam_date ? exam_date.trim() : null,
      });

      broadcastNotification({
        title: `🎯 Phase Test: ${post.title}`,
        body: `${post.phase_label}${post.exam_date ? ' • ' + post.exam_date : ''}`,
        url: '/phase-test',
        tag: `phase-${post.id}`,
      }).catch((e) => console.warn('[push error]', e.message));

      res.status(201).json({ phaseTest: post });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create phase test post.', details: err.message });
    }
  }
);

adminRouter.delete('/phase-tests/:id', requireAdminAuth, (req, res) => {
  try {
    const post = dbQueries.deletePhaseTest(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Phase test not found.' });
    }

    if (post.attachment_url) {
      safeUnlink(post.attachment_url);
    }

    res.json({ success: true, deleted: post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete phase test post.', details: err.message });
  }
});

// ── Answer Keys Management ────────────────────────────────────────────────────
adminRouter.get('/answer-keys', requireAdminAuth, (req, res) => {
  try {
    const list = dbQueries.getAllAnswerKeys();
    res.json({ answerKeys: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch answer keys.', details: err.message });
  }
});

adminRouter.post('/answer-keys', requireAdminAuth, answerKeyUpload, (req, res) => {
  try {
    const { title, test_date, subject, description } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Test title is required.' });
    }

    const files = req.files || {};
    const setAFile = files['set_a']?.[0];
    const setBFile = files['set_b']?.[0];
    const setCFile = files['set_c']?.[0];
    const setDFile = files['set_d']?.[0];

    if (!setAFile && !setBFile && !setCFile && !setDFile) {
      return res.status(400).json({ error: 'Please upload at least one answer key file (Set A or Set B).' });
    }

    const set_a_url = setAFile ? `/uploads/${setAFile.filename}` : null;
    const set_a_name = setAFile ? setAFile.originalname : null;

    const set_b_url = setBFile ? `/uploads/${setBFile.filename}` : null;
    const set_b_name = setBFile ? setBFile.originalname : null;

    const set_c_url = setCFile ? `/uploads/${setCFile.filename}` : null;
    const set_c_name = setCFile ? setCFile.originalname : null;

    const set_d_url = setDFile ? `/uploads/${setDFile.filename}` : null;
    const set_d_name = setDFile ? setDFile.originalname : null;

    const post = dbQueries.createAnswerKey({
      title: title.trim(),
      test_date: test_date ? test_date.trim() : null,
      subject: subject ? subject.trim() : null,
      description: description ? description.trim() : '',
      set_a_url,
      set_a_name,
      set_b_url,
      set_b_name,
      set_c_url,
      set_c_name,
      set_d_url,
      set_d_name,
    });

    broadcastNotification({
      title: `🔑 Answer Keys Released: ${post.title}`,
      body: `${post.subject ? post.subject + ' • ' : ''}${post.test_date ? post.test_date : 'Sets Available'}`,
      url: '/answer-keys',
      tag: `answer-keys-${post.id}`,
    }).catch((e) => console.warn('[push error]', e.message));

    res.status(201).json({ answerKey: post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create answer key post.', details: err.message });
  }
});

adminRouter.patch('/answer-keys/:id/archive', requireAdminAuth, (req, res) => {
  try {
    const id = req.params.id;
    const post = dbQueries.getAnswerKeyById(id);
    if (!post) {
      return res.status(404).json({ error: 'Answer key not found.' });
    }
    const targetArchived = req.body.is_archived !== undefined ? (req.body.is_archived ? 1 : 0) : (post.is_archived ? 0 : 1);
    const updated = dbQueries.setAnswerKeyArchived(id, targetArchived);
    res.json({ success: true, answerKey: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update answer key archive status.', details: err.message });
  }
});

adminRouter.delete('/answer-keys/:id', requireAdminAuth, (req, res) => {
  try {
    const post = dbQueries.deleteAnswerKey(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Answer key not found.' });
    }

    if (post.set_a_url) safeUnlink(post.set_a_url);
    if (post.set_b_url) safeUnlink(post.set_b_url);
    if (post.set_c_url) safeUnlink(post.set_c_url);
    if (post.set_d_url) safeUnlink(post.set_d_url);

    res.json({ success: true, deleted: post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete answer key.', details: err.message });
  }
});

// ── Categories Management ─────────────────────────────────────────────────────
adminRouter.post('/categories', requireAdminAuth, (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required.' });
    }
    const cat = dbQueries.createCategory(name);
    res.status(201).json({ category: cat });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Category with this name already exists.' });
    }
    res.status(500).json({ error: 'Failed to create category.', details: err.message });
  }
});

adminRouter.delete('/categories/:id', requireAdminAuth, (req, res) => {
  try {
    const cat = dbQueries.deleteCategory(req.params.id);
    if (!cat) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    res.json({ success: true, deleted: cat });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category.', details: err.message });
  }
});
