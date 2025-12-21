require('dotenv').config();
const pool = require('../src/db/pool');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function resetDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('⚠️  WARNING: This will delete ALL data in the database!\n');
    
    const answer = await question('Type "RESET" to confirm: ');
    
    if (answer !== 'RESET') {
      console.log('❌ Reset cancelled.');
      process.exit(0);
    }

    console.log('\n🔄 Resetting database...\n');

    // Drop all tables in reverse dependency order
    console.log('1️⃣ Dropping tables...');
    await client.query('BEGIN');
    
    const dropTables = [
      'board_operations',
      'strokes',
      'tasks',
      'board_members',
      'boards',
      'workspace_invites',
      'workspace_members',
      'workspaces',
      'password_reset_tokens',
      'refresh_tokens',
      'users'
    ];

    for (const table of dropTables) {
      await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      console.log(`   ✅ Dropped ${table}`);
    }

    // Drop functions
    await client.query('DROP FUNCTION IF EXISTS update_updated_at_column CASCADE');
    console.log('   ✅ Dropped functions');

    await client.query('COMMIT');
    
    console.log('\n2️⃣ Running migration to recreate schema...');
    client.release();
    await pool.end();
    
    // Run migration
    const { exec } = require('child_process');
    exec('npm run db:migrate', (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
      }
      console.log(stdout);
      console.log('\n✅ Database reset complete!');
      console.log('📝 All tables have been recreated with fresh schema.');
      process.exit(0);
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error resetting database:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

resetDatabase();
