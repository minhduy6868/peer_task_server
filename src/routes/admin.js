// Admin route to clear all operations
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.delete('/clear', async (req, res) => {
  try {
    console.log('🗑️  Clearing all operations...');
    const result = await pool.query('DELETE FROM operations');
    console.log(`✅ Deleted ${result.rowCount} operations`);
    
    const count = await pool.query('SELECT COUNT(*) FROM operations');
    
    res.json({
      success: true,
      deleted: result.rowCount,
      remaining: parseInt(count.rows[0].count)
    });
  } catch (error) {
    console.error('❌ Error clearing operations:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
