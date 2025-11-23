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
      // Check workspace membership
      const memberCheck = await pool.query(
        'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
        [workspaceId, userId]
      );

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member of this workspace' });
      }

      // Create board
      const result = await pool.query(
        'INSERT INTO boards (workspace_id, name, description, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [workspaceId, name, description || null, userId]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
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
    // Check workspace membership
    const memberCheck = await pool.query(
      'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    // Get boards
    const result = await pool.query(
      'SELECT * FROM boards WHERE workspace_id = $1 ORDER BY created_at DESC',
      [workspaceId]
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

module.exports = router;
