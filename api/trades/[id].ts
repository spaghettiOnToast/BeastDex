import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, UpdateTradeData } from '../../src/lib/db';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Trade ID is required' });
  }

  try {
    if (req.method === 'GET') {
      // Get specific trade
      const result = await sql`
        SELECT * FROM trades WHERE id = ${id}
      `;

      if (result.length === 0) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      return res.status(200).json({ trade: parseTrade(result[0]) });
    }

    if (req.method === 'PUT') {
      // Update trade
      const updates = req.body as UpdateTradeData;
      const updateParts: string[] = [];
      const updateValues: any[] = [];

      // Build dynamic update query
      if (updates.account_b !== undefined) {
        updateParts.push(`account_b = $${updateValues.length + 1}`);
        updateValues.push(updates.account_b);
      }
      if (updates.offer_a !== undefined) {
        updateParts.push(`offer_a = $${updateValues.length + 1}`);
        updateValues.push(JSON.stringify(updates.offer_a));
      }
      if (updates.offer_b !== undefined) {
        updateParts.push(`offer_b = $${updateValues.length + 1}`);
        updateValues.push(JSON.stringify(updates.offer_b));
      }
      if (updates.offer_a_sent !== undefined) {
        updateParts.push(`offer_a_sent = $${updateValues.length + 1}`);
        updateValues.push(updates.offer_a_sent);
      }
      if (updates.offer_b_sent !== undefined) {
        updateParts.push(`offer_b_sent = $${updateValues.length + 1}`);
        updateValues.push(updates.offer_b_sent);
      }
      if (updates.status !== undefined) {
        updateParts.push(`status = $${updateValues.length + 1}`);
        updateValues.push(updates.status);
      }

      if (updateParts.length === 0) {
        return res.status(400).json({ error: 'No valid updates provided' });
      }

      updateParts.push(`updated_at = NOW()`);

      const result = await sql`
        UPDATE trades
        SET ${sql.unsafe(updateParts.join(', '))}
        WHERE id = ${id}
        RETURNING *
      `;

      if (result.length === 0) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      // Auto-complete trade if both sides have sent
      const trade = result[0];
      if (trade.offer_a_sent && trade.offer_b_sent && trade.status === 'OPEN') {
        const completeResult = await sql`
          UPDATE trades
          SET status = 'COMPLETE', updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;
        return res.status(200).json({ trade: parseTrade(completeResult[0]) });
      }

      return res.status(200).json({ trade: parseTrade(trade) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}