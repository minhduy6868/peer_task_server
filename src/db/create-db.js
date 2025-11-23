require('dotenv').config();
const { Client } = require('pg');

async function createDatabase() {
  // Connect to postgres database (default)
  const client = new Client({
    user: 'postgres',
    password: 'postgres123',
    host: 'localhost',
    port: 5432,
    database: 'postgres', // Connect to default postgres database
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Check if database exists
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'peertask'"
    );

    if (result.rows.length === 0) {
      // Create database
      await client.query('CREATE DATABASE peertask');
      console.log('✅ Database "peertask" created successfully');
    } else {
      console.log('ℹ️  Database "peertask" already exists');
    }

    await client.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

createDatabase();
