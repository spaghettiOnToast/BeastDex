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
    const { account, txHash } = req.body;

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

    // Determine which side this account represents
    let updateField: string;
    if (trade.account_a === account) {
      updateField = 'offer_a_sent';
    } else if (trade.account_b === account) {
      updateField = 'offer_b_sent';
    } else {
      return res.status(400).json({ error: 'You are not part of this trade' });
    }

    // Update the sent status
    const result = await sql`
      UPDATE trades
      SET ${sql.unsafe(updateField)} = true, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    const updatedTrade = result[0];

    // Auto-complete trade if both sides have sent
    if (updatedTrade.offer_a_sent && updatedTrade.offer_b_sent && updatedTrade.status === 'OPEN') {
      const completeResult = await sql`
        UPDATE trades
        SET status = 'COMPLETE', updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      return res.status(200).json({
        trade: parseTrade(completeResult[0]),
        message: 'Trade completed!',
        txHash
      });
    }

    return res.status(200).json({
      trade: parseTrade(updatedTrade),
      message: 'Send confirmed',
      txHash
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}