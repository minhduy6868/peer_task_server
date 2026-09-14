const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const {
  requireWorkspaceEditor,
  requireWorkspaceMember,
  requireBoardView,
  requireBoardOwner,
} = require('../middleware/permissions');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticateToken);

function assertValid(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
  }
}

router.post('/',
  requireWorkspaceEditor,
  body('workspaceId').isUUID(),
  body('name').notEmpty(),
  body('description').optional(),
  asyncHandler(async (req, res) => {
    assertValid(req);

    const { workspaceId, name, description } = req.body;
    const userId = req.user.id;

    await pool.query('BEGIN');
    try {
      const boardResult = await pool.query(
        'INSERT INTO boards (workspace_id, name, description, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [workspaceId, name, description || null, userId]
      );
      const board = boardResult.rows[0];

      await pool.query(
        `INSERT INTO board_members (board_id, user_id, permission, is_board_owner, added_by)
         VALUES ($1, $2, 'edit', TRUE, $2)`,
        [board.id, userId]
      );

      await pool.query('COMMIT');
      res.status(201).json(board);
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  })
);

router.get('/workspace/:workspaceId', requireWorkspaceMember, asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user.id;
  const isOwner = req.workspaceRole === 'owner';

  if (isOwner) {
    const result = await pool.query(
      `SELECT b.*, 'edit' as permission, TRUE as is_board_owner
       FROM boards b
       WHERE b.workspace_id = $1
       ORDER BY b.created_at DESC`,
      [workspaceId]
    );
    return res.json(result.rows);
  }

  const result = await pool.query(
    `SELECT b.*, bm.permission, bm.is_board_owner
     FROM boards b
     INNER JOIN board_members bm ON b.id = bm.board_id
     WHERE b.workspace_id = $1 AND bm.user_id = $2
     ORDER BY b.created_at DESC`,
    [workspaceId, userId]
  );
  res.json(result.rows);
}));

router.get('/:id', requireBoardView, asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM boards WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) {
    throw new AppError('Board not found', 404, 'BOARD_NOT_FOUND');
  }

  res.json({
    ...result.rows[0],
    permission: req.boardPermission,
  });
}));

router.put('/:id',
  requireBoardOwner,
  body('name').optional().notEmpty(),
  body('description').optional(),
  asyncHandler(async (req, res) => {
    assertValid(req);

    const { name, description } = req.body;
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (updates.length === 0) {
      throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');
    }

    updates.push('updated_at = NOW()');
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE boards SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  })
);

router.delete('/:id', requireBoardOwner, asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM boards WHERE id = $1', [req.params.id]);
  res.json({ message: 'Board deleted successfully' });
}));

module.exports = router;
