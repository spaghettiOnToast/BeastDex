import express from 'express';
import cors from 'cors';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const sql = neon(process.env.DATABASE_URL);

// Helper function to parse trade JSON fields
function parseTrade(trade) {
  return {
    ...trade,
    offer_a: typeof trade.offer_a === 'string' ? JSON.parse(trade.offer_a) : (Array.isArray(trade.offer_a) ? trade.offer_a : []),
    offer_b: typeof trade.offer_b === 'string' ? JSON.parse(trade.offer_b) : (Array.isArray(trade.offer_b) ? trade.offer_b : []),
  };
}

// API Routes
app.get('/api/trades/status', async (req, res) => {
  try {
    const hasDatabase = !!process.env.DATABASE_URL;
    res.json({
      status: hasDatabase ? 'available' : 'unavailable',
      database_configured: hasDatabase,
      message: hasDatabase
        ? 'Trading service is operational'
        : 'Database not configured. Trading features are disabled.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      status: 'error',
      database_configured: false,
      message: 'Unable to check trading service status',
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/trades', async (req, res) => {
  try {
    const { account_a, account_b = null, offer_a = [], offer_b = [] } = req.body;

    if (!account_a) {
      return res.status(400).json({ error: 'account_a is required' });
    }

    const tradeId = uuidv4();
    const result = await sql`
      INSERT INTO trades (id, account_a, account_b, offer_a, offer_b, status)
      VALUES (${tradeId}, ${account_a}, ${account_b}, ${JSON.stringify(offer_a)}, ${JSON.stringify(offer_b)}, 'DRAFT')
      RETURNING *
    `;

    return res.status(201).json({ trade: parseTrade(result[0]) });
  } catch (error) {
    console.error('Create trade error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/trades', async (req, res) => {
  try {
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

    const parsedTrades = Array.isArray(trades) ? trades.map(trade => parseTrade(trade)) : [];

    return res.status(200).json({ trades: parsedTrades });
  } catch (error) {
    console.error('Get trades error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/trades/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await sql`
      SELECT * FROM trades WHERE id = ${id}
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    return res.status(200).json({ trade: parseTrade(result[0]) });
  } catch (error) {
    console.error('Get trade error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/trades/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const setParts = [];
    const values = [];

    if (updates.account_b !== undefined) {
      setParts.push(`account_b = $${setParts.length + 1}`);
      values.push(updates.account_b);
    }
    if (updates.offer_a !== undefined) {
      setParts.push(`offer_a = $${setParts.length + 1}`);
      values.push(JSON.stringify(updates.offer_a));
    }
    if (updates.offer_b !== undefined) {
      setParts.push(`offer_b = $${setParts.length + 1}`);
      values.push(JSON.stringify(updates.offer_b));
    }
    if (updates.offer_a_sent !== undefined) {
      setParts.push(`offer_a_sent = $${setParts.length + 1}`);
      values.push(updates.offer_a_sent);
    }
    if (updates.offer_b_sent !== undefined) {
      setParts.push(`offer_b_sent = $${setParts.length + 1}`);
      values.push(updates.offer_b_sent);
    }
    if (updates.status !== undefined) {
      setParts.push(`status = $${setParts.length + 1}`);
      values.push(updates.status);
    }
    if (updates.trade_locked !== undefined) {
      setParts.push(`trade_locked = $${setParts.length + 1}`);
      values.push(updates.trade_locked);
    }
    if (updates.account_b_accepted !== undefined) {
      setParts.push(`account_b_accepted = $${setParts.length + 1}`);
      values.push(updates.account_b_accepted);
    }

    if (setParts.length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    setParts.push('updated_at = NOW()');

    // Build SQL query with dynamic values
    let query = 'UPDATE trades SET ';
    let paramIndex = 1;

    if (updates.account_b !== undefined) {
      query += `account_b = $${paramIndex++}, `;
    }
    if (updates.offer_a !== undefined) {
      query += `offer_a = $${paramIndex++}, `;
    }
    if (updates.offer_b !== undefined) {
      query += `offer_b = $${paramIndex++}, `;
    }
    if (updates.offer_a_sent !== undefined) {
      query += `offer_a_sent = $${paramIndex++}, `;
    }
    if (updates.offer_b_sent !== undefined) {
      query += `offer_b_sent = $${paramIndex++}, `;
    }
    if (updates.status !== undefined) {
      query += `status = $${paramIndex++}, `;
    }
    if (updates.trade_locked !== undefined) {
      query += `trade_locked = $${paramIndex++}, `;
    }
    if (updates.account_b_accepted !== undefined) {
      query += `account_b_accepted = $${paramIndex++}, `;
    }

    query += `updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;

    const result = await sql.query(query, [...values, id]);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    // Auto-complete trade if both sides have sent
    const trade = result[0];
    if (trade.offer_a_sent && trade.offer_b_sent && trade.status === 'ACCEPTED') {
      const completeResult = await sql`
        UPDATE trades
        SET status = 'COMPLETE', updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return res.status(200).json({ trade: parseTrade(completeResult[0]) });
    }

    return res.status(200).json({ trade: parseTrade(trade) });
  } catch (error) {
    console.error('Update trade error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/trades/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const { account } = req.body;

    if (!account) {
      return res.status(400).json({ error: 'account is required' });
    }

    const result = await sql`
      UPDATE trades
      SET account_b = ${account}, updated_at = NOW()
      WHERE id = ${id} AND account_b IS NULL
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Trade not found or already has participant' });
    }

    return res.status(200).json({
      trade: parseTrade(result[0]),
      message: 'Successfully joined trade'
    });
  } catch (error) {
    console.error('Join trade error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/trades/:id/send', async (req, res) => {
  try {
    const { id } = req.params;
    const { account, txHash } = req.body;

    if (!account) {
      return res.status(400).json({ error: 'account is required' });
    }

    // Determine which offer to update based on account
    const trade = await sql`SELECT * FROM trades WHERE id = ${id}`;
    if (trade.length === 0) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    const isAccountA = trade[0].account_a === account;
    const isAccountB = trade[0].account_b === account;

    if (!isAccountA && !isAccountB) {
      return res.status(403).json({ error: 'Not authorized for this trade' });
    }

    const result = await sql`
      UPDATE trades
      SET ${isAccountA ? 'offer_a_sent' : 'offer_b_sent'} = true, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    return res.status(200).json({
      trade: parseTrade(result[0]),
      message: 'Offer sent successfully',
      txHash
    });
  } catch (error) {
    console.error('Send offer error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/trades/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await sql`
      DELETE FROM trades WHERE id = ${id}
      RETURNING id
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    return res.status(200).json({
      message: 'Trade deleted successfully',
      id: result[0].id
    });
  } catch (error) {
    console.error('Delete trade error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Development API server running on http://localhost:${port}`);
  console.log(`📊 Trading endpoints available at http://localhost:${port}/api/trades`);
});