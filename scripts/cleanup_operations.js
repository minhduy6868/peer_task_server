require('dotenv').config();
const pool = require('../src/db/pool');

async function cleanupOperations() {
  const client = await pool.connect();
  
  try {
    console.log('🧹 Cleaning up old board operations...\n');

    // Count before cleanup
    const beforeCount = await client.query('SELECT COUNT(*) FROM board_operations');
    console.log(`📊 Current operations: ${beforeCount.rows[0].count}`);

    await client.query('BEGIN');

    // 1. Remove operations older than 30 days
    console.log('\n1️⃣ Removing operations older than 30 days...');
    const oldOps = await client.query(`
      DELETE FROM board_operations 
      WHERE created_at < NOW() - INTERVAL '30 days'
      RETURNING id
    `);
    console.log(`   ✅ Removed ${oldOps.rowCount} old operations`);

    // 2. Clean up duplicate stroke operations (keep only latest)
    console.log('\n2️⃣ Cleaning up duplicate stroke updates...');
    const strokeCleanup = await client.query(`
      WITH stroke_ops AS (
        SELECT 
          id,
          operation_id,
          payload->>'id' as object_id,
          operation_type,
          timestamp,
          ROW_NUMBER() OVER (
            PARTITION BY payload->>'id' 
            ORDER BY timestamp DESC
          ) as rn
        FROM board_operations
        WHERE payload->>'type' = 'stroke' 
        AND operation_type = 'updateObject'
      )
      DELETE FROM board_operations
      WHERE id IN (
        SELECT id FROM stroke_ops WHERE rn > 1
      )
      RETURNING id
    `);
    console.log(`   ✅ Removed ${strokeCleanup.rowCount} duplicate stroke updates`);

    // 3. Clean up orphaned operations (boards that don't exist)
    console.log('\n3️⃣ Removing orphaned operations...');
    const orphaned = await client.query(`
      DELETE FROM board_operations 
      WHERE board_id NOT IN (SELECT id FROM boards)
      RETURNING id
    `);
    console.log(`   ✅ Removed ${orphaned.rowCount} orphaned operations`);

    await client.query('COMMIT');

    // Count after cleanup
    const afterCount = await client.query('SELECT COUNT(*) FROM board_operations');
    const removed = beforeCount.rows[0].count - afterCount.rows[0].count;
    
    console.log('\n📊 Summary:');
    console.log(`   Before: ${beforeCount.rows[0].count} operations`);
    console.log(`   After:  ${afterCount.rows[0].count} operations`);
    console.log(`   Removed: ${removed} operations`);

    // Vacuum analyze
    console.log('\n4️⃣ Optimizing database...');
    await client.query('VACUUM ANALYZE board_operations');
    console.log('   ✅ Database optimized');

    console.log('\n✅ Cleanup completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupOperations()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
