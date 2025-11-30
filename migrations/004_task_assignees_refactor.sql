-- Migration: Refactor tasks table for multiple assignees
-- Date: 2024
-- Description: 
--   - Remove single assignee fields (assignee, assignee_id)
--   - Remove progress tracking field
--   - Add assignees array field for multiple user assignments

-- Step 1: Add new assignees column (UUID array)
ALTER TABLE tasks 
ADD COLUMN assignees UUID[] DEFAULT '{}';

-- Step 2: Migrate existing assignee_id data to assignees array
-- (Only if you have existing data to preserve)
UPDATE tasks 
SET assignees = ARRAY[assignee_id]
WHERE assignee_id IS NOT NULL;

-- Step 3: Drop old columns
ALTER TABLE tasks 
DROP COLUMN IF EXISTS assignee,
DROP COLUMN IF EXISTS assignee_id,
DROP COLUMN IF EXISTS progress;

-- Verify migration
SELECT 
  id, 
  title, 
  assignees,
  ARRAY_LENGTH(assignees, 1) as assignee_count
FROM tasks
LIMIT 5;
