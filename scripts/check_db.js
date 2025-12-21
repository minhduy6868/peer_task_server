require('dotenv').config();
const pool = require('../src/db/pool');

async function checkDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking database connection and schema...\n');

    // Test connection
    console.log('1️⃣ Testing database connection...');
    const connResult = await client.query('SELECT NOW()');
    console.log('✅ Connected successfully at:', connResult.rows[0].now);

    // Check tables
    console.log('\n2️⃣ Checking tables...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    if (tablesResult.rows.length === 0) {
      console.log('⚠️  No tables found. Run: npm run db:migrate');
    } else {
      console.log('📊 Found tables:');
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    }

    // Check users table
    console.log('\n3️⃣ Checking users table structure...');
    const columnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    if (columnsResult.rows.length > 0) {
      console.log('👤 Users table columns:');
      columnsResult.rows.forEach(row => {
        const nullable = row.is_nullable === 'YES' ? '(nullable)' : '(required)';
        console.log(`   - ${row.column_name}: ${row.data_type} ${nullable}`);
      });
    }

    // Count records
    console.log('\n4️⃣ Counting records...');
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM workspaces) as workspaces,
        (SELECT COUNT(*) FROM boards) as boards,
        (SELECT COUNT(*) FROM tasks) as tasks,
        (SELECT COUNT(*) FROM board_operations) as operations
    `);
    
    if (counts.rows[0]) {
      console.log('📈 Record counts:');
      Object.entries(counts.rows[0]).forEach(([table, count]) => {
        console.log(`   - ${table}: ${count}`);
      });
    }

    console.log('\n✅ Database check completed!');
    
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
    console.error('\nPossible issues:');
    console.error('  - Database connection string incorrect in .env');
    console.error('  - Database does not exist');
    console.error('  - PostgreSQL server not running');
    console.error('  - Network/firewall issues');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

checkDatabase()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
