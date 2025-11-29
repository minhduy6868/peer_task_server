// Script to clear all operations from the database
const pool = require('./src/db/pool');

async function clearOperations() {
  try {
    console.log('🗑️  Deleting all operations...');
    const result = await pool.query('DELETE FROM operations');
    console.log(`✅ Deleted ${result.rowCount} operations`);
    
    console.log('🔄 Resetting sequence...');
    await pool.query('ALTER SEQUENCE operations_id_seq RESTART WITH 1');
    console.log('✅ Sequence reset');
    
    const count = await pool.query('SELECT COUNT(*) FROM operations');
    console.log(`📊 Remaining operations: ${count.rows[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing operations:', error);
    process.exit(1);
  }
}

clearOperations();
