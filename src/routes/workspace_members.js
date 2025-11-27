const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { requireWorkspaceOwner } = require('../middleware/permissions');

// Get workspace members
router.get('/:workspaceId/members', authenticateToken, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    
    const result = await pool.query(
      `SELECT 
        u.id, 
        u.name, 
        u.email,
        wm.role,
        wm.joined_at
      FROM workspace_members wm
      JOIN users u ON wm.user_id = u.id
      WHERE wm.workspace_id = $1
      ORDER BY 
        CASE wm.role 
          WHEN 'owner' THEN 1 
          WHEN 'editor' THEN 2 
          ELSE 3 
        END,
        wm.joined_at ASC`,
      [workspaceId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Failed to get members' });
  }
});

// Add workspace member (owner only)
router.post('/:workspaceId/members', authenticateToken, requireWorkspaceOwner, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { userId, role = 'viewer' } = req.body;
    
    // Validate role
    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Use: editor, viewer' });
    }
    
    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Add member
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) 
       DO UPDATE SET role = $3`,
      [workspaceId, userId, role]
    );
    
    res.json({ message: 'Member added successfully' });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Update member role (owner only)
router.put('/:workspaceId/members/:userId', authenticateToken, requireWorkspaceOwner, async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const { role } = req.body;
    
    // Validate role
    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Use: editor, viewer' });
    }
    
    // Cannot change workspace owner role
    const ownerCheck = await pool.query(
      'SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2',
      [workspaceId, userId]
    );
    
    if (ownerCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot change owner role' });
    }
    
    const result = await pool.query(
      `UPDATE workspace_members 
       SET role = $1 
       WHERE workspace_id = $2 AND user_id = $3
       RETURNING *`,
      [role, workspaceId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update member error:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// Remove member (owner only)
router.delete('/:workspaceId/members/:userId', authenticateToken, requireWorkspaceOwner, async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    
    // Cannot remove workspace owner
    const ownerCheck = await pool.query(
      'SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2',
      [workspaceId, userId]
    );
    
    if (ownerCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot remove workspace owner' });
    }
    
    const result = await pool.query(
      'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 RETURNING *',
      [workspaceId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;
