// Script to clear all board operations from the database
const pool = require('./src/db/pool');

async function clearOperations() {
  try {
    console.log('🗑️  Deleting all board operations...');
    const result = await pool.query('DELETE FROM board_operations');
    console.log(`✅ Deleted ${result.rowCount} operations`);
    
    const count = await pool.query('SELECT COUNT(*) FROM board_operations');
    console.log(`📊 Remaining operations: ${count.rows[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing operations:', error);
    process.exit(1);
  }
}

clearOperations();
