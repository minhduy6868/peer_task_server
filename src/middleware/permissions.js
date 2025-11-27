const pool = require('../db/pool');

/**
 * Permission Middleware - Smart authorization logic
 * 
 * WORKSPACE LEVEL:
 * - owner: Full control (delete workspace, manage members, view/edit ALL boards)
 * - editor: Can create boards, only access boards they are added to
 * - viewer: Cannot create boards, only access boards they are added to
 * 
 * BOARD LEVEL:
 * - Board Owner (is_board_owner=true): Manage board members, change permissions
 * - edit: Can view + edit content, manage tasks
 * - view: Read-only access
 * 
 * LOGIC FLOW:
 * 1. Check if user is workspace owner → full access to all boards
 * 2. Check workspace role (editor can create boards)
 * 3. For board access: check board_members table
 * 4. Board creator gets is_board_owner flag automatically
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
  
  // Workspace owner always has edit on ALL boards
  if (await isWorkspaceOwner(userId, board.workspace_id)) {
    return 'edit';
  }
  
  // Check board membership (editor/viewer must be explicitly added)
  const permResult = await pool.query(
    `SELECT permission, is_board_owner FROM board_members WHERE board_id = $1 AND user_id = $2`,
    [boardId, userId]
  );
  
  if (permResult.rows.length === 0) {
    return null; // Not added to board
  }
  
  return permResult.rows[0].permission;
}

// Check if user is board owner (can manage members)
async function isBoardOwner(userId, boardId) {
  const result = await pool.query(
    `SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2 AND is_board_owner = TRUE`,
    [boardId, userId]
  );
  return result.rows.length > 0;
}

// Middleware: Require workspace membership
async function requireWorkspaceMember(req, res, next) {
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
}

// Middleware: Require workspace owner (only owner can manage workspace)
async function requireWorkspaceOwner(req, res, next) {
  const userId = req.user.id;
  const workspaceId = req.params.workspaceId || req.params.id || req.body.workspaceId;
  
  if (!workspaceId) {
    return res.status(400).json({ error: 'Workspace ID required' });
  }
  
  const isOwner = await isWorkspaceOwner(userId, workspaceId);
  
  if (!isOwner) {
    return res.status(403).json({ error: 'Only workspace owner can perform this action' });
  }
  
  req.workspaceRole = 'owner';
  next();
}

// Middleware: Require workspace editor or owner (can create boards)
async function requireWorkspaceEditor(req, res, next) {
  const userId = req.user.id;
  const workspaceId = req.params.workspaceId || req.body.workspaceId;
  
  if (!workspaceId) {
    return res.status(400).json({ error: 'Workspace ID required' });
  }
  
  const isOwner = await isWorkspaceOwner(userId, workspaceId);
  const role = await getWorkspaceRole(userId, workspaceId);
  
  if (!isOwner && role !== 'editor') {
    return res.status(403).json({ error: 'Requires editor or owner role' });
  }
  
  req.workspaceRole = isOwner ? 'owner' : role;
  next();
}

// Middleware: Require board edit permission
async function requireBoardEdit(req, res, next) {
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
}

// Middleware: Require board view permission (view or edit)
async function requireBoardView(req, res, next) {
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
}

// Middleware: Require board owner (can manage members - only for update/delete)
async function requireBoardOwner(req, res, next) {
  const userId = req.user.id;
  const boardId = req.params.boardId || req.params.id || req.body.boardId;
  
  if (!boardId) {
    return res.status(400).json({ error: 'Board ID required' });
  }
  
  // Get board's workspace
  const boardResult = await pool.query(
    'SELECT workspace_id FROM boards WHERE id = $1',
    [boardId]
  );
  
  if (boardResult.rows.length === 0) {
    return res.status(404).json({ error: 'Board not found' });
  }
  
  const workspaceId = boardResult.rows[0].workspace_id;
  
  // Workspace owner always has board owner rights
  const isWsOwner = await isWorkspaceOwner(userId, workspaceId);
  if (isWsOwner) {
    req.boardPermission = 'edit';
    req.isBoardOwner = true;
    req.workspaceId = workspaceId;
    return next();
  }
  
  // Check if board owner
  const isBOwner = await isBoardOwner(userId, boardId);
  if (!isBOwner) {
    return res.status(403).json({ error: 'Only board owner can perform this action' });
  }
  
  req.isBoardOwner = true;
  req.workspaceId = workspaceId;
  next();
}

// Middleware: Require board editor (can add members - board owner or editor role in workspace)
async function requireBoardEditor(req, res, next) {
  const userId = req.user.id;
  const boardId = req.params.boardId || req.params.id || req.body.boardId;
  
  if (!boardId) {
    return res.status(400).json({ error: 'Board ID required' });
  }
  
  // Get board's workspace
  const boardResult = await pool.query(
    'SELECT workspace_id FROM boards WHERE id = $1',
    [boardId]
  );
  
  if (boardResult.rows.length === 0) {
    return res.status(404).json({ error: 'Board not found' });
  }
  
  const workspaceId = boardResult.rows[0].workspace_id;
  
  // Workspace owner always allowed
  const isWsOwner = await isWorkspaceOwner(userId, workspaceId);
  if (isWsOwner) {
    req.boardPermission = 'edit';
    req.workspaceRole = 'owner';
    req.workspaceId = workspaceId;
    return next();
  }
  
  // Check workspace role
  const wsRole = await getWorkspaceRole(userId, workspaceId);
  
  // Editor role can add members to boards they have access to
  if (wsRole === 'editor') {
    // Check if user has access to this board
    const permission = await getBoardPermission(userId, boardId);
    if (permission) {
      req.boardPermission = permission;
      req.workspaceRole = wsRole;
      req.workspaceId = workspaceId;
      return next();
    }
  }
  
  // Check if board owner
  const isBOwner = await isBoardOwner(userId, boardId);
  if (isBOwner) {
    req.isBoardOwner = true;
    req.workspaceRole = wsRole;
    req.workspaceId = workspaceId;
    return next();
  }
  
  return res.status(403).json({ error: 'Only board owner or workspace editor can add members' });
}

module.exports = {
  isWorkspaceOwner,
  getWorkspaceRole,
  getBoardPermission,
  isBoardOwner,
  requireWorkspaceMember,
  requireWorkspaceOwner,
  requireWorkspaceEditor,
  requireBoardEdit,
  requireBoardView,
  requireBoardOwner,
  requireBoardEditor,
};
