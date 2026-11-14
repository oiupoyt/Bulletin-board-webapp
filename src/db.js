import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

// Ensure data directory exists
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new DatabaseSync(config.dbPath);

// Enable WAL mode for high concurrency and performance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    attachment_url TEXT,
    attachment_name TEXT,
    pinned INTEGER DEFAULT 0,
    author TEXT DEFAULT 'Administration',
    posted_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS syllabus_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_label TEXT NOT NULL,
    image_url TEXT NOT NULL,
    is_archived INTEGER DEFAULT 0,
    posted_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS phase_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    phase_label TEXT NOT NULL,
    description TEXT,
    attachment_url TEXT,
    attachment_name TEXT,
    exam_date TEXT,
    is_archived INTEGER DEFAULT 0,
    posted_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS answer_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    test_date TEXT,
    subject TEXT,
    description TEXT,
    set_a_url TEXT,
    set_a_name TEXT,
    set_b_url TEXT,
    set_b_name TEXT,
    set_c_url TEXT,
    set_c_name TEXT,
    set_d_url TEXT,
    set_d_name TEXT,
    is_archived INTEGER DEFAULT 0,
    posted_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_announcements_pinned_date ON announcements(pinned DESC, posted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_announcements_category ON announcements(category);
  CREATE INDEX IF NOT EXISTS idx_syllabus_posted_at ON syllabus_posts(posted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_phase_tests_posted_at ON phase_tests(posted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_answer_keys_posted_at ON answer_keys(posted_at DESC);
`);

// Safe migrations for is_archived columns on existing databases
try {
  db.exec('ALTER TABLE syllabus_posts ADD COLUMN is_archived INTEGER DEFAULT 0;');
} catch (e) {
  // column already exists
}
try {
  db.exec('ALTER TABLE phase_tests ADD COLUMN is_archived INTEGER DEFAULT 0;');
} catch (e) {
  // column already exists
}

// Populate default categories if empty
const countStmt = db.prepare('SELECT COUNT(*) as count FROM categories');
const categoryCount = countStmt.get().count;

if (categoryCount === 0) {
  const insertCat = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
  const defaultCategories = [
    { name: 'General', slug: 'general' },
    { name: 'Academic Related', slug: 'academic-related' },
    { name: 'Exam', slug: 'exam' },
    { name: 'Holiday', slug: 'holiday' },
  ];
  for (const cat of defaultCategories) {
    insertCat.run(cat.name, cat.slug);
  }
}

// Database helper functions
export const dbQueries = {
  // Announcements
  getAnnouncements({ category, search, startDate, endDate, limit = 50, offset = 0 } = {}) {
    let sql = 'SELECT * FROM announcements WHERE 1=1';
    const params = [];

    if (category && category !== 'All') {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      sql += ' AND (title LIKE ? OR body LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (startDate) {
      sql += ' AND posted_at >= ?';
      params.push(`${startDate} 00:00:00`);
    }

    if (endDate) {
      sql += ' AND posted_at <= ?';
      params.push(`${endDate} 23:59:59`);
    }

    // Always prioritize pinned posts first, then newest posted_at
    sql += ' ORDER BY pinned DESC, posted_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(sql).all(...params);
  },

  getAnnouncementById(id) {
    return db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  },

  createAnnouncement({ category, title, body, attachment_url, attachment_name, pinned = 0, author = 'Administration' }) {
    const stmt = db.prepare(`
      INSERT INTO announcements (category, title, body, attachment_url, attachment_name, pinned, author, posted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `);
    const info = stmt.run(category, title, body, attachment_url || null, attachment_name || null, pinned ? 1 : 0, author);
    return this.getAnnouncementById(info.lastInsertRowid);
  },

  updateAnnouncement(id, { category, title, body, attachment_url, attachment_name, pinned, author }) {
    const current = this.getAnnouncementById(id);
    if (!current) return null;

    const newCategory = category !== undefined ? category : current.category;
    const newTitle = title !== undefined ? title : current.title;
    const newBody = body !== undefined ? body : current.body;
    const newAttachmentUrl = attachment_url !== undefined ? attachment_url : current.attachment_url;
    const newAttachmentName = attachment_name !== undefined ? attachment_name : current.attachment_name;
    const newPinned = pinned !== undefined ? (pinned ? 1 : 0) : current.pinned;
    const newAuthor = author !== undefined ? author : current.author;

    db.prepare(`
      UPDATE announcements
      SET category = ?, title = ?, body = ?, attachment_url = ?, attachment_name = ?, pinned = ?, author = ?
      WHERE id = ?
    `).run(newCategory, newTitle, newBody, newAttachmentUrl, newAttachmentName, newPinned, newAuthor, id);

    return this.getAnnouncementById(id);
  },

  deleteAnnouncement(id) {
    const post = this.getAnnouncementById(id);
    if (post) {
      db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
    }
    return post;
  },

  // Weekly Syllabus
  getLatestSyllabus() {
    return db.prepare('SELECT * FROM syllabus_posts WHERE is_archived = 0 ORDER BY posted_at DESC, id DESC LIMIT 1').get();
  },

  getAllSyllabusPosts() {
    return db.prepare('SELECT * FROM syllabus_posts ORDER BY posted_at DESC, id DESC').all();
  },

  getSyllabusArchive() {
    const active = this.getLatestSyllabus();
    if (active) {
      return db.prepare('SELECT * FROM syllabus_posts WHERE id != ? ORDER BY posted_at DESC, id DESC').all(active.id);
    }
    return db.prepare('SELECT * FROM syllabus_posts ORDER BY posted_at DESC, id DESC').all();
  },

  getSyllabusById(id) {
    return db.prepare('SELECT * FROM syllabus_posts WHERE id = ?').get(id);
  },

  setSyllabusArchived(id, is_archived = 1) {
    db.prepare('UPDATE syllabus_posts SET is_archived = ? WHERE id = ?').run(is_archived ? 1 : 0, id);
    return this.getSyllabusById(id);
  },

  createSyllabusPost({ week_label, image_url }) {
    const stmt = db.prepare(`
      INSERT INTO syllabus_posts (week_label, image_url, is_archived, posted_at)
      VALUES (?, ?, 0, datetime('now', 'localtime'))
    `);
    const info = stmt.run(week_label, image_url);
    return this.getSyllabusById(info.lastInsertRowid);
  },

  deleteSyllabusPost(id) {
    const post = this.getSyllabusById(id);
    if (post) {
      db.prepare('DELETE FROM syllabus_posts WHERE id = ?').run(id);
    }
    return post;
  },

  // Phase Tests (Major exams every 2-3 months)
  getAllPhaseTests() {
    return db.prepare('SELECT * FROM phase_tests ORDER BY posted_at DESC, id DESC').all();
  },

  getLatestPhaseTest() {
    return db.prepare('SELECT * FROM phase_tests WHERE is_archived = 0 ORDER BY posted_at DESC, id DESC LIMIT 1').get();
  },

  getPhaseTestsArchive() {
    const active = this.getLatestPhaseTest();
    if (active) {
      return db.prepare('SELECT * FROM phase_tests WHERE id != ? ORDER BY posted_at DESC, id DESC').all(active.id);
    }
    return db.prepare('SELECT * FROM phase_tests ORDER BY posted_at DESC, id DESC').all();
  },

  getPhaseTestById(id) {
    return db.prepare('SELECT * FROM phase_tests WHERE id = ?').get(id);
  },

  setPhaseTestArchived(id, is_archived = 1) {
    db.prepare('UPDATE phase_tests SET is_archived = ? WHERE id = ?').run(is_archived ? 1 : 0, id);
    return this.getPhaseTestById(id);
  },

  createPhaseTest({ title, phase_label, description, attachment_url, attachment_name, exam_date }) {
    const stmt = db.prepare(`
      INSERT INTO phase_tests (title, phase_label, description, attachment_url, attachment_name, exam_date, is_archived, posted_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now', 'localtime'))
    `);
    const info = stmt.run(
      title,
      phase_label,
      description || '',
      attachment_url || null,
      attachment_name || null,
      exam_date || null
    );
    return this.getPhaseTestById(info.lastInsertRowid);
  },

  deletePhaseTest(id) {
    const post = this.getPhaseTestById(id);
    if (post) {
      db.prepare('DELETE FROM phase_tests WHERE id = ?').run(id);
    }
    return post;
  },

  // Answer Keys
  getAllAnswerKeys({ search, isArchived } = {}) {
    let sql = 'SELECT * FROM answer_keys WHERE 1=1';
    const params = [];
    if (isArchived !== undefined) {
      sql += ' AND is_archived = ?';
      params.push(isArchived ? 1 : 0);
    }
    if (search) {
      sql += ' AND (title LIKE ? OR subject LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY posted_at DESC, id DESC';
    return db.prepare(sql).all(...params);
  },

  getActiveAnswerKeys(search) {
    return this.getAllAnswerKeys({ search, isArchived: 0 });
  },

  getArchivedAnswerKeys(search) {
    return this.getAllAnswerKeys({ search, isArchived: 1 });
  },

  getAnswerKeyById(id) {
    return db.prepare('SELECT * FROM answer_keys WHERE id = ?').get(id);
  },

  createAnswerKey({
    title,
    test_date,
    subject,
    description,
    set_a_url,
    set_a_name,
    set_b_url,
    set_b_name,
    set_c_url,
    set_c_name,
    set_d_url,
    set_d_name,
  }) {
    const stmt = db.prepare(`
      INSERT INTO answer_keys (
        title, test_date, subject, description,
        set_a_url, set_a_name, set_b_url, set_b_name,
        set_c_url, set_c_name, set_d_url, set_d_name,
        is_archived, posted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now', 'localtime'))
    `);
    const info = stmt.run(
      title,
      test_date || null,
      subject || null,
      description || '',
      set_a_url || null,
      set_a_name || null,
      set_b_url || null,
      set_b_name || null,
      set_c_url || null,
      set_c_name || null,
      set_d_url || null,
      set_d_name || null
    );
    return this.getAnswerKeyById(info.lastInsertRowid);
  },

  setAnswerKeyArchived(id, is_archived = 1) {
    db.prepare('UPDATE answer_keys SET is_archived = ? WHERE id = ?').run(is_archived ? 1 : 0, id);
    return this.getAnswerKeyById(id);
  },

  deleteAnswerKey(id) {
    const key = this.getAnswerKeyById(id);
    if (key) {
      db.prepare('DELETE FROM answer_keys WHERE id = ?').run(id);
    }
    return key;
  },

  // Categories
  getAllCategories() {
    return db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  },

  createCategory(name) {
    const trimmed = name.trim();
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const stmt = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
    stmt.run(trimmed, slug);
    return db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  },

  deleteCategory(id) {
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (cat) {
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    }
    return cat;
  },

  // Push Notifications Subscriptions
  addPushSubscription({ endpoint, p256dh, auth }) {
    const stmt = db.prepare(`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth)
      VALUES (?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
    `);
    stmt.run(endpoint, p256dh, auth);
  },

  deletePushSubscription(endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  },

  getAllPushSubscriptions() {
    return db.prepare('SELECT * FROM push_subscriptions').all();
  },
};

