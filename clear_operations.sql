-- Clear all old operations from database
-- Run this in MySQL/PostgreSQL to start fresh

-- Delete all operations
DELETE FROM operations;

-- Reset auto-increment (optional)
ALTER TABLE operations AUTO_INCREMENT = 1;

-- Verify
SELECT COUNT(*) as total_operations FROM operations;
