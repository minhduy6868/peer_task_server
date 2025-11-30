const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'peertask',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123', // Match .env
});

async function cleanupStrokeOperations() {
  const client = await pool.connect();
  
  try {
    console.log('🧹 Starting cleanup of intermediate stroke operations...\n');
    
    // Get initial count
    const beforeCount = await client.query(`
      SELECT COUNT(*) as count 
      FROM board_operations 
      WHERE operation_type = 'updateObject' AND payload->>'type' = 'stroke'
    `);
    console.log(`📊 Before: ${beforeCount.rows[0].count} stroke updateObject operations\n`);
    
    // Delete intermediate updates (keep only last update for each stroke)
    const result = await client.query(`
      WITH stroke_ops AS (
        SELECT 
          id,
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
        SELECT id FROM board_operations 
        WHERE operation_type = 'createObject' AND payload->>'type' = 'stroke'
        
        UNION
        
        -- Keep only the last updateObject for each stroke
        SELECT id FROM stroke_ops 
        WHERE operation_type = 'updateObject' AND rn = 1
      ),
      ops_to_delete AS (
        SELECT id FROM board_operations
        WHERE 
          operation_type = 'updateObject' 
          AND payload->>'type' = 'stroke'
          AND id NOT IN (SELECT id FROM ops_to_keep)
      )
      DELETE FROM board_operations
      WHERE id IN (SELECT id FROM ops_to_delete)
      RETURNING id
    `);
    
    console.log(`✅ Deleted ${result.rowCount} intermediate stroke operations\n`);
    
    // Get final count
    const afterCount = await client.query(`
      SELECT COUNT(*) as count 
      FROM board_operations 
      WHERE operation_type = 'updateObject' AND payload->>'type' = 'stroke'
    `);
    console.log(`📊 After: ${afterCount.rows[0].count} stroke updateObject operations\n`);
    
    // Summary
    const summary = await client.query(`
      SELECT 
        payload->>'type' as object_type,
        operation_type,
        COUNT(*) as count
      FROM board_operations
      GROUP BY payload->>'type', operation_type
      ORDER BY object_type, operation_type
    `);
    
    console.log('📈 Summary by object type and operation:');
    console.table(summary.rows);
    
    // Total operations
    const total = await client.query('SELECT COUNT(*) as count FROM board_operations');
    console.log(`\n📦 Total operations in database: ${total.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupStrokeOperations();
