const pool = require('../db/pool');
const { sendError } = require('./errorHandler');

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

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
  const workspaceId = req.params.workspaceId || req.params.id || req.body.workspaceId;
  
  if (!workspaceId) {
    return sendError(res, 400, 'Workspace ID required', 'REQUIRED_FIELD');
  }
  
  const role = await getWorkspaceRole(userId, workspaceId);
  
  if (!role) {
    return sendError(res, 403, 'Not a workspace member', 'FORBIDDEN');
  }
  
  req.workspaceRole = role;
  next();
}

// Middleware: Require workspace owner (only owner can manage workspace)
async function requireWorkspaceOwner(req, res, next) {
  const userId = req.user.id;
  const workspaceId = req.params.workspaceId || req.params.id || req.body.workspaceId;
  
  if (!workspaceId) {
    return sendError(res, 400, 'Workspace ID required', 'REQUIRED_FIELD');
  }
  
  const isOwner = await isWorkspaceOwner(userId, workspaceId);
  
  if (!isOwner) {
    return sendError(res, 403, 'Only workspace owner can perform this action', 'FORBIDDEN');
  }
  
  req.workspaceRole = 'owner';
  next();
}

// Middleware: Require workspace editor or owner (can create boards)
async function requireWorkspaceEditor(req, res, next) {
  const userId = req.user.id;
  const workspaceId = req.params.workspaceId || req.params.id || req.body.workspaceId;
  
  if (!workspaceId) {
    return sendError(res, 400, 'Workspace ID required', 'REQUIRED_FIELD');
  }
  
  const isOwner = await isWorkspaceOwner(userId, workspaceId);
  const role = await getWorkspaceRole(userId, workspaceId);
  
  if (!isOwner && role !== 'editor') {
    return sendError(res, 403, 'Requires editor or owner role', 'FORBIDDEN');
  }
  
  req.workspaceRole = isOwner ? 'owner' : role;
  next();
}

// Middleware: Require board edit permission
async function requireBoardEdit(req, res, next) {
  const userId = req.user.id;
  const boardId = req.params.boardId || req.params.id || req.body.boardId;
  
  if (!boardId) {
    return sendError(res, 400, 'Board ID required', 'REQUIRED_FIELD');
  }
  
  const permission = await getBoardPermission(userId, boardId);
  
  if (permission !== 'edit') {
    return sendError(res, 403, 'Edit permission required', 'FORBIDDEN');
  }
  
  req.boardPermission = permission;
  next();
}

// Middleware: Require board view permission (view or edit)
async function requireBoardView(req, res, next) {
  const userId = req.user.id;
  const boardId = req.params.boardId || req.params.id || req.body.boardId;
  
  if (!boardId) {
    return sendError(res, 400, 'Board ID required', 'REQUIRED_FIELD');
  }
  
  const permission = await getBoardPermission(userId, boardId);
  
  if (!permission) {
    return sendError(res, 403, 'Board access denied', 'FORBIDDEN');
  }
  
  req.boardPermission = permission;
  next();
}

// Middleware: Require board owner (can manage members - only for update/delete)
async function requireBoardOwner(req, res, next) {
  const userId = req.user.id;
  const boardId = req.params.boardId || req.params.id || req.body.boardId;
  
  if (!boardId) {
    return sendError(res, 400, 'Board ID required', 'REQUIRED_FIELD');
  }
  
  // Get board's workspace
  const boardResult = await pool.query(
    'SELECT workspace_id FROM boards WHERE id = $1',
    [boardId]
  );
  
  if (boardResult.rows.length === 0) {
    return sendError(res, 404, 'Board not found', 'BOARD_NOT_FOUND');
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
    return sendError(res, 403, 'Only board owner can perform this action', 'FORBIDDEN');
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
    return sendError(res, 400, 'Board ID required', 'REQUIRED_FIELD');
  }
  
  // Get board's workspace
  const boardResult = await pool.query(
    'SELECT workspace_id FROM boards WHERE id = $1',
    [boardId]
  );
  
  if (boardResult.rows.length === 0) {
    return sendError(res, 404, 'Board not found', 'BOARD_NOT_FOUND');
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
  
  return sendError(res, 403, 'Only board owner or workspace editor can add members', 'FORBIDDEN');
}

// Middleware: Require task edit permission (gets board_id from task)
async function requireTaskEdit(req, res, next) {
  const userId = req.user.id;
  const taskId = req.params.taskId;
  
  if (!taskId) {
    return sendError(res, 400, 'Task ID required', 'REQUIRED_FIELD');
  }
  
  try {
    // Get task's board_id
    const taskResult = await pool.query(
      'SELECT board_id FROM tasks WHERE id = $1',
      [taskId]
    );
    
    if (taskResult.rows.length === 0) {
      return sendError(res, 404, 'Task not found', 'TASK_NOT_FOUND');
    }
    
    const boardId = taskResult.rows[0].board_id;
    
    // Check board edit permission
    const permission = await getBoardPermission(userId, boardId);
    
    if (permission !== 'edit') {
      return sendError(res, 403, 'Edit permission required', 'FORBIDDEN');
    }
    
    req.boardPermission = permission;
    req.boardId = boardId; // Store for route handler
    next();
  } catch (err) {
    console.error('requireTaskEdit error:', err);
    return sendError(res, 500, 'Permission check failed', 'SERVER_ERROR');
  }
}

module.exports = {
  isWorkspaceOwner,
  getWorkspaceRole,
  getBoardPermission,
  isBoardOwner,
  requireWorkspaceMember: wrap(requireWorkspaceMember),
  requireWorkspaceOwner: wrap(requireWorkspaceOwner),
  requireWorkspaceEditor: wrap(requireWorkspaceEditor),
  requireBoardEdit: wrap(requireBoardEdit),
  requireBoardView: wrap(requireBoardView),
  requireBoardOwner: wrap(requireBoardOwner),
  requireBoardEditor: wrap(requireBoardEditor),
  requireTaskEdit: wrap(requireTaskEdit),
};
