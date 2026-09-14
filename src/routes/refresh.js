const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError('Refresh token required', 401, 'UNAUTHORIZED');
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
  } catch (err) {
    throw new AppError('Invalid or expired refresh token', 401, 'TOKEN_EXPIRED');
  }

  if (decoded.type !== 'refresh') {
    throw new AppError('Invalid token type', 401, 'INVALID_TOKEN');
  }

  const tokenResult = await pool.query(
    'SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW() AND revoked = FALSE',
    [refreshToken]
  );

  if (tokenResult.rows.length === 0) {
    throw new AppError('Invalid or expired refresh token', 401, 'TOKEN_EXPIRED');
  }

  const userResult = await pool.query(
    'SELECT id, email, name FROM users WHERE id = $1',
    [decoded.id]
  );

  if (userResult.rows.length === 0) {
    throw new AppError('User not found', 401, 'USER_NOT_FOUND');
  }

  const user = userResult.rows[0];
  const accessToken = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  res.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    await pool.query(
      'UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1',
      [refreshToken]
    );
  }

  res.json({ message: 'Logged out' });
}));

module.exports = router;
