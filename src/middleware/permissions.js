const pool = require('../db/pool');

/**
 * Permission Middleware - Smart authorization logic
 * 
 * WORKSPACE LEVEL:
 * - owner: Full control (delete workspace, manage members, all boards)
 * - admin: Manage members, create/delete boards, assign board permissions
 * - member: Access boards based on board_members table
 * 
 * BOARD LEVEL:
 * - edit: Can draw, create/edit/delete tasks, invite collaborators
 * - view: Read-only access
 * 
 * LOGIC FLOW:
 * 1. Check if user is in workspace (workspace_members)
 * 2. Check workspace role (owner/admin get auto-edit on all boards)
 * 3. For members: check board_members table for specific permission
 * 4. Board creator (created_by) always has edit permission
 */

// Check if user is workspace owner
async function isWorkspaceOwner(userId, workspaceId) {
  const result = await pool.query(
    `SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2`,
    [workspaceId, userId]
  );
  return result.rows.length > 0;
}

// Check workspace membership and role
async function getWorkspaceRole(userId, workspaceId) {
  const result = await pool.query(
    `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );
  return result.rows[0]?.role || null;
}

// Check board permission
async function getBoardPermission(userId, boardId) {
  // Get board info
  const boardResult = await pool.query(
    `SELECT workspace_id, created_by FROM boards WHERE id = $1`,
    [boardId]
  );
  
  if (boardResult.rows.length === 0) return null;
  
  const board = boardResult.rows[0];
  
  // Creator always has edit
  if (board.created_by === userId) {
    return 'edit';
  }
  
  // Check if workspace owner
  if (await isWorkspaceOwner(userId, board.workspace_id)) {
    return 'edit';
  }
  
  // Check workspace role
  const workspaceRole = await getWorkspaceRole(userId, board.workspace_id);
  if (workspaceRole === 'admin') {
    return 'edit';
  }
  
  // Check board-specific permission
  const permResult = await pool.query(
    `SELECT permission FROM board_members WHERE board_id = $1 AND user_id = $2`,
    [boardId, userId]
  );
  
  return permResult.rows[0]?.permission || null;
}

// Middleware: Require workspace membership
function requireWorkspaceMember(req, res, next) {
  return async (req, res, next) => {
    const userId = req.user.id;
    const workspaceId = req.params.workspaceId || req.body.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }
    
    const role = await getWorkspaceRole(userId, workspaceId);
    
    if (!role) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }
    
    req.workspaceRole = role;
    next();
  };
}

// Middleware: Require workspace admin or owner
function requireWorkspaceAdmin(req, res, next) {
  return async (req, res, next) => {
    const userId = req.user.id;
    const workspaceId = req.params.workspaceId || req.body.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }
    
    const isOwner = await isWorkspaceOwner(userId, workspaceId);
    const role = await getWorkspaceRole(userId, workspaceId);
    
    if (!isOwner && role !== 'admin') {
      return res.status(403).json({ error: 'Requires admin or owner role' });
    }
    
    req.workspaceRole = isOwner ? 'owner' : role;
    next();
  };
}

// Middleware: Require board edit permission
function requireBoardEdit(req, res, next) {
  return async (req, res, next) => {
    const userId = req.user.id;
    const boardId = req.params.boardId || req.body.boardId;
    
    if (!boardId) {
      return res.status(400).json({ error: 'Board ID required' });
    }
    
    const permission = await getBoardPermission(userId, boardId);
    
    if (permission !== 'edit') {
      return res.status(403).json({ error: 'Edit permission required' });
    }
    
    req.boardPermission = permission;
    next();
  };
}

// Middleware: Require board view permission (view or edit)
function requireBoardView(req, res, next) {
  return async (req, res, next) => {
    const userId = req.user.id;
    const boardId = req.params.boardId || req.body.boardId;
    
    if (!boardId) {
      return res.status(400).json({ error: 'Board ID required' });
    }
    
    const permission = await getBoardPermission(userId, boardId);
    
    if (!permission) {
      return res.status(403).json({ error: 'Board access denied' });
    }
    
    req.boardPermission = permission;
    next();
  };
}

module.exports = {
  isWorkspaceOwner,
  getWorkspaceRole,
  getBoardPermission,
  requireWorkspaceMember,
  requireWorkspaceAdmin,
  requireBoardEdit,
  requireBoardView,
};
