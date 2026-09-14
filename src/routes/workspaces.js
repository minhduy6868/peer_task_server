const express = require('express');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { requireWorkspaceOwner, requireWorkspaceMember } = require('../middleware/permissions');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticateToken);

function assertValid(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
  }
}

function invitePayload(invite) {
  return {
    ...invite,
    inviteLink: invite.token,
    isExpired: invite.expires_at && new Date(invite.expires_at) < new Date(),
    isMaxedOut: invite.max_uses && invite.use_count >= invite.max_uses,
  };
}

async function loadInvite(token) {
  const result = await pool.query(
    `SELECT i.*, w.name as workspace_name, w.id as workspace_id
     FROM workspace_invites i
     JOIN workspaces w ON i.workspace_id = w.id
     WHERE i.token = $1`,
    [token]
  );
  if (result.rows.length === 0) {
    throw new AppError('Invalid invite link', 404, 'NOT_FOUND');
  }
  const invite = result.rows[0];
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new AppError('Invite link has expired', 410, 'INVITE_EXPIRED');
  }
  if (invite.max_uses && invite.use_count >= invite.max_uses) {
    throw new AppError('Invite link has reached maximum uses', 410, 'INVITE_MAXED');
  }
  return invite;
}

router.post('/',
  body('name').notEmpty().withMessage('Workspace name is required'),
  asyncHandler(async (req, res) => {
    assertValid(req);
    const { name } = req.body;
    const userId = req.user.id;

    await pool.query('BEGIN');
    try {
      const workspaceResult = await pool.query(
        'INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING *',
        [name, userId]
      );
      const workspace = workspaceResult.rows[0];
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

router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT w.*, wm.role
     FROM workspaces w
     JOIN workspace_members wm ON w.id = wm.workspace_id
     WHERE wm.user_id = $1
     ORDER BY w.created_at DESC`,
    [req.user.id]
  );
  res.json(result.rows);
}));

router.post('/:id/invite',
  requireWorkspaceOwner,
  body('email').isEmail(),
  asyncHandler(async (req, res) => {
    assertValid(req);

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [req.body.email]);
    if (userResult.rows.length === 0) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    await pool.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [req.params.id, userResult.rows[0].id, 'viewer']
    );
    res.json({ message: 'User invited successfully' });
  })
);

router.post('/:id/invite-link', requireWorkspaceOwner, asyncHandler(async (req, res) => {
  const { expiresIn, maxUses, expiresAt } = req.body;
  const token = crypto.randomBytes(32).toString('hex');

  let expires = null;
  if (expiresAt) {
    expires = new Date(expiresAt);
  } else if (expiresIn) {
    expires = new Date(Date.now() + expiresIn * 60 * 60 * 1000);
  }

  const result = await pool.query(
    `INSERT INTO workspace_invites (workspace_id, token, created_by, expires_at, max_uses)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [req.params.id, token, req.user.id, expires, maxUses || null]
  );
  const invite = result.rows[0];

  res.json({
    inviteId: invite.id,
    token: invite.token,
    inviteLink: invite.token,
    expiresAt: invite.expires_at,
    maxUses: invite.max_uses,
  });
}));

router.get('/:id/invite-links', requireWorkspaceMember, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, token, created_by, expires_at, max_uses, use_count, created_at
     FROM workspace_invites
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [req.params.id]
  );
  res.json(result.rows.map(invitePayload));
}));

router.get('/invite/:token', asyncHandler(async (req, res) => {
  const invite = await loadInvite(req.params.token);
  res.json({
    workspaceId: invite.workspace_id,
    workspaceName: invite.workspace_name,
    expiresAt: invite.expires_at,
    usesRemaining: invite.max_uses ? invite.max_uses - invite.use_count : null,
  });
}));

router.post('/join/:token', asyncHandler(async (req, res) => {
  await pool.query('BEGIN');
  try {
    const invite = await loadInvite(req.params.token);

    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'viewer')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [invite.workspace_id, req.user.id]
    );
    await pool.query(
      'UPDATE workspace_invites SET use_count = use_count + 1 WHERE id = $1',
      [invite.id]
    );
    await pool.query('COMMIT');

    res.json({
      message: 'Successfully joined workspace',
      workspaceId: invite.workspace_id,
      workspaceName: invite.workspace_name,
    });
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
}));

router.delete('/:id/invite-links/:inviteId', requireWorkspaceOwner, asyncHandler(async (req, res) => {
  await pool.query(
    'DELETE FROM workspace_invites WHERE id = $1 AND workspace_id = $2',
    [req.params.inviteId, req.params.id]
  );
  res.json({ message: 'Invite link deleted successfully' });
}));

router.put('/:id',
  requireWorkspaceOwner,
  body('name').optional().notEmpty(),
  asyncHandler(async (req, res) => {
    assertValid(req);
    const result = await pool.query(
      'UPDATE workspaces SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [req.body.name, req.params.id]
    );
    res.json(result.rows[0]);
  })
);

router.delete('/:id', requireWorkspaceOwner, asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM workspaces WHERE id = $1', [req.params.id]);
  res.json({ message: 'Workspace deleted successfully' });
}));

router.get('/:id', requireWorkspaceMember, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT w.*, wm.role
     FROM workspaces w
     JOIN workspace_members wm ON w.id = wm.workspace_id
     WHERE w.id = $1 AND wm.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (result.rows.length === 0) {
    throw new AppError('Workspace not found', 404, 'WORKSPACE_NOT_FOUND');
  }
  res.json(result.rows[0]);
}));

module.exports = router;
