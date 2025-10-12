// Database initialization script
// Run this with: node scripts/init-db.js

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

async function initializeDatabase() {
  try {
    // Load environment variables
    dotenv.config({ path: '.env.local' });

    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.error('❌ DATABASE_URL environment variable is not set');
      console.log('Please add your Neon database URL to .env.local file');
      process.exit(1);
    }

    console.log('🔧 Connecting to database...');
    const sql = neon(databaseUrl);

    console.log('📋 Creating trades table...');

    // Create trades table
    await sql`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        account_a TEXT NOT NULL,
        account_b TEXT,
        offer_a TEXT NOT NULL DEFAULT '[]',
        offer_b TEXT NOT NULL DEFAULT '[]',
        offer_a_sent BOOLEAN NOT NULL DEFAULT FALSE,
        offer_b_sent BOOLEAN NOT NULL DEFAULT FALSE,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'COMPLETE', 'EXPIRED', 'CANCELLED')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
      )
    `;

    console.log('✅ Trades table created successfully');

    // Check if table exists and show structure
    const tableInfo = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'trades'
      ORDER BY ordinal_position
    `;

    console.log('📊 Table structure:');
    console.table(tableInfo);

    console.log('🎉 Database initialization complete!');
    console.log('You can now test the trading functionality.');

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    console.log('\nTroubleshooting:');
    console.log('1. Check that your DATABASE_URL is correct');
    console.log('2. Ensure your Neon database is running');
    console.log('3. Verify the connection string includes ?sslmode=require');
    process.exit(1);
  }
}

initializeDatabase();