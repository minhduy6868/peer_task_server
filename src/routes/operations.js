const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { requireBoardEdit, requireBoardView } = require('../middleware/permissions');

const router = express.Router();

router.use(authenticateToken);

// Get board operations (for sync/replay)
router.get('/board/:boardId', requireBoardView, async (req, res) => {
  const { boardId } = req.params;
  const { since } = req.query; // timestamp filter

  try {
    let query = `
      SELECT bo.*, u.name as creator_name 
      FROM board_operations bo
      LEFT JOIN users u ON bo.created_by = u.id
      WHERE bo.board_id = $1
    `;
    const params = [boardId];

    if (since) {
      query += ' AND bo.timestamp > $2';
      params.push(parseInt(since));
    }

    query += ' ORDER BY bo.timestamp ASC';

    const result = await pool.query(query, params);
    
    // Transform to match Dart Operation model (opId instead of operation_id)
    const operations = result.rows.map(row => ({
      opId: row.operation_id,
      actor: row.created_by,
      timestamp: parseInt(row.timestamp), // Parse to int
      type: row.operation_type,
      payload: row.payload,
      applied: false
    }));
    
    res.json(operations);
  } catch (err) {
    console.error('Get operations error:', err);
    res.status(500).json({ error: 'Failed to get operations' });
  }
});

// Save operation (from P2P sync)
router.post('/',
  requireBoardEdit,
  body('boardId').isUUID(),
  body('operationId').notEmpty(),
  body('operationType').isIn(['createObject', 'updateObject', 'deleteObject', 'moveObject', 'resizeObject']),
  body('payload').isObject(),
  body('timestamp').isInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { boardId, operationId, operationType, payload, timestamp } = req.body;
    const userId = req.user.id;

    try {
      // Check for duplicate operation
      const existing = await pool.query(
        'SELECT 1 FROM board_operations WHERE operation_id = $1',
        [operationId]
      );

      if (existing.rows.length > 0) {
        return res.status(200).json({ message: 'Operation already exists' });
      }

      const result = await pool.query(
        `INSERT INTO board_operations 
         (board_id, operation_id, operation_type, payload, created_by, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [boardId, operationId, operationType, JSON.stringify(payload), userId, timestamp]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Save operation error:', err);
      res.status(500).json({ error: 'Failed to save operation' });
    }
  }
);

// Get operation count (for metrics)
router.get('/board/:boardId/count', requireBoardView, async (req, res) => {
  const { boardId } = req.params;

  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM board_operations WHERE board_id = $1',
      [boardId]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Get operation count error:', err);
    res.status(500).json({ error: 'Failed to get operation count' });
  }
});

// Clear old operations (cleanup/archive)
router.delete('/board/:boardId/cleanup',
  requireBoardEdit,
  body('beforeTimestamp').isInt(),
  async (req, res) => {
    const { boardId } = req.params;
    const { beforeTimestamp } = req.body;

    try {
      const result = await pool.query(
        'DELETE FROM board_operations WHERE board_id = $1 AND timestamp < $2 RETURNING COUNT(*)',
        [boardId, beforeTimestamp]
      );

      res.json({ 
        message: 'Operations cleaned up', 
        deletedCount: result.rowCount 
      });
    } catch (err) {
      console.error('Cleanup operations error:', err);
      res.status(500).json({ error: 'Failed to cleanup operations' });
    }
  }
);

module.exports = router;
