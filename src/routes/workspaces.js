const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const crypto = require('crypto');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Create workspace
router.post('/',
  body('name').notEmpty().withMessage('Workspace name is required'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
    }

    const { name } = req.body;
    const userId = req.user.id;

    await pool.query('BEGIN');

    try {
      // Create workspace
      const workspaceResult = await pool.query(
        'INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING *',
        [name, userId]
      );

      const workspace = workspaceResult.rows[0];

      // Add owner as member
      await pool.query(
        'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
        [workspace.id, userId, 'owner']
      );

      await pool.query('COMMIT');

      res.status(201).json(workspace);
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  })
);

// Get user's workspaces
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await pool.query(
    `SELECT w.*, wm.role 
     FROM workspaces w
     JOIN workspace_members wm ON w.id = wm.workspace_id
     WHERE wm.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId]
  );

  res.json(result.rows);
}));

// Invite user to workspace by email (owner only)
router.post('/:id/invite',
  body('email').isEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const workspaceId = req.params.id;
    const { email } = req.body;
    const userId = req.user.id;

    try {
      // Check if requester is owner
      const ownerCheck = await pool.query(
        'SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2',
        [workspaceId, userId]
      );

      if (ownerCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Only workspace owner can invite members' });
      }

      // Find user by email
      const userResult = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const invitedUserId = userResult.rows[0].id;

      // Add to workspace
      await pool.query(
        'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [workspaceId, invitedUserId, 'viewer']
      );

      res.json({ message: 'User invited successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Generate invite link for workspace (owner only)
router.post('/:id/invite-link', async (req, res) => {
  const workspaceId = req.params.id;
  const userId = req.user.id;
  const { expiresIn, maxUses } = req.body; // expiresIn in hours, maxUses optional

  try {
    // Check if requester is owner
    const ownerCheck = await pool.query(
      'SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2',
      [workspaceId, userId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only workspace owner can create invite links' });
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Calculate expiration
    let expiresAt = null;
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1000);
    }

    // Insert invite token
    const result = await pool.query(
      `INSERT INTO workspace_invites (workspace_id, token, created_by, expires_at, max_uses)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [workspaceId, token, userId, expiresAt, maxUses || null]
    );

    const invite = result.rows[0];

    res.json({
      inviteId: invite.id,
      token: invite.token,
      inviteLink: invite.token,
      expiresAt: invite.expires_at,
      maxUses: invite.max_uses
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all invite links for workspace
router.get('/:id/invite-links', async (req, res) => {
  const workspaceId = req.params.id;
  const userId = req.user.id;

  try {
    // Check if requester is member
    const memberCheck = await pool.query(
      'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const result = await pool.query(
      `SELECT id, token, created_by, expires_at, max_uses, use_count, created_at
       FROM workspace_invites
       WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [workspaceId]
    );

    const invites = result.rows.map(invite => ({
      ...invite,
      inviteLink: invite.token,
      isExpired: invite.expires_at && new Date(invite.expires_at) < new Date(),
      isMaxedOut: invite.max_uses && invite.use_count >= invite.max_uses
    }));

    res.json(invites);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Validate invite token
router.get('/invite/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const result = await pool.query(
      `SELECT i.*, w.name as workspace_name, w.id as workspace_id
       FROM workspace_invites i
       JOIN workspaces w ON i.workspace_id = w.id
       WHERE i.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid invite link' });
    }

    const invite = result.rows[0];

    // Check if expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Invite link has expired' });
    }

    // Check if max uses reached
    if (invite.max_uses && invite.use_count >= invite.max_uses) {
      return res.status(410).json({ error: 'Invite link has reached maximum uses' });
    }

    res.json({
      workspaceId: invite.workspace_id,
      workspaceName: invite.workspace_name,
      expiresAt: invite.expires_at,
      usesRemaining: invite.max_uses ? invite.max_uses - invite.use_count : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Join workspace via invite link
router.post('/join/:token', authenticateToken, async (req, res) => {
  const { token } = req.params;
  const userId = req.user.id;

  try {
    await pool.query('BEGIN');

    const result = await pool.query(
      `SELECT i.*, w.name as workspace_name
       FROM workspace_invites i
       JOIN workspaces w ON i.workspace_id = w.id
       WHERE i.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Invalid invite link' });
    }

    const invite = result.rows[0];

    // Check if expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      await pool.query('ROLLBACK');
      return res.status(410).json({ error: 'Invite link has expired' });
    }

    // Check if max uses reached
    if (invite.max_uses && invite.use_count >= invite.max_uses) {
      await pool.query('ROLLBACK');
      return res.status(410).json({ error: 'Invite link has reached maximum uses' });
    }

    // Add user to workspace with viewer role by default
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'viewer')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [invite.workspace_id, userId]
    );

    // Increment use count
    await pool.query(
      'UPDATE workspace_invites SET use_count = use_count + 1 WHERE id = $1',
      [invite.id]
    );

    await pool.query('COMMIT');

    res.json({
      message: 'Successfully joined workspace',
      workspaceId: invite.workspace_id,
      workspaceName: invite.workspace_name
    });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete invite link (owner only)
router.delete('/:id/invite-links/:inviteId', async (req, res) => {
  const { id: workspaceId, inviteId } = req.params;
  const userId = req.user.id;

  try {
    // Check if requester is owner
    const ownerCheck = await pool.query(
      'SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2',
      [workspaceId, userId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only workspace owner can delete invite links' });
    }

    await pool.query(
      'DELETE FROM workspace_invites WHERE id = $1 AND workspace_id = $2',
      [inviteId, workspaceId]
    );

    res.json({ message: 'Invite link deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update workspace (owner only)
router.put('/:id',
  body('name').optional().notEmpty(),
  async (req, res) => {
    const workspaceId = req.params.id;
    const userId = req.user.id;
    const { name } = req.body;

    try {
      // Check if user is owner
      const ownerCheck = await pool.query(
        'SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2',
        [workspaceId, userId]
      );

      if (ownerCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Only workspace owner can update workspace' });
      }

      // Update workspace
      const result = await pool.query(
        'UPDATE workspaces SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [name, workspaceId]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Delete workspace (owner only)
router.delete('/:id', async (req, res) => {
  const workspaceId = req.params.id;
  const userId = req.user.id;

  try {
    // Check if user is owner
    const ownerCheck = await pool.query(
      'SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2',
      [workspaceId, userId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only workspace owner can delete' });
    }

    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    res.json({ message: 'Workspace deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get workspace details
router.get('/:id', async (req, res) => {
  const workspaceId = req.params.id;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT w.*, wm.role 
       FROM workspaces w
       JOIN workspace_members wm ON w.id = wm.workspace_id
       WHERE w.id = $1 AND wm.user_id = $2`,
      [workspaceId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
