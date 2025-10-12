import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../src/lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getDb();

    // Create trades table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        account_a TEXT NOT NULL,
        account_b TEXT,
        offer_a TEXT NOT NULL DEFAULT '[]',
        offer_b TEXT NOT NULL DEFAULT '[]',
        offer_a_sent BOOLEAN NOT NULL DEFAULT FALSE,
        offer_b_sent BOOLEAN NOT NULL DEFAULT FALSE,
        status TEXT NOT NULL DEFAULT 'OPEN',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
      )
    `;

    return res.status(200).json({
      message: 'Database initialized successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database initialization error:', error);
    return res.status(500).json({
      error: 'Failed to initialize database',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}