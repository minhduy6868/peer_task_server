const express = require('express');
const { body, query, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { requireBoardEdit, requireBoardView } = require('../middleware/permissions');

const router = express.Router();

router.use(authenticateToken);

/**
 * Helper: Validate assignees are board members
 */
async function validateAssignees(boardId, assigneeIds) {
  if (!assigneeIds || assigneeIds.length === 0) return { valid: true };
  
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
      return { 
        valid: false,
        error: `User ${assigneeId} is not a member of this board`
      };
    }
  }
  
  return { valid: true };
}

/**
 * Helper: Get next position for a task in a status column
 */
async function getNextPosition(boardId, status) {
  const result = await pool.query(
    `SELECT COALESCE(MAX(position), 0) + 1 as next_pos 
     FROM tasks WHERE board_id = $1 AND status = $2`,
    [boardId, status]
  );
  return result.rows[0].next_pos;
}

/**
 * Helper: Reorder positions after a task is moved/deleted
 */
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

// Get tasks for a board with filters
router.get('/board/:boardId', 
  requireBoardView, 
  query('assignee_id').optional().isUUID(),
  query('status').optional().isIn(['todo', 'doing', 'done']),
  query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  query('parent_id').optional(),
  async (req, res) => {
    const { boardId } = req.params;
    const { assignee_id, status, priority, parent_id } = req.query;

    try {
      // First verify board exists
      const boardCheck = await pool.query(
        'SELECT 1 FROM boards WHERE id = $1',
        [boardId]
      );

      if (boardCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Board not found' });
      }

      // Build dynamic query with filters
      let query = `
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
        WHERE t.board_id = $1
      `;
      const values = [boardId];
      let paramCount = 2;

      // Apply filters
      if (assignee_id) {
        query += ` AND $${paramCount++} = ANY(t.assignees)`;
        values.push(assignee_id);
      }
      if (status) {
        query += ` AND t.status = $${paramCount++}`;
        values.push(status);
      }
      if (priority) {
        query += ` AND t.priority = $${paramCount++}`;
        values.push(priority);
      }
      if (parent_id !== undefined) {
        if (parent_id === 'null' || parent_id === '') {
          query += ` AND t.parent_id IS NULL`;
        } else {
          query += ` AND t.parent_id = $${paramCount++}`;
          values.push(parent_id);
        }
      }

      query += ` ORDER BY t.position ASC, t.created_at DESC`;

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (err) {
      console.error('Get tasks error:', err);
      res.status(500).json({ error: 'Failed to get tasks' });
    }
  }
);

// Create task
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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

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
      estimated_hours
    } = req.body;
    const userId = req.user.id;

    try {
      // Validate assignees are board members
      if (assignees.length > 0) {
        const validation = await validateAssignees(boardId, assignees);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }
      }

      // Validate parent_id exists and belongs to same board
      if (parent_id) {
        const parentCheck = await pool.query(
          'SELECT 1 FROM tasks WHERE id = $1 AND board_id = $2',
          [parent_id, boardId]
        );
        if (parentCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Parent task not found in this board' });
        }
      }

      // Get next position for this status column
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
          userId
        ]
      );

      // Return task with user info
      const task = result.rows[0];
      const enrichedResult = await pool.query(
        `SELECT t.*, 
                u.name as creator_name,
                (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                  'id', users.id,
                  'name', users.name,
                  'email', users.email
                ))
                FROM users
                WHERE users.id = ANY(t.assignees)) as assignee_list
         FROM tasks t
         LEFT JOIN users u ON t.created_by = u.id
         WHERE t.id = $1`,
        [task.id]
      );

      res.status(201).json(enrichedResult.rows[0]);
    } catch (err) {
      console.error('Create task error:', err);
      res.status(500).json({ error: 'Failed to create task' });
    }
  }
);

// Update task
router.put('/:taskId',
  requireBoardEdit,
  body('title').optional().notEmpty().trim(),
  body('description').optional(),
  body('assignees').optional().isArray(),
  body('status').optional().isIn(['todo', 'doing', 'done']),
  body('position').optional().isInt({ min: 0 }),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('deadline').optional(),
  body('labels').optional().isArray(),
  body('estimated_hours').optional().isFloat({ min: 0 }),
  async (req, res) => {
    const { taskId } = req.params;
    const { 
      title, description, assignees, 
      status, position, priority, deadline, 
      labels, estimated_hours 
    } = req.body;

    try {
      // Get current task to check board_id and old status
      const taskCheck = await pool.query(
        'SELECT board_id, status as old_status, position as old_position FROM tasks WHERE id = $1',
        [taskId]
      );
      
      if (taskCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const { board_id, old_status, old_position } = taskCheck.rows[0];

      // Validate assignees are board members
      if (assignees && assignees.length > 0) {
        const validation = await validateAssignees(board_id, assignees);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }
      }

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
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      values.push(taskId);

      const result = await pool.query(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      // Reorder positions if status changed
      if (status && status !== old_status) {
        await reorderPositions(board_id, old_status);
        
        // If no specific position given for new status, add at end
        if (position === undefined) {
          const newPos = await getNextPosition(board_id, status);
          await pool.query(
            'UPDATE tasks SET position = $1 WHERE id = $2',
            [newPos, taskId]
          );
        }
      }

      // Return enriched task
      const enrichedResult = await pool.query(
        `SELECT t.*, 
                u.name as creator_name,
                (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                  'id', users.id,
                  'name', users.name,
                  'email', users.email
                ))
                FROM users
                WHERE users.id = ANY(t.assignees)) as assignee_list
         FROM tasks t
         LEFT JOIN users u ON t.created_by = u.id
         WHERE t.id = $1`,
        [taskId]
      );

      res.json(enrichedResult.rows[0]);
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
    // Get task info for reordering
    const taskCheck = await pool.query(
      'SELECT board_id, status FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { board_id, status } = taskCheck.rows[0];

    // Delete subtasks first (cascade should handle this, but explicit for safety)
    await pool.query('DELETE FROM tasks WHERE parent_id = $1', [taskId]);

    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 RETURNING *',
      [taskId]
    );

    // Reorder remaining tasks
    await reorderPositions(board_id, status);

    res.json({ message: 'Task deleted successfully', deleted: result.rows[0] });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Reorder tasks in a status column
router.post('/reorder', requireBoardEdit, async (req, res) => {
  const { boardId, status, taskIds } = req.body;

  if (!boardId || !status || !Array.isArray(taskIds)) {
    return res.status(400).json({ error: 'boardId, status, and taskIds array required' });
  }

  try {
    // Update positions based on array order
    for (let i = 0; i < taskIds.length; i++) {
      await pool.query(
        'UPDATE tasks SET position = $1, status = $2 WHERE id = $3 AND board_id = $4',
        [i + 1, status, taskIds[i], boardId]
      );
    }

    res.json({ message: 'Tasks reordered successfully' });
  } catch (err) {
    console.error('Reorder tasks error:', err);
    res.status(500).json({ error: 'Failed to reorder tasks' });
  }
});

// Move task to different status with position
router.post('/:taskId/move', requireBoardEdit, async (req, res) => {
  const { taskId } = req.params;
  const { status, position } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'status is required' });
  }

  try {
    // Get current task
    const taskCheck = await pool.query(
      'SELECT board_id, status as old_status FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { board_id, old_status } = taskCheck.rows[0];

    // Calculate new position
    let newPosition = position;
    if (newPosition === undefined) {
      newPosition = await getNextPosition(board_id, status);
    }

    // Update task
    await pool.query(
      'UPDATE tasks SET status = $1, position = $2, updated_at = NOW() WHERE id = $3',
      [status, newPosition, taskId]
    );

    // Reorder old status column
    if (old_status !== status) {
      await reorderPositions(board_id, old_status);
    }

    // Return updated task
    const result = await pool.query(
      `SELECT t.*, 
              u.name as creator_name,
              (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                'id', users.id,
                'name', users.name,
                'email', users.email
              ))
              FROM users
              WHERE users.id = ANY(t.assignees)) as assignee_list
       FROM tasks t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.id = $1`,
      [taskId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Move task error:', err);
    res.status(500).json({ error: 'Failed to move task' });
  }
});

// Get task statistics for a board
router.get('/board/:boardId/stats', requireBoardView, async (req, res) => {
  const { boardId } = req.params;

  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'todo') as todo_count,
        COUNT(*) FILTER (WHERE status = 'doing') as doing_count,
        COUNT(*) FILTER (WHERE status = 'done') as done_count,
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE deadline < NOW() AND status != 'done') as overdue_count,
        ROUND(AVG(progress)::numeric, 2) as avg_progress,
        COUNT(DISTINCT assignee_id) as unique_assignees
      FROM tasks 
      WHERE board_id = $1 AND parent_id IS NULL
    `, [boardId]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get task stats error:', err);
    res.status(500).json({ error: 'Failed to get task statistics' });
  }
});

// Get tasks assigned to current user across all boards
router.get('/my-tasks', async (req, res) => {
  const userId = req.user.id;
  const { status, limit = 50 } = req.query;

  try {
    let query = `
      SELECT t.*, 
             b.name as board_name,
             w.name as workspace_name,
             u.name as creator_name
      FROM tasks t
      JOIN boards b ON t.board_id = b.id
      JOIN workspaces w ON b.workspace_id = w.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.assignee_id = $1
    `;
    const values = [userId];
    let paramCount = 2;

    if (status) {
      query += ` AND t.status = $${paramCount++}`;
      values.push(status);
    }

    query += ` ORDER BY 
      CASE WHEN t.deadline IS NOT NULL AND t.deadline < NOW() THEN 0 ELSE 1 END,
      t.deadline ASC NULLS LAST,
      t.priority DESC,
      t.created_at DESC
      LIMIT $${paramCount}`;
    values.push(parseInt(limit));

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Get my tasks error:', err);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

module.exports = router;
