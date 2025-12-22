const { Client } = require('pg');

// Supabase connection string
const DATABASE_URL = 'postgresql://postgres:Abc123456789@123@db.msrxixevwnytuagbhprm.supabase.co:5432/postgres';

const schema = `
-- =====================================================
-- PeerTask Database Schema
-- Description: Collaborative workspace and board management system
-- Version: 1.0.0
-- Date: 2024-12-02
-- =====================================================

-- =====================================================
-- USERS & AUTHENTICATION
-- =====================================================

-- Users table: Core user accounts
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  avatar TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Refresh tokens: JWT refresh token management
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Password reset tokens: Secure password recovery
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- WORKSPACES
-- =====================================================

-- Workspaces: Top-level organization containers
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Workspace members: User membership and roles
-- Roles:
--   'owner'  - Full control: manage workspace, all members, view/edit ALL boards
--   'editor' - Can create boards, only see boards they're added to
--   'viewer' - Cannot create boards, only see boards they're added to
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'viewer',
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- Workspace invites: Shareable invite tokens
CREATE TABLE IF NOT EXISTS workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id),
  expires_at TIMESTAMP,
  max_uses INTEGER,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- BOARDS & COLLABORATION
-- =====================================================

-- Boards: Collaborative workspaces within workspaces
CREATE TABLE IF NOT EXISTS boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Board members: Fine-grained board access control
-- Permissions:
--   'edit' - Can view + edit content, manage tasks
--   'view' - Can only view board content
-- is_board_owner: Board creator with member management rights
CREATE TABLE IF NOT EXISTS board_members (
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(50) DEFAULT 'view',
  is_board_owner BOOLEAN DEFAULT FALSE,
  added_at TIMESTAMP DEFAULT NOW(),
  added_by UUID REFERENCES users(id),
  PRIMARY KEY (board_id, user_id)
);

-- =====================================================
-- BOARD CONTENT
-- =====================================================

-- Tasks: Kanban board tasks with multiple assignees
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(255) PRIMARY KEY,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assignees UUID[] DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'todo',
  position INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Strokes: Canvas drawing data
CREATE TABLE IF NOT EXISTS strokes (
  id VARCHAR(255) PRIMARY KEY,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  points TEXT NOT NULL,
  color INTEGER NOT NULL,
  stroke_width FLOAT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- REAL-TIME SYNC & CRDT
-- =====================================================

-- Board operations: Operation-based CRDT log for real-time sync
CREATE TABLE IF NOT EXISTS board_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  operation_id VARCHAR(255) UNIQUE NOT NULL,
  operation_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  created_by UUID REFERENCES users(id),
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- User & Authentication indexes
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

-- Workspace indexes
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON workspace_invites(token);

-- Board indexes
CREATE INDEX IF NOT EXISTS idx_boards_workspace ON boards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_boards_created_by ON boards(created_by);
CREATE INDEX IF NOT EXISTS idx_board_members_user ON board_members(user_id);
CREATE INDEX IF NOT EXISTS idx_board_members_board ON board_members(board_id);

-- Content indexes
CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_strokes_board ON strokes(board_id);
CREATE INDEX IF NOT EXISTS idx_strokes_created_by ON strokes(created_by);

-- CRDT sync indexes
CREATE INDEX IF NOT EXISTS idx_board_operations_board ON board_operations(board_id);
CREATE INDEX IF NOT EXISTS idx_board_operations_timestamp ON board_operations(timestamp);
CREATE INDEX IF NOT EXISTS idx_board_operations_operation_id ON board_operations(operation_id);
CREATE INDEX IF NOT EXISTS idx_board_operations_type ON board_operations(operation_type);

-- =====================================================
-- TRIGGERS & FUNCTIONS
-- =====================================================

-- Auto-update updated_at timestamp for users
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workspaces_updated_at ON workspaces;
CREATE TRIGGER update_workspaces_updated_at 
    BEFORE UPDATE ON workspaces 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_boards_updated_at ON boards;
CREATE TRIGGER update_boards_updated_at 
    BEFORE UPDATE ON boards 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at 
    BEFORE UPDATE ON tasks 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
`;

async function deployToSupabase() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Supabase requires SSL
    }
  });

  try {
    console.log('🔗 Connecting to Supabase...');
    await client.connect();
    console.log('✅ Connected successfully!');

    console.log('🚀 Starting database migration...');
    console.log('📊 Creating tables, indexes, and triggers...');
    
    await client.query(schema);
    
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('📝 Created tables:');
    console.log('  ✓ users');
    console.log('  ✓ refresh_tokens');
    console.log('  ✓ password_reset_tokens');
    console.log('  ✓ workspaces');
    console.log('  ✓ workspace_members');
    console.log('  ✓ workspace_invites');
    console.log('  ✓ boards');
    console.log('  ✓ board_members');
    console.log('  ✓ tasks');
    console.log('  ✓ strokes');
    console.log('  ✓ board_operations');
    console.log('');
    console.log('🎯 Database is ready for production!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Update your .env file with the DATABASE_URL');
    console.log('2. Deploy your backend to Railway/Render');
    console.log('3. Test the connection');
    
  } catch (err) {
    console.error('❌ Migration failed!');
    console.error('Error:', err.message);
    console.error('');
    console.error('Full error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run the migration
deployToSupabase();
