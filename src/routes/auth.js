const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../services/email_service');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.created_at
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register
router.post('/register',
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('name').optional(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name } = req.body;

    try {
      // Check if user exists
      const userExists = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (userExists.rows.length > 0) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const result = await pool.query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
        [email, passwordHash, name || null]
      );

      const user = result.rows[0];

      // Send welcome email (non-blocking)
      sendWelcomeEmail(user.email, user.name).catch(err => 
        console.error('Welcome email failed:', err)
      );

      // Generate JWT tokens (access + refresh)
      const accessToken = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '15m' } // Short-lived access token
      );

      const refreshToken = jwt.sign(
        { id: user.id, email: user.email, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' } // Long-lived refresh token
      );

      // Store refresh token in DB
      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
        [user.id, refreshToken]
      );

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.created_at
        },
        accessToken,
        refreshToken
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Login
router.post('/login',
  body('email').isEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Find user
      const result = await pool.query(
        'SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate JWT tokens (access + refresh)
      const accessToken = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      const refreshToken = jwt.sign(
        { id: user.id, email: user.email, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Store refresh token in DB
      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
        [user.id, refreshToken]
      );

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.created_at
        },
        accessToken,
        refreshToken
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Forgot password
router.post('/forgot-password',
  body('email').isEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    try {
      // Find user
      const userResult = await pool.query(
        'SELECT id, email, name FROM users WHERE email = $1',
        [email]
      );

      // Always return success to prevent email enumeration
      if (userResult.rows.length === 0) {
        return res.json({ message: 'If email exists, reset link has been sent' });
      }

      const user = userResult.rows[0];

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour

      // Store token
      await pool.query(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [user.id, hashedToken, expiresAt]
      );

      // Send email
      await sendPasswordResetEmail(user.email, resetToken, user.name);

      res.json({ message: 'If email exists, reset link has been sent' });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Reset password
router.post('/reset-password',
  body('token').notEmpty(),
  body('password').isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, password } = req.body;

    try {
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      // Find valid token
      const tokenResult = await pool.query(
        `SELECT user_id FROM password_reset_tokens 
         WHERE token = $1 AND expires_at > NOW() AND used = FALSE`,
        [hashedToken]
      );

      if (tokenResult.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      const userId = tokenResult.rows[0].user_id;

      // Hash new password
      const passwordHash = await bcrypt.hash(password, 10);

      // Update password
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, userId]
      );

      // Mark token as used
      await pool.query(
        'UPDATE password_reset_tokens SET used = TRUE WHERE token = $1',
        [hashedToken]
      );

      res.json({ message: 'Password reset successful' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
