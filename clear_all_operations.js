require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function clearAllOperations() {
  try {
    console.log('🗑️  Clearing all operations...');
    
    const result = await pool.query('DELETE FROM board_operations');
    console.log(`✅ Deleted ${result.rowCount} operations`);
    
    const countResult = await pool.query('SELECT COUNT(*) FROM board_operations');
    console.log(`📊 Remaining operations: ${countResult.rows[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

clearAllOperations();
