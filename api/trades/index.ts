import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, CreateTradeData } from '../../src/lib/db';
import { v4 as uuidv4 } from 'uuid';

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

      return res.status(201).json({ trade: result[0] });
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

      return res.status(200).json({ trades });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}