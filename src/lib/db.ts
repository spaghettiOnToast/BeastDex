import { neon } from '@neondatabase/serverless';

let sql: ReturnType<typeof neon> | null = null;

export function getDb() {
  if (!sql) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    sql = neon(databaseUrl);
  }
  return sql;
}

export type Trade = {
  id: string;
  account_a: string;
  account_b: string | null;
  offer_a: string[]; // Array of token IDs
  offer_b: string[]; // Array of token IDs
  offer_a_sent: boolean;
  offer_b_sent: boolean;
  status: 'DRAFT' | 'PENDING' | 'ACCEPTED' | 'COMPLETE' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  trade_locked: boolean;
  account_b_accepted: boolean | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export type CreateTradeData = {
  account_a: string;
  account_b?: string;
  offer_a?: string[];
  offer_b?: string[];
};

export type UpdateTradeData = {
  account_b?: string;
  offer_a?: string[];
  offer_b?: string[];
  offer_a_sent?: boolean;
  offer_b_sent?: boolean;
  status?: Trade['status'];
  trade_locked?: boolean;
  account_b_accepted?: boolean | null;
};