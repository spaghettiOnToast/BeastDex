import type { Trade, CreateTradeData, UpdateTradeData } from '../lib/db';

export async function createTrade(data: CreateTradeData): Promise<{ trade: Trade }> {
  try {
    const response = await fetch('/api/trades', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to create trade';
      try {
        const responseText = await response.text();
        console.error('API Error Response:', responseText);

        // Try to parse as JSON first
        try {
          const error = JSON.parse(responseText);
          errorMessage = error.error || errorMessage;
        } catch (jsonError) {
          // If not JSON, use the text as error message
          errorMessage = responseText || `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (textError) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Unable to connect to trading service. Please check your connection.');
    }
    throw error;
  }
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

  const result = await response.json();
  // Ensure arrays are properly initialized
  if (result.trade) {
    result.trade.offer_a = Array.isArray(result.trade.offer_a) ? result.trade.offer_a : [];
    result.trade.offer_b = Array.isArray(result.trade.offer_b) ? result.trade.offer_b : [];
  }
  return result;
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
  try {
    const response = await fetch(`/api/trades?account=${encodeURIComponent(account)}`);

    if (!response.ok) {
      let errorMessage = 'Failed to get trades';
      try {
        const responseText = await response.text();
        console.error('API Error Response:', responseText);

        // Try to parse as JSON first
        try {
          const error = JSON.parse(responseText);
          errorMessage = error.error || errorMessage;
        } catch (jsonError) {
          // If not JSON, use the text as error message
          errorMessage = responseText || `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (textError) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Unable to connect to trading service. Please try again later.');
    }
    throw error;
  }
}

export async function cancelTrade(id: string): Promise<{ trade: Trade; message: string }> {
  const response = await fetch(`/api/trades/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'CANCELLED' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to cancel trade');
  }

  return response.json();
}

export async function lockTrade(id: string): Promise<{ trade: Trade }> {
  const response = await fetch(`/api/trades/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trade_locked: true, status: 'PENDING' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to lock trade');
  }

  const result = await response.json();
  if (result.trade) {
    result.trade.offer_a = Array.isArray(result.trade.offer_a) ? result.trade.offer_a : [];
    result.trade.offer_b = Array.isArray(result.trade.offer_b) ? result.trade.offer_b : [];
  }
  return result;
}

export async function acceptTrade(id: string): Promise<{ trade: Trade }> {
  const response = await fetch(`/api/trades/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ account_b_accepted: true, status: 'ACCEPTED' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to accept trade');
  }

  const result = await response.json();
  if (result.trade) {
    result.trade.offer_a = Array.isArray(result.trade.offer_a) ? result.trade.offer_a : [];
    result.trade.offer_b = Array.isArray(result.trade.offer_b) ? result.trade.offer_b : [];
  }
  return result;
}

export async function rejectTrade(id: string): Promise<{ trade: Trade }> {
  const response = await fetch(`/api/trades/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ account_b_accepted: false, status: 'REJECTED' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to reject trade');
  }

  const result = await response.json();
  if (result.trade) {
    result.trade.offer_a = Array.isArray(result.trade.offer_a) ? result.trade.offer_a : [];
    result.trade.offer_b = Array.isArray(result.trade.offer_b) ? result.trade.offer_b : [];
  }
  return result;
}

export async function deleteTrade(id: string): Promise<{ message: string; id: string }> {
  const response = await fetch(`/api/trades/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete trade');
  }

  return response.json();
}