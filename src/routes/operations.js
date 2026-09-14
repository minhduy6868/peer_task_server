const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { requireBoardEdit, requireBoardView } = require('../middleware/permissions');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticateToken);

function assertValid(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
  }
}

function toClientOp(row) {
  return {
    opId: row.operation_id,
    actor: row.created_by,
    timestamp: parseInt(row.timestamp, 10),
    type: row.operation_type,
    payload: row.payload,
    applied: false,
  };
}

router.get('/board/:boardId', requireBoardView, asyncHandler(async (req, res) => {
  const { boardId } = req.params;
  const { since } = req.query;

  const params = [boardId];
  let sql = `
    SELECT bo.*, u.name as creator_name
    FROM board_operations bo
    LEFT JOIN users u ON bo.created_by = u.id
    WHERE bo.board_id = $1
  `;

  if (since) {
    sql += ' AND bo.timestamp > $2';
    params.push(parseInt(since, 10));
  }

  sql += ' ORDER BY bo.timestamp ASC';
  const result = await pool.query(sql, params);
  res.json(result.rows.map(toClientOp));
}));

router.post('/',
  requireBoardEdit,
  body('boardId').isUUID(),
  body('operationId').notEmpty(),
  body('operationType').isIn(['createObject', 'updateObject', 'deleteObject', 'moveObject', 'resizeObject']),
  body('payload').isObject(),
  body('timestamp').isInt(),
  asyncHandler(async (req, res) => {
    assertValid(req);

    const { boardId, operationId, operationType, payload, timestamp } = req.body;

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
      [boardId, operationId, operationType, JSON.stringify(payload), req.user.id, timestamp]
    );

    res.status(201).json(result.rows[0]);
  })
);

router.get('/board/:boardId/count', requireBoardView, asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM board_operations WHERE board_id = $1',
    [req.params.boardId]
  );
  res.json({ count: parseInt(result.rows[0].count, 10) });
}));

router.delete('/board/:boardId/cleanup',
  requireBoardEdit,
  asyncHandler(async (req, res) => {
    const olderThan = req.body.olderThan ?? req.body.beforeTimestamp;
    if (olderThan == null || Number.isNaN(parseInt(olderThan, 10))) {
      throw new AppError('olderThan timestamp is required', 400, 'VALIDATION_ERROR');
    }

    const result = await pool.query(
      'DELETE FROM board_operations WHERE board_id = $1 AND timestamp < $2',
      [req.params.boardId, parseInt(olderThan, 10)]
    );

    res.json({
      message: 'Operations cleaned up',
      deletedCount: result.rowCount,
    });
  })
);

module.exports = router;
