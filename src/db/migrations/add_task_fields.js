/**
 * Migration: Add new fields to tasks table
 * 
 * This migration adds:
 * - assignee_id: UUID reference to users table (proper FK relationship)
 * - description: Task description/details  
 * - deadline: Task deadline
 * - priority: Task priority (low/medium/high/urgent)
 * - progress: Progress percentage (0-100)
 * - parent_id: For subtasks support
 * - labels: JSON array of labels/tags
 * - estimated_hours: Estimated time to complete
 * 
 * Run with: node src/db/migrations/add_task_fields.js
 */

require('dotenv').config();
const pool = require('../pool');

const migration = `
-- Add new columns to tasks table
ALTER TABLE tasks 
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS deadline TIMESTAMP,
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  ADD COLUMN IF NOT EXISTS parent_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS labels JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_hours FLOAT;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);

-- Add constraint to validate priority values
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_priority_check'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check 
      CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
  END IF;
END $$;

-- Update existing assignee names to assignee_id where possible
-- This tries to match existing assignee names to user names
UPDATE tasks t
SET assignee_id = u.id
FROM users u
WHERE t.assignee IS NOT NULL 
  AND t.assignee_id IS NULL
  AND LOWER(t.assignee) = LOWER(u.name);
`;

async function runMigration() {
  try {
    console.log('🔄 Running migration: add_task_fields...');
    await pool.query(migration);
    console.log('✅ Migration completed successfully');
    
    // Verify columns were added
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tasks' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Tasks table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
