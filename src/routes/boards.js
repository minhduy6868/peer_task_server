const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Create board
router.post('/',
  body('workspaceId').isUUID(),
  body('name').notEmpty(),
  body('description').optional(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { workspaceId, name, description } = req.body;
    const userId = req.user.id;

    try {
      // Check workspace membership and role
      const memberCheck = await pool.query(
        'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
        [workspaceId, userId]
      );

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member of this workspace' });
      }

      const userRole = memberCheck.rows[0].role;
      
      // Check if user is owner
      const ownerCheck = await pool.query(
        'SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2',
        [workspaceId, userId]
      );
      const isOwner = ownerCheck.rows.length > 0;

      // Only owner and editor can create boards
      if (!isOwner && userRole !== 'editor') {
        return res.status(403).json({ 
          error: 'Only workspace owner or editor can create boards' 
        });
      }

      await pool.query('BEGIN');

      // Create board
      const boardResult = await pool.query(
        'INSERT INTO boards (workspace_id, name, description, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [workspaceId, name, description || null, userId]
      );

      const board = boardResult.rows[0];

      // Add creator as board owner with edit permission
      await pool.query(
        `INSERT INTO board_members (board_id, user_id, permission, is_board_owner, added_by)
         VALUES ($1, $2, 'edit', TRUE, $2)`,
        [board.id, userId]
      );

      await pool.query('COMMIT');

      res.status(201).json(board);
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get boards for workspace
router.get('/workspace/:workspaceId', async (req, res) => {
  const workspaceId = req.params.workspaceId;
  const userId = req.user.id;

  try {
    // Check workspace membership and get role
    const memberCheck = await pool.query(
      'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    const userRole = memberCheck.rows[0].role;
    const isOwnerQuery = await pool.query(
      'SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2',
      [workspaceId, userId]
    );
    const isOwner = isOwnerQuery.rows.length > 0;

    // Owner sees ALL boards with 'edit' permission and is_board_owner rights
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

    // Editor and Viewer only see boards they are explicitly added to
    const result = await pool.query(
      `SELECT b.*, bm.permission, bm.is_board_owner
       FROM boards b
       INNER JOIN board_members bm ON b.id = bm.board_id
       WHERE b.workspace_id = $1 AND bm.user_id = $2
       ORDER BY b.created_at DESC`,
      [workspaceId, userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single board
router.get('/:id', async (req, res) => {
  const boardId = req.params.id;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT b.* FROM boards b
       JOIN workspace_members wm ON b.workspace_id = wm.workspace_id
       WHERE b.id = $1 AND wm.user_id = $2`,
      [boardId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Board not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update board
router.put('/:id',
  body('name').optional().notEmpty(),
  body('description').optional(),
  async (req, res) => {
    const boardId = req.params.id;
    const userId = req.user.id;
    const { name, description } = req.body;

    try {
      // Check if user is board owner or workspace owner
      const checkResult = await pool.query(
        `SELECT b.*, w.owner_id, wm.role, bm.is_board_owner
         FROM boards b
         JOIN workspaces w ON b.workspace_id = w.id
         JOIN workspace_members wm ON w.id = wm.workspace_id AND wm.user_id = $2
         LEFT JOIN board_members bm ON b.id = bm.board_id AND bm.user_id = $2
         WHERE b.id = $1`,
        [boardId, userId]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Board not found or access denied' });
      }

      const board = checkResult.rows[0];
      const isWorkspaceOwner = board.owner_id === userId;
      const isBoardOwner = board.is_board_owner === true;

      // Only workspace owner or board owner can update
      if (!isWorkspaceOwner && !isBoardOwner) {
        return res.status(403).json({ 
          error: 'Only workspace owner or board creator can update this board' 
        });
      }

      // Update board
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
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      values.push(boardId);

      const result = await pool.query(
        `UPDATE boards SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Delete board (only creator or workspace owner)
router.delete('/:id', async (req, res) => {
  const boardId = req.params.id;
  const userId = req.user.id;

  try {
    // Check if user is board creator or workspace owner
    const checkResult = await pool.query(
      `SELECT b.*, w.owner_id, wm.role, bm.is_board_owner
       FROM boards b
       JOIN workspaces w ON b.workspace_id = w.id
       JOIN workspace_members wm ON w.id = wm.workspace_id AND wm.user_id = $2
       LEFT JOIN board_members bm ON b.id = bm.board_id AND bm.user_id = $2
       WHERE b.id = $1`,
      [boardId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Board not found or access denied' });
    }

    const board = checkResult.rows[0];
    const isWorkspaceOwner = board.owner_id === userId;
    const isBoardOwner = board.is_board_owner === true;

    // Only workspace owner or board owner (creator) can delete
    if (!isWorkspaceOwner && !isBoardOwner) {
      return res.status(403).json({ 
        error: 'Only workspace owner or board creator can delete this board' 
      });
    }

    await pool.query('DELETE FROM boards WHERE id = $1', [boardId]);
    res.json({ message: 'Board deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
