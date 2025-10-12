import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if DATABASE_URL is available
    const databaseUrl = process.env.DATABASE_URL;
    const hasDatabase = !!databaseUrl;

    return res.status(200).json({
      status: hasDatabase ? 'available' : 'unavailable',
      database_configured: hasDatabase,
      message: hasDatabase
        ? 'Trading service is operational'
        : 'Database not configured. Trading features are disabled.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Status check error:', error);
    return res.status(500).json({
      status: 'error',
      database_configured: false,
      message: 'Unable to check trading service status',
      timestamp: new Date().toISOString()
    });
  }
}