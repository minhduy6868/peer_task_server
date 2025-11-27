const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { getBoardPermission, isBoardOwner, requireBoardOwner, requireBoardEditor, getWorkspaceRole } = require('../middleware/permissions');

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
  } catch (error) {
    console.error('Get board members error:', error);
    res.status(500).json({ error: 'Failed to get board members' });
  }
});

// Add board member with permission (board owner or editor role in workspace)
router.post('/:boardId/members', authenticateToken, requireBoardEditor, async (req, res) => {
  try {
    const { boardId } = req.params;
    const { userId, permission = 'view' } = req.body;
    const addedBy = req.user.id;
    const workspaceId = req.workspaceId; // From middleware
    
    console.log(`ADD BOARD MEMBER REQUEST: board=${boardId}, user=${userId}, permission=${permission}, addedBy=${addedBy}`);
    
    // Validate permission
    if (!['edit', 'view'].includes(permission)) {
      console.log('ERROR: Invalid permission');
      return res.status(400).json({ error: 'Invalid permission. Use: edit, view' });
    }
    
    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      console.log('ERROR: User not found');
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user is in workspace
    const workspaceMember = await pool.query(
      'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, userId]
    );
    
    if (workspaceMember.rows.length === 0) {
      console.log('ERROR: User not in workspace');
      return res.status(400).json({ error: 'User must be workspace member first' });
    }
    
    const memberWorkspaceRole = workspaceMember.rows[0].role;
    console.log(`User workspace role: ${memberWorkspaceRole}`);
    
    // Workspace viewers CAN have edit permission in specific boards
    // This allows flexible board-level permissions independent of workspace role
    
    console.log('Executing INSERT board_members query...');
    // Add board member
    const result = await pool.query(
      `INSERT INTO board_members (board_id, user_id, permission, added_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (board_id, user_id) 
       DO UPDATE SET permission = $3, added_by = $4
       RETURNING *`,
      [boardId, userId, permission, addedBy]
    );
    
    console.log('SUCCESS: Board member added/updated', result.rows[0]);
    res.json({ message: 'Board member added successfully', member: result.rows[0] });
  } catch (error) {
    console.error('Add board member error:', error);
    res.status(500).json({ error: 'Failed to add board member' });
  }
});

// Update board member permission (board owner or workspace owner only)
router.put('/:boardId/members/:userId', authenticateToken, requireBoardOwner, async (req, res) => {
  try {
    const { boardId, userId } = req.params;
    const { permission } = req.body;
    
    // Validate permission
    if (!['edit', 'view'].includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission. Use: edit, view' });
    }
    
    // Cannot change board owner permission
    const ownerCheck = await pool.query(
      'SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2 AND is_board_owner = TRUE',
      [boardId, userId]
    );
    
    if (ownerCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot change board owner permission' });
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

// Remove board member (board owner or workspace owner only)
router.delete('/:boardId/members/:userId', authenticateToken, requireBoardOwner, async (req, res) => {
  try {
    const { boardId, userId } = req.params;
    
    // Cannot remove board owner
    const ownerCheck = await pool.query(
      'SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2 AND is_board_owner = TRUE',
      [boardId, userId]
    );
    
    if (ownerCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot remove board owner' });
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
