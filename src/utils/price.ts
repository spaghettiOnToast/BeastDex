/**
 * Price formatting utilities for marketplace
 * Converts from wei/smallest units to human-readable format
 */

// Standard token decimals
export const TOKEN_DECIMALS: Record<string, number> = {
  STRK: 18,
  LORDS: 18,
  ETH: 18,
};

/**
 * Convert from wei (smallest unit) to human-readable format
 * @param weiAmount - Amount in wei as string or bigint
 * @param decimals - Number of decimals for the token (default: 18)
 * @returns Formatted string with appropriate decimal places
 */
export function fromWei(weiAmount: string | bigint, decimals: number = 18): string {
  try {
    const amount = typeof weiAmount === 'string' ? BigInt(weiAmount) : weiAmount;

    // Handle zero
    if (amount === 0n) {
      return '0';
    }

    // Convert to number for display
    const divisor = 10n ** BigInt(decimals);
    const wholePart = amount / divisor;
    const fractionalPart = amount % divisor;

    if (fractionalPart === 0n) {
      return wholePart.toString();
    }

    // Format fractional part with appropriate precision
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');

    // Remove trailing zeros
    const trimmed = fractionalStr.replace(/0+$/, '');

    // Limit to 4 decimal places for display
    const displayFractional = trimmed.slice(0, 4);

    return `${wholePart}.${displayFractional}`;
  } catch (error) {
    console.error('Error converting from wei:', error);
    return '0';
  }
}

/**
 * Convert to wei (smallest unit) from human-readable format
 * @param amount - Amount as string or number
 * @param decimals - Number of decimals for the token (default: 18)
 * @returns Amount in wei as bigint
 */
export function toWei(amount: string | number, decimals: number = 18): bigint {
  try {
    const amountStr = typeof amount === 'number' ? amount.toString() : amount;

    // Handle zero
    if (amountStr === '0' || amountStr === '') {
      return 0n;
    }

    // Split into whole and fractional parts
    const [whole = '0', fractional = '0'] = amountStr.split('.');

    // Pad fractional part to decimals length
    const paddedFractional = fractional.padEnd(decimals, '0').slice(0, decimals);

    // Combine and convert to bigint
    const weiStr = whole + paddedFractional;
    return BigInt(weiStr);
  } catch (error) {
    console.error('Error converting to wei:', error);
    return 0n;
  }
}

/**
 * Format price for display with token symbol
 * @param weiAmount - Amount in wei
 * @param tokenSymbol - Token symbol (e.g., 'STRK', 'LORDS', 'ETH')
 * @returns Formatted price string like "1.5 STRK"
 */
export function formatPrice(weiAmount: string | bigint, tokenSymbol: string = 'STRK'): string {
  const decimals = TOKEN_DECIMALS[tokenSymbol.toUpperCase()] ?? 18;
  const humanReadable = fromWei(weiAmount, decimals);

  return tokenSymbol ? `${humanReadable} ${tokenSymbol}` : humanReadable;
}

/**
 * Format price with compact notation for large numbers
 * @param weiAmount - Amount in wei
 * @param tokenSymbol - Token symbol
 * @returns Formatted price like "1.5K STRK" or "2.3M STRK"
 */
export function formatPriceCompact(weiAmount: string | bigint, tokenSymbol: string = 'STRK'): string {
  const decimals = TOKEN_DECIMALS[tokenSymbol.toUpperCase()] ?? 18;
  const humanReadable = fromWei(weiAmount, decimals);
  const num = Number.parseFloat(humanReadable);

  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M ${tokenSymbol}`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K ${tokenSymbol}`;
  }

  return formatPrice(weiAmount, tokenSymbol);
}
