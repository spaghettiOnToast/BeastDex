// Migration script to update trades table
// Run this with: node scripts/migrate-trades.js

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

async function migrateDatabase() {
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

    console.log('📋 Updating trades table schema...');

    // Add new columns first
    await sql`
      ALTER TABLE trades
      ADD COLUMN IF NOT EXISTS trade_locked BOOLEAN NOT NULL DEFAULT FALSE
    `;

    await sql`
      ALTER TABLE trades
      ADD COLUMN IF NOT EXISTS account_b_accepted BOOLEAN DEFAULT NULL
    `;

    // Update existing 'OPEN' trades to 'DRAFT' before changing constraint
    await sql`
      UPDATE trades
      SET status = 'DRAFT'
      WHERE status = 'OPEN'
    `;

    // Update status enum to include new statuses
    await sql`
      ALTER TABLE trades
      DROP CONSTRAINT IF EXISTS trades_status_check
    `;

    await sql`
      ALTER TABLE trades
      ADD CONSTRAINT trades_status_check
      CHECK (status IN ('DRAFT', 'PENDING', 'ACCEPTED', 'COMPLETE', 'REJECTED', 'CANCELLED', 'EXPIRED'))
    `;

    // Update default status from 'OPEN' to 'DRAFT'
    await sql`
      ALTER TABLE trades
      ALTER COLUMN status SET DEFAULT 'DRAFT'
    `;

    console.log('✅ Migration completed successfully');

    // Show updated table structure
    const tableInfo = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'trades'
      ORDER BY ordinal_position
    `;

    console.log('📊 Updated table structure:');
    console.table(tableInfo);

    console.log('🎉 Database migration complete!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.log('\nError details:', error.message);
    process.exit(1);
  }
}

migrateDatabase();
