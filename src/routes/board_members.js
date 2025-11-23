const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { requireBoardEdit, getBoardPermission } = require('../middleware/permissions');

// Get board members and their permissions
router.get('/:boardId/members', authenticateToken, async (req, res) => {
  try {
    const { boardId } = req.params;
    const userId = req.user.id;
    
    // Check if user has access to this board
    const userPermission = await getBoardPermission(userId, boardId);
    if (!userPermission) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const result = await pool.query(
      `SELECT 
        u.id, 
        u.name, 
        u.email,
        bm.permission,
        bm.added_at,
        added_by_user.name as added_by_name
      FROM board_members bm
      JOIN users u ON bm.user_id = u.id
      LEFT JOIN users added_by_user ON bm.added_by = added_by_user.id
      WHERE bm.board_id = $1
      ORDER BY 
        CASE bm.permission 
          WHEN 'edit' THEN 1 
          ELSE 2 
        END,
        bm.added_at ASC`,
      [boardId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get board members error:', error);
    res.status(500).json({ error: 'Failed to get board members' });
  }
});

// Add board member with permission
router.post('/:boardId/members', authenticateToken, requireBoardEdit, async (req, res) => {
  try {
    const { boardId } = req.params;
    const { userId, permission = 'view' } = req.body;
    const addedBy = req.user.id;
    
    // Validate permission
    if (!['edit', 'view'].includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission. Use: edit, view' });
    }
    
    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user is in workspace
    const boardInfo = await pool.query('SELECT workspace_id FROM boards WHERE id = $1', [boardId]);
    const workspaceId = boardInfo.rows[0]?.workspace_id;
    
    const workspaceMember = await pool.query(
      'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, userId]
    );
    
    if (workspaceMember.rows.length === 0) {
      return res.status(400).json({ error: 'User must be workspace member first' });
    }
    
    // Add board member
    await pool.query(
      `INSERT INTO board_members (board_id, user_id, permission, added_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (board_id, user_id) 
       DO UPDATE SET permission = $3, added_by = $4`,
      [boardId, userId, permission, addedBy]
    );
    
    res.json({ message: 'Board member added successfully' });
  } catch (error) {
    console.error('Add board member error:', error);
    res.status(500).json({ error: 'Failed to add board member' });
  }
});

// Update board member permission
router.put('/:boardId/members/:userId', authenticateToken, requireBoardEdit, async (req, res) => {
  try {
    const { boardId, userId } = req.params;
    const { permission } = req.body;
    
    // Validate permission
    if (!['edit', 'view'].includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission. Use: edit, view' });
    }
    
    // Cannot change board creator permission
    const creatorCheck = await pool.query(
      'SELECT 1 FROM boards WHERE id = $1 AND created_by = $2',
      [boardId, userId]
    );
    
    if (creatorCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot change board creator permission' });
    }
    
    const result = await pool.query(
      `UPDATE board_members 
       SET permission = $1 
       WHERE board_id = $2 AND user_id = $3
       RETURNING *`,
      [permission, boardId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Board member not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update board member error:', error);
    res.status(500).json({ error: 'Failed to update board member' });
  }
});

// Remove board member
router.delete('/:boardId/members/:userId', authenticateToken, requireBoardEdit, async (req, res) => {
  try {
    const { boardId, userId } = req.params;
    
    // Cannot remove board creator
    const creatorCheck = await pool.query(
      'SELECT 1 FROM boards WHERE id = $1 AND created_by = $2',
      [boardId, userId]
    );
    
    if (creatorCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot remove board creator' });
    }
    
    const result = await pool.query(
      'DELETE FROM board_members WHERE board_id = $1 AND user_id = $2 RETURNING *',
      [boardId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Board member not found' });
    }
    
    res.json({ message: 'Board member removed successfully' });
  } catch (error) {
    console.error('Remove board member error:', error);
    res.status(500).json({ error: 'Failed to remove board member' });
  }
});

module.exports = router;
