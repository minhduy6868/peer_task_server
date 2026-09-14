const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { sendError, asyncHandler } = require('../middleware/errorHandler');

function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers['x-admin-secret'] !== secret) {
    return sendError(res, 404, `Route ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND');
  }
  next();
}

router.delete('/clear', requireAdmin, asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM board_operations');
  const count = await pool.query('SELECT COUNT(*) FROM board_operations');

  res.json({
    success: true,
    deleted: result.rowCount,
    remaining: parseInt(count.rows[0].count, 10),
  });
}));

module.exports = router;
