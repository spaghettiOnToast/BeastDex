import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../../src/lib/db';

// Helper function to parse trade JSON fields
function parseTrade(trade: any) {
  return {
    ...trade,
    offer_a: typeof trade.offer_a === 'string' ? JSON.parse(trade.offer_a) : (Array.isArray(trade.offer_a) ? trade.offer_a : []),
    offer_b: typeof trade.offer_b === 'string' ? JSON.parse(trade.offer_b) : (Array.isArray(trade.offer_b) ? trade.offer_b : []),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sql = getDb();
  const { id } = req.query;

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

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Trade ID is required' });
  }

  try {
    const { account } = req.body;

    if (!account) {
      return res.status(400).json({ error: 'account is required' });
    }

    // Get the trade first
    const tradeResult = await sql`
      SELECT * FROM trades WHERE id = ${id}
    `;

    if (tradeResult.length === 0) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    const trade = tradeResult[0];

    // Check if this account can join
    if (trade.account_a === account) {
      // Account A is already the creator
      return res.status(200).json({ trade: parseTrade(trade), message: 'You are the creator of this trade' });
    }

    if (trade.account_b && trade.account_b !== account) {
      return res.status(400).json({ error: 'This trade already has a counterparty' });
    }

    if (trade.account_b === account) {
      // Account is already the counterparty
      return res.status(200).json({ trade: parseTrade(trade), message: 'You are already part of this trade' });
    }

    // Join as account_b
    const result = await sql`
      UPDATE trades
      SET account_b = ${account}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    return res.status(200).json({ trade: parseTrade(result[0]), message: 'Successfully joined trade' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}