const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { requireWorkspaceOwner, requireWorkspaceMember } = require('../middleware/permissions');
const { sendError, asyncHandler } = require('../middleware/errorHandler');

router.get('/:workspaceId/members', authenticateToken, requireWorkspaceMember, asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;

  const result = await pool.query(
    `SELECT 
        u.id as user_id, 
        u.name, 
        u.email,
        wm.role,
        wm.joined_at
      FROM workspace_members wm
      JOIN users u ON wm.user_id = u.id
      WHERE wm.workspace_id = $1
      ORDER BY 
        CASE wm.role 
          WHEN 'owner' THEN 1 
          WHEN 'editor' THEN 2 
          ELSE 3 
        END,
        wm.joined_at ASC`,
    [workspaceId]
  );

  res.json(result.rows);
}));

router.post('/:workspaceId/members', authenticateToken, requireWorkspaceOwner, asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const { userId, role = 'viewer' } = req.body;

  if (!['editor', 'viewer'].includes(role)) {
    return sendError(res, 400, 'Invalid role. Use: editor, viewer', 'VALIDATION_ERROR');
  }

  const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
  if (userCheck.rows.length === 0) {
    return sendError(res, 404, 'User not found', 'USER_NOT_FOUND');
  }

  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) 
     DO UPDATE SET role = $3`,
    [workspaceId, userId, role]
  );

  res.status(201).json({ message: 'Member added successfully' });
}));

router.put('/:workspaceId/members/:userId', authenticateToken, requireWorkspaceOwner, asyncHandler(async (req, res) => {
  const { workspaceId, userId } = req.params;
  const { role } = req.body;

  if (!['editor', 'viewer'].includes(role)) {
    return sendError(res, 400, 'Invalid role. Use: editor, viewer', 'VALIDATION_ERROR');
  }

  const ownerCheck = await pool.query(
    'SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2',
    [workspaceId, userId]
  );

  if (ownerCheck.rows.length > 0) {
    return sendError(res, 400, 'Cannot change owner role', 'VALIDATION_ERROR');
  }

  const result = await pool.query(
    `UPDATE workspace_members 
     SET role = $1 
     WHERE workspace_id = $2 AND user_id = $3
     RETURNING *`,
    [role, workspaceId, userId]
  );

  if (result.rows.length === 0) {
    return sendError(res, 404, 'Member not found', 'NOT_FOUND');
  }

  res.json(result.rows[0]);
}));

router.delete('/:workspaceId/members/:userId', authenticateToken, requireWorkspaceOwner, asyncHandler(async (req, res) => {
  const { workspaceId, userId } = req.params;

  const ownerCheck = await pool.query(
    'SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2',
    [workspaceId, userId]
  );

  if (ownerCheck.rows.length > 0) {
    return sendError(res, 400, 'Cannot remove workspace owner', 'VALIDATION_ERROR');
  }

  const result = await pool.query(
    'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 RETURNING *',
    [workspaceId, userId]
  );

  if (result.rows.length === 0) {
    return sendError(res, 404, 'Member not found', 'NOT_FOUND');
  }

  res.json({ message: 'Member removed successfully' });
}));

module.exports = router;
