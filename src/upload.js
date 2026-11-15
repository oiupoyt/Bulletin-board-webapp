import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from './config.js';

// Ensure uploads directory exists
if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

// Rejections raised by the file filters are safe to show to the admin as-is.
function uploadError(message) {
  const err = new Error(message);
  err.isUploadError = true;
  return err;
}

// Disk storage engine with unique names
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const randomHex = crypto.randomBytes(6).toString('hex');
    const filename = `${Date.now()}-${randomHex}-${cleanBase}${ext}`;
    cb(null, filename);
  },
});

// File filter for announcements: images, PDFs, docs
const ALLOWED_ANNOUNCEMENT_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.pdf',
  '.txt',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
]);

const ALLOWED_ANNOUNCEMENT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const announcementUpload = multer({
  storage,
  limits: {
    fileSize: config.maxUploadMB * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_ANNOUNCEMENT_EXTENSIONS.has(ext)) {
      return cb(uploadError('Invalid file extension. Only standard images, PDFs, and documents are permitted.'));
    }
    if (!ALLOWED_ANNOUNCEMENT_MIMES.has(file.mimetype)) {
      return cb(uploadError('Unsupported file MIME type. Only standard images, PDFs, and documents are permitted.'));
    }
    cb(null, true);
  },
});

// File filter for syllabus (bitmap images only)
const ALLOWED_SYLLABUS_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_SYLLABUS_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const syllabusUpload = multer({
  storage,
  limits: {
    fileSize: config.maxUploadMB * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_SYLLABUS_EXTENSIONS.has(ext)) {
      return cb(uploadError('Syllabus image must be a JPG, PNG, or WebP file.'));
    }
    if (!ALLOWED_SYLLABUS_MIMES.has(file.mimetype)) {
      return cb(uploadError('Syllabus file must be an image (JPEG, PNG, WebP).'));
    }
    cb(null, true);
  },
});

export const answerKeyUpload = multer({
  storage,
  limits: {
    fileSize: config.maxUploadMB * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_ANNOUNCEMENT_EXTENSIONS.has(ext)) {
      return cb(uploadError('Invalid file extension for answer key. Only PDFs, images, and documents are permitted.'));
    }
    if (!ALLOWED_ANNOUNCEMENT_MIMES.has(file.mimetype)) {
      return cb(uploadError('Unsupported file MIME type for answer key.'));
    }
    cb(null, true);
  },
}).fields([
  { name: 'set_a', maxCount: 1 },
  { name: 'set_b', maxCount: 1 },
  { name: 'set_c', maxCount: 1 },
  { name: 'set_d', maxCount: 1 },
]);
