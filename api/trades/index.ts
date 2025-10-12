import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, CreateTradeData } from '../../src/lib/db';
import { v4 as uuidv4 } from 'uuid';

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

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    if (req.method === 'POST') {
      // Create new trade
      const { account_a, offer_a = [], offer_b = [] } = req.body as CreateTradeData;

      if (!account_a) {
        return res.status(400).json({ error: 'account_a is required' });
      }

      const tradeId = uuidv4();
      const result = await sql`
        INSERT INTO trades (id, account_a, offer_a, offer_b)
        VALUES (${tradeId}, ${account_a}, ${JSON.stringify(offer_a)}, ${JSON.stringify(offer_b)})
        RETURNING *
      `;

      return res.status(201).json({ trade: parseTrade(result[0]) });
    }

    if (req.method === 'GET') {
      // Get trades for a specific account
      const { account } = req.query;

      if (!account || typeof account !== 'string') {
        return res.status(400).json({ error: 'account parameter is required' });
      }

      const trades = await sql`
        SELECT * FROM trades
        WHERE account_a = ${account} OR account_b = ${account}
        ORDER BY created_at DESC
        LIMIT 50
      `;

      // Parse JSON fields for all trades
      const parsedTrades = Array.isArray(trades) ? trades.map((trade: any) => parseTrade(trade)) : [];

      return res.status(200).json({ trades: parsedTrades });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}