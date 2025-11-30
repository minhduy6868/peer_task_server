-- Clear all operations to start fresh
-- Run this in PostgreSQL to reset the whiteboard

DELETE FROM board_operations;

-- Reset sequence if needed
-- ALTER SEQUENCE board_operations_id_seq RESTART WITH 1;

-- Verify
SELECT COUNT(*) as total_operations FROM board_operations;
