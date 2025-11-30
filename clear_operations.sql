-- Clear all board operations from database
-- Run this in PostgreSQL to start fresh

-- Delete all operations
DELETE FROM board_operations;

-- Verify
SELECT COUNT(*) as total_operations FROM board_operations;
