const express = require('express');
const { body, query, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { requireBoardEdit, requireBoardView, requireTaskEdit } = require('../middleware/permissions');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticateToken);

function assertValid(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
  }
}

async function validateAssignees(boardId, assigneeIds) {
  if (!assigneeIds || assigneeIds.length === 0) return;
  for (const assigneeId of assigneeIds) {
    const result = await pool.query(
      `SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2
       UNION
       SELECT 1 FROM boards b
       JOIN workspace_members wm ON b.workspace_id = wm.workspace_id
       WHERE b.id = $1 AND wm.user_id = $2 AND wm.role = 'owner'`,
      [boardId, assigneeId]
    );
    if (result.rows.length === 0) {
      throw new AppError(`User ${assigneeId} is not a member of this board`, 400, 'VALIDATION_ERROR');
    }
  }
}

async function getNextPosition(boardId, status) {
  const result = await pool.query(
    `SELECT COALESCE(MAX(position), 0) + 1 as next_pos
     FROM tasks WHERE board_id = $1 AND status = $2`,
    [boardId, status]
  );
  return result.rows[0].next_pos;
}

async function reorderPositions(boardId, status) {
  await pool.query(
    `WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at) as new_pos
      FROM tasks WHERE board_id = $1 AND status = $2
    )
    UPDATE tasks SET position = ranked.new_pos
    FROM ranked WHERE tasks.id = ranked.id`,
    [boardId, status]
  );
}

const TASK_SELECT = `
  SELECT t.*,
         u.name as creator_name,
         (SELECT JSON_AGG(JSON_BUILD_OBJECT(
           'id', users.id,
           'name', users.name,
           'email', users.email
         ))
         FROM users
         WHERE users.id = ANY(t.assignees)) as assignee_list,
         (SELECT COUNT(*) FROM tasks WHERE parent_id = t.id) as subtask_count,
         (SELECT COUNT(*) FROM tasks WHERE parent_id = t.id AND status = 'done') as completed_subtask_count
  FROM tasks t
  LEFT JOIN users u ON t.created_by = u.id
`;

router.get('/board/:boardId',
  requireBoardView,
  query('assignee_id').optional().isUUID(),
  query('status').optional().isIn(['todo', 'doing', 'done']),
  query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  query('parent_id').optional(),
  asyncHandler(async (req, res) => {
    assertValid(req);
    const { boardId } = req.params;
    const { assignee_id, status, priority, parent_id } = req.query;

    let sql = `${TASK_SELECT} WHERE t.board_id = $1`;
    const values = [boardId];
    let paramCount = 2;

    if (assignee_id) {
      sql += ` AND $${paramCount++} = ANY(t.assignees)`;
      values.push(assignee_id);
    }
    if (status) {
      sql += ` AND t.status = $${paramCount++}`;
      values.push(status);
    }
    if (priority) {
      sql += ` AND t.priority = $${paramCount++}`;
      values.push(priority);
    }
    if (parent_id !== undefined) {
      if (parent_id === 'null' || parent_id === '') {
        sql += ' AND t.parent_id IS NULL';
      } else {
        sql += ` AND t.parent_id = $${paramCount++}`;
        values.push(parent_id);
      }
    }

    sql += ' ORDER BY t.position ASC, t.created_at DESC';
    const result = await pool.query(sql, values);
    res.json(result.rows);
  })
);

router.post('/',
  requireBoardEdit,
  body('boardId').isUUID(),
  body('title').notEmpty().trim(),
  body('description').optional().trim(),
  body('assignees').optional().isArray(),
  body('status').optional().isIn(['todo', 'doing', 'done']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('deadline').optional().isISO8601(),
  body('parent_id').optional(),
  body('labels').optional().isArray(),
  body('estimated_hours').optional().isFloat({ min: 0 }),
  asyncHandler(async (req, res) => {
    assertValid(req);

    const {
      boardId,
      title,
      description,
      assignees = [],
      status = 'todo',
      priority = 'medium',
      deadline,
      parent_id,
      labels = [],
      estimated_hours,
    } = req.body;

    await validateAssignees(boardId, assignees);

    if (parent_id) {
      const parentCheck = await pool.query(
        'SELECT 1 FROM tasks WHERE id = $1 AND board_id = $2',
        [parent_id, boardId]
      );
      if (parentCheck.rows.length === 0) {
        throw new AppError('Parent task not found in this board', 400, 'VALIDATION_ERROR');
      }
    }

    const position = await getNextPosition(boardId, status);
    const result = await pool.query(
      `INSERT INTO tasks (
          id, board_id, title, description, assignees,
          status, position, priority, deadline,
          parent_id, labels, estimated_hours, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
      [
        `task-${Date.now()}`,
        boardId,
        title,
        description,
        assignees,
        status,
        position,
        priority,
        deadline ? new Date(deadline) : null,
        parent_id,
        JSON.stringify(labels),
        estimated_hours,
        req.user.id,
      ]
    );

    const enriched = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [result.rows[0].id]);
    res.status(201).json(enriched.rows[0]);
  })
);

router.put('/:taskId',
  requireTaskEdit,
  body('title').optional().notEmpty().trim(),
  body('description').optional(),
  body('assignees').optional().isArray(),
  body('status').optional().isIn(['todo', 'doing', 'done']),
  body('position').optional().isInt({ min: 0 }),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('deadline').optional(),
  body('labels').optional().isArray(),
  body('estimated_hours').optional().isFloat({ min: 0 }),
  asyncHandler(async (req, res) => {
    assertValid(req);
    const { taskId } = req.params;
    const {
      title, description, assignees,
      status, position, priority, deadline,
      labels, estimated_hours,
    } = req.body;

    const taskCheck = await pool.query(
      'SELECT board_id, status as old_status FROM tasks WHERE id = $1',
      [taskId]
    );
    if (taskCheck.rows.length === 0) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }

    const { board_id, old_status } = taskCheck.rows[0];
    await validateAssignees(board_id, assignees);

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (assignees !== undefined) {
      updates.push(`assignees = $${paramCount++}`);
      values.push(assignees);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (position !== undefined) {
      updates.push(`position = $${paramCount++}`);
      values.push(position);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramCount++}`);
      values.push(priority);
    }
    if (deadline !== undefined) {
      updates.push(`deadline = $${paramCount++}`);
      values.push(deadline ? new Date(deadline) : null);
    }
    if (labels !== undefined) {
      updates.push(`labels = $${paramCount++}`);
      values.push(JSON.stringify(labels));
    }
    if (estimated_hours !== undefined) {
      updates.push(`estimated_hours = $${paramCount++}`);
      values.push(estimated_hours);
    }
    if (updates.length === 0) {
      throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');
    }

    updates.push('updated_at = NOW()');
    values.push(taskId);
    await pool.query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (status && status !== old_status) {
      await reorderPositions(board_id, old_status);
      if (position === undefined) {
        const newPos = await getNextPosition(board_id, status);
        await pool.query('UPDATE tasks SET position = $1 WHERE id = $2', [newPos, taskId]);
      }
    }

    const enriched = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [taskId]);
    res.json(enriched.rows[0]);
  })
);

router.delete('/:taskId', requireTaskEdit, asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const taskCheck = await pool.query(
    'SELECT board_id, status FROM tasks WHERE id = $1',
    [taskId]
  );
  if (taskCheck.rows.length === 0) {
    throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
  }

  const { board_id, status } = taskCheck.rows[0];
  await pool.query('DELETE FROM tasks WHERE parent_id = $1', [taskId]);
  const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [taskId]);
  await reorderPositions(board_id, status);
  res.json({ message: 'Task deleted successfully', deleted: result.rows[0] });
}));

router.post('/reorder', requireBoardEdit, asyncHandler(async (req, res) => {
  const { boardId, status, taskIds } = req.body;
  if (!boardId || !status || !Array.isArray(taskIds)) {
    throw new AppError('boardId, status, and taskIds array required', 400, 'VALIDATION_ERROR');
  }

  for (let i = 0; i < taskIds.length; i++) {
    await pool.query(
      'UPDATE tasks SET position = $1, status = $2 WHERE id = $3 AND board_id = $4',
      [i + 1, status, taskIds[i], boardId]
    );
  }
  res.json({ message: 'Tasks reordered successfully' });
}));

router.post('/:taskId/move', requireTaskEdit, asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { status, position } = req.body;
  if (!status) {
    throw new AppError('status is required', 400, 'VALIDATION_ERROR');
  }
  if (!['todo', 'doing', 'done'].includes(status)) {
    throw new AppError('Invalid status', 400, 'VALIDATION_ERROR');
  }

  const taskCheck = await pool.query(
    'SELECT board_id, status as old_status FROM tasks WHERE id = $1',
    [taskId]
  );
  if (taskCheck.rows.length === 0) {
    throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
  }

  const { board_id, old_status } = taskCheck.rows[0];
  const newPosition = position === undefined
    ? await getNextPosition(board_id, status)
    : position;

  await pool.query(
    'UPDATE tasks SET status = $1, position = $2, updated_at = NOW() WHERE id = $3',
    [status, newPosition, taskId]
  );
  if (old_status !== status) {
    await reorderPositions(board_id, old_status);
  }

  const result = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [taskId]);
  res.json(result.rows[0]);
}));

router.get('/board/:boardId/stats', requireBoardView, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT
        COUNT(*) FILTER (WHERE status = 'todo') as todo_count,
        COUNT(*) FILTER (WHERE status = 'doing') as doing_count,
        COUNT(*) FILTER (WHERE status = 'done') as done_count,
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE deadline < NOW() AND status != 'done') as overdue_count,
        ROUND(AVG(progress)::numeric, 2) as avg_progress
      FROM tasks
      WHERE board_id = $1 AND parent_id IS NULL`,
    [req.params.boardId]
  );
  res.json(result.rows[0]);
}));

router.get('/my-tasks', asyncHandler(async (req, res) => {
  const { status, limit = 50 } = req.query;
  const values = [req.user.id];
  let sql = `
    SELECT t.*,
           b.name as board_name,
           w.name as workspace_name,
           u.name as creator_name
    FROM tasks t
    JOIN boards b ON t.board_id = b.id
    JOIN workspaces w ON b.workspace_id = w.id
    LEFT JOIN users u ON t.created_by = u.id
    WHERE $1 = ANY(t.assignees)
  `;
  let paramCount = 2;
  if (status) {
    sql += ` AND t.status = $${paramCount++}`;
    values.push(status);
  }
  sql += ` ORDER BY
      CASE WHEN t.deadline IS NOT NULL AND t.deadline < NOW() THEN 0 ELSE 1 END,
      t.deadline ASC NULLS LAST,
      t.priority DESC,
      t.created_at DESC
      LIMIT $${paramCount}`;
  values.push(parseInt(limit, 10));

  const result = await pool.query(sql, values);
  res.json(result.rows);
}));

module.exports = router;
