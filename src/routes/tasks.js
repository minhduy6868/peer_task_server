const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { requireBoardEdit, requireBoardView } = require('../middleware/permissions');

const router = express.Router();

router.use(authenticateToken);

// Get tasks for a board
router.get('/board/:boardId', requireBoardView, async (req, res) => {
  const { boardId } = req.params;

  try {
    // First verify board exists and user has access
    const boardCheck = await pool.query(
      'SELECT 1 FROM boards WHERE id = $1',
      [boardId]
    );

    if (boardCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const result = await pool.query(
      `SELECT t.*, u.name as creator_name 
       FROM tasks t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.board_id = $1 
       ORDER BY t.position ASC, t.created_at DESC`,
      [boardId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

// Create task
router.post('/',
  requireBoardEdit,
  body('boardId').isUUID(),
  body('title').notEmpty(),
  body('assignee').optional(),
  body('status').optional().isIn(['todo', 'doing', 'done']),
  body('position').optional().isInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { boardId, title, assignee, status = 'todo', position = 0 } = req.body;
    const userId = req.user.id;

    try {
      const result = await pool.query(
        `INSERT INTO tasks (id, board_id, title, assignee, status, position, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [`task-${Date.now()}`, boardId, title, assignee, status, position, userId]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Create task error:', err);
      res.status(500).json({ error: 'Failed to create task' });
    }
  }
);

// Update task
router.put('/:taskId',
  requireBoardEdit,
  body('title').optional().notEmpty(),
  body('assignee').optional(),
  body('status').optional().isIn(['todo', 'doing', 'done']),
  body('position').optional().isInt(),
  async (req, res) => {
    const { taskId } = req.params;
    const { title, assignee, status, position } = req.body;

    try {
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (title !== undefined) {
        updates.push(`title = $${paramCount++}`);
        values.push(title);
      }
      if (assignee !== undefined) {
        updates.push(`assignee = $${paramCount++}`);
        values.push(assignee);
      }
      if (status !== undefined) {
        updates.push(`status = $${paramCount++}`);
        values.push(status);
      }
      if (position !== undefined) {
        updates.push(`position = $${paramCount++}`);
        values.push(position);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      values.push(taskId);

      const result = await pool.query(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Update task error:', err);
      res.status(500).json({ error: 'Failed to update task' });
    }
  }
);

// Delete task
router.delete('/:taskId', requireBoardEdit, async (req, res) => {
  const { taskId } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 RETURNING *',
      [taskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
