'use strict';
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Custom card backgrounds -> /public/uploads (extension derived from the verified mimetype, never the filename)
const backgroundUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `bg-${crypto.randomBytes(12).toString('hex')}${IMAGE_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'customBackground'), false);
  },
});

// Bulk guest lists (CSV / XLSX) are parsed in memory and never written to disk
const guestListUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(csv|xlsx)$/i.test(file.originalname);
    return ok ? cb(null, true) : cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'), false);
  },
});

module.exports = { backgroundUpload, guestListUpload, UPLOAD_DIR };
