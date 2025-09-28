import type { Trade, CreateTradeData, UpdateTradeData } from '../lib/db';

const API_BASE = '';  // Since we're using Vercel API routes on the same domain

export async function createTrade(data: CreateTradeData): Promise<{ trade: Trade }> {
  const response = await fetch('/api/trades', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create trade');
  }

  return response.json();
}

export async function getTrade(id: string): Promise<{ trade: Trade }> {
  const response = await fetch(`/api/trades/${id}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get trade');
  }

  return response.json();
}

export async function updateTrade(id: string, data: UpdateTradeData): Promise<{ trade: Trade }> {
  const response = await fetch(`/api/trades/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update trade');
  }

  return response.json();
}

export async function joinTrade(id: string, account: string): Promise<{ trade: Trade; message: string }> {
  const response = await fetch(`/api/trades/${id}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ account }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to join trade');
  }

  return response.json();
}

export async function sendOffer(
  id: string,
  account: string,
  txHash?: string
): Promise<{ trade: Trade; message: string; txHash?: string }> {
  const response = await fetch(`/api/trades/${id}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ account, txHash }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to send offer');
  }

  return response.json();
}

export async function getMyTrades(account: string): Promise<{ trades: Trade[] }> {
  const response = await fetch(`/api/trades?account=${encodeURIComponent(account)}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get trades');
  }

  return response.json();
}