const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { getBoardPermission, requireBoardOwner, requireBoardEditor } = require('../middleware/permissions');
const { sendError, asyncHandler } = require('../middleware/errorHandler');

router.get('/:boardId/members', authenticateToken, asyncHandler(async (req, res) => {
  const { boardId } = req.params;
  const userPermission = await getBoardPermission(req.user.id, boardId);
  if (!userPermission) {
    return sendError(res, 403, 'Access denied', 'FORBIDDEN');
  }

  const result = await pool.query(
    `SELECT 
        u.id as user_id, 
        u.name, 
        u.email,
        bm.permission,
        bm.is_board_owner,
        bm.added_at,
        wm.role as workspace_role
      FROM board_members bm
      JOIN users u ON bm.user_id = u.id
      LEFT JOIN boards b ON bm.board_id = b.id
      LEFT JOIN workspace_members wm ON b.workspace_id = wm.workspace_id AND u.id = wm.user_id
      WHERE bm.board_id = $1
      ORDER BY 
        bm.is_board_owner DESC,
        CASE bm.permission 
          WHEN 'edit' THEN 1 
          ELSE 2 
        END,
        bm.added_at ASC`,
    [boardId]
  );

  res.json(result.rows);
}));

router.post('/:boardId/members', authenticateToken, requireBoardEditor, asyncHandler(async (req, res) => {
  const { boardId } = req.params;
  const { userId, permission = 'view' } = req.body;
  const addedBy = req.user.id;
  const workspaceId = req.workspaceId;

  if (!['edit', 'view'].includes(permission)) {
    return sendError(res, 400, 'Invalid permission. Use: edit, view', 'VALIDATION_ERROR');
  }

  const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
  if (userCheck.rows.length === 0) {
    return sendError(res, 404, 'User not found', 'USER_NOT_FOUND');
  }

  const workspaceMember = await pool.query(
    'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId]
  );

  if (workspaceMember.rows.length === 0) {
    return sendError(res, 400, 'User must be workspace member first', 'VALIDATION_ERROR');
  }

  const result = await pool.query(
    `INSERT INTO board_members (board_id, user_id, permission, added_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (board_id, user_id) 
     DO UPDATE SET permission = $3, added_by = $4
     RETURNING *`,
    [boardId, userId, permission, addedBy]
  );

  res.status(201).json({ message: 'Board member added successfully', member: result.rows[0] });
}));

router.put('/:boardId/members/:userId', authenticateToken, requireBoardOwner, asyncHandler(async (req, res) => {
  const { boardId, userId } = req.params;
  const { permission } = req.body;

  if (!['edit', 'view'].includes(permission)) {
    return sendError(res, 400, 'Invalid permission. Use: edit, view', 'VALIDATION_ERROR');
  }

  const ownerCheck = await pool.query(
    'SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2 AND is_board_owner = TRUE',
    [boardId, userId]
  );

  if (ownerCheck.rows.length > 0) {
    return sendError(res, 400, 'Cannot change board owner permission', 'VALIDATION_ERROR');
  }

  const result = await pool.query(
    `UPDATE board_members 
     SET permission = $1 
     WHERE board_id = $2 AND user_id = $3
     RETURNING *`,
    [permission, boardId, userId]
  );

  if (result.rows.length === 0) {
    return sendError(res, 404, 'Board member not found', 'NOT_FOUND');
  }

  res.json(result.rows[0]);
}));

router.delete('/:boardId/members/:userId', authenticateToken, requireBoardOwner, asyncHandler(async (req, res) => {
  const { boardId, userId } = req.params;

  const ownerCheck = await pool.query(
    'SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2 AND is_board_owner = TRUE',
    [boardId, userId]
  );

  if (ownerCheck.rows.length > 0) {
    return sendError(res, 400, 'Cannot remove board owner', 'VALIDATION_ERROR');
  }

  const result = await pool.query(
    'DELETE FROM board_members WHERE board_id = $1 AND user_id = $2 RETURNING *',
    [boardId, userId]
  );

  if (result.rows.length === 0) {
    return sendError(res, 404, 'Board member not found', 'NOT_FOUND');
  }

  res.json({ message: 'Board member removed successfully' });
}));

module.exports = router;
