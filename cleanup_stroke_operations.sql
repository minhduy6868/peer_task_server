-- Clean up intermediate stroke updates, keep only final states
-- This script removes redundant updateObject operations for strokes

-- Step 1: Identify operations to keep (createObject and final updateObject for each stroke)
WITH stroke_ops AS (
  SELECT 
    opid,
    payload->>'id' as object_id,
    operation_type,
    timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY payload->>'id' 
      ORDER BY timestamp DESC
    ) as rn
  FROM board_operations
  WHERE payload->>'type' = 'stroke'
),
ops_to_keep AS (
  -- Keep createObject for all strokes
  SELECT opid FROM board_operations 
  WHERE operation_type = 'createObject' AND payload->>'type' = 'stroke'
  
  UNION
  
  -- Keep only the last updateObject for each stroke
  SELECT opid FROM stroke_ops 
  WHERE operation_type = 'updateObject' AND rn = 1
),
ops_to_delete AS (
  SELECT opid FROM board_operations
  WHERE 
    operation_type = 'updateObject' 
    AND payload->>'type' = 'stroke'
    AND opid NOT IN (SELECT opid FROM ops_to_keep)
)
-- Delete intermediate updates
DELETE FROM board_operations
WHERE opid IN (SELECT opid FROM ops_to_delete);

-- Report
SELECT 
  COUNT(*) FILTER (WHERE operation_type = 'createObject') as create_ops,
  COUNT(*) FILTER (WHERE operation_type = 'updateObject') as update_ops,
  COUNT(*) FILTER (WHERE operation_type = 'deleteObject') as delete_ops,
  COUNT(*) as total_ops
FROM board_operations
WHERE payload->>'type' = 'stroke';
