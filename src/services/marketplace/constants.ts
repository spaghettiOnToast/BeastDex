// Marketplace contract address from environment
export const MARKETPLACE_ADDRESS =
  (import.meta.env.VITE_MARKETPLACE_ADDRESS as string) ||
  "0x06bbf16b6c67b1bef27a187b499b2f3a14af31646c2c90d64f11b9087c3f527c";

// ERC20 address used for payment (optional; depends on marketplace config)
export type PaymentToken = {
  symbol: string;
  address: string; // ERC20 token address or "0x0" for native if contract supports it
  decimals?: number; // optional, not used when avoiding wei conversion
  logo?: string; // optional, icon URL for the token
};

// Ekubo tokens localStorage cache key (must match useEkuboTokens.ts)
const EKUBO_TOKENS_CACHE_KEY = "ekubo-tokens-cache";

/**
 * Normalize Starknet address to consistent format for comparison
 * Handles different hex representations (with/without leading zeros)
 */
function normalizeStarknetAddress(address: string): string {
  // Remove 0x prefix, pad to 64 chars, lowercase
  const withoutPrefix = address.toLowerCase().replace(/^0x/, "");
  const padded = withoutPrefix.padStart(64, "0");
  return "0x" + padded;
}

/**
 * Get tokens from Ekubo localStorage cache (sync read)
 */
function getEkuboTokensFromCache(): PaymentToken[] {
  try {
    const cached = localStorage.getItem(EKUBO_TOKENS_CACHE_KEY);
    if (!cached) return [];
    const { tokens } = JSON.parse(cached);
    if (!Array.isArray(tokens)) return [];
    // Map Ekubo Token format to PaymentToken format
    return tokens.map((t: { symbol: string; address: string; decimals: number; logoUrl?: string }) => ({
      symbol: t.symbol,
      address: t.address,
      decimals: t.decimals,
      logo: t.logoUrl,
    }));
  } catch {
    return [];
  }
}

// Default token address - LORDS on mainnet
const DEFAULT_LORDS_ADDRESS =
  (import.meta.env.VITE_TOKEN_LORDS as string) ||
  "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49";

export function getPaymentTokenByAddress(address?: string | null): PaymentToken | null {
  if (!address) return null;
  const normalizedInput = normalizeStarknetAddress(address.trim());

  // Check Ekubo cache with normalized address comparison
  const ekuboTokens = getEkuboTokensFromCache();
  const ekuboMatch = ekuboTokens.find(
    (t) => normalizeStarknetAddress(t.address) === normalizedInput
  );
  if (ekuboMatch) return ekuboMatch;

  return null;
}

// Default payment token for dialog initial state
export const DEFAULT_PAYMENT_TOKEN: PaymentToken = {
  symbol: "LORDS",
  address: DEFAULT_LORDS_ADDRESS,
};

// Listing expiration handling
export const DEFAULT_LISTING_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const LISTING_DURATION_OPTIONS = [
  { label: "1 Day", value: 60 * 60 * 24 },
  { label: "3 Days", value: 60 * 60 * 24 * 3 },
  { label: "7 Days", value: 60 * 60 * 24 * 7 },
  { label: "14 Days", value: 60 * 60 * 24 * 14 },
  { label: "30 Days", value: DEFAULT_LISTING_DURATION_SECONDS },
] as const;

export function getDefaultListingExpiration(): bigint {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return BigInt(nowSeconds + DEFAULT_LISTING_DURATION_SECONDS);
}

// Collection address (re-use beasts contract)
export { CONTRACT_ADDRESS as BEASTS_COLLECTION_ADDRESS } from "../beast/constants";

// =============================================================================
// FEE STRUCTURE
// =============================================================================
// SELLER PAYS (deducted from listing price by contract):
//   - Platform Fee (Cartridge): 2.5%
//   - Creator Royalty: 5%
//   - Total seller deduction: 7.5%
//
// BUYER PAYS (added on top of listing price):
//   - Client Fee (BeastDex): 5%
// =============================================================================

// Client fee configuration (paid by BUYER, added on top of listing price)
// Fee is in basis points where 10000 = 100%, so 500 = 5%
export const CLIENT_FEE_BP = 500; // 5% client fee paid by buyer
export const CLIENT_FEE_RECEIVER = "0x0495fc00f87ab20ae908dd24c763c9553b67955e6301113809320da20e8ecb5b";

// Seller fee constants (for display purposes - handled by contract)
// These are deducted from the seller's proceeds by the marketplace contract
export const PLATFORM_FEE_BP = 250; // 2.5% Cartridge platform fee
export const CREATOR_ROYALTY_BP = 500; // 5% creator royalty
export const TOTAL_SELLER_FEE_BP = PLATFORM_FEE_BP + CREATOR_ROYALTY_BP; // 7.5% total

// Royalties configuration - must be true for creator royalties to be enforced
export const ROYALTIES_ENABLED = true;

// Whitelisted payment tokens for marketplace transactions
export const WHITELISTED_PAYMENT_TOKENS = [
  "lords",
  "survivor",
  "eth",
  "strk",
  "ekubo",
  "usdc",
  "usdt",
  "cash",
  "dai",
] as const;
