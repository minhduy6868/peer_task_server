const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticateToken);

const FOLDERS = new Set(['avatars', 'task-attachments']);

// Signs a direct browser/app upload so the Cloudinary API secret never leaves the server.
router.post('/signature', asyncHandler(async (req, res) => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new AppError('Uploads are not configured', 503, 'UPLOADS_DISABLED');
  }

  const folder = req.body?.folder ?? 'task-attachments';
  if (!FOLDERS.has(folder)) {
    throw new AppError('Invalid upload folder', 400, 'VALIDATION_ERROR');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const fullFolder = `peertask/${folder}`;
  const signature = crypto
    .createHash('sha1')
    .update(`folder=${fullFolder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`)
    .digest('hex');

  res.json({
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    folder: fullFolder,
    timestamp,
    signature,
  });
}));

module.exports = router;
