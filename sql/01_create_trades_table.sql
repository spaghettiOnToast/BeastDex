-- Friend-friend trade logger table
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_a TEXT NOT NULL,
  account_b TEXT,
  offer_a JSONB DEFAULT '[]'::jsonb,
  offer_b JSONB DEFAULT '[]'::jsonb,
  offer_a_sent BOOLEAN DEFAULT false,
  offer_b_sent BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'COMPLETE', 'EXPIRED', 'CANCELLED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_trades_account_a ON trades(account_a);
CREATE INDEX IF NOT EXISTS idx_trades_account_b ON trades(account_b);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at);

-- Trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_trades_updated_at
    BEFORE UPDATE ON trades
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();