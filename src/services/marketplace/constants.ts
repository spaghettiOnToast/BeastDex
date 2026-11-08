import { CONTRACT_ADDRESS as BEASTS_ADDRESS } from "../beast/constants";
import { FESTIVAL_COLLECTIONS } from "../festivalBeasts";
import { toTokenIdString } from "../../utils/tokenId";
import { ADVENTURER_ROYALTY_BP, GAME_CORE_ADDRESS } from "../adventurers/constants";

/**
 * Marketplace kill switch. On by default; set VITE_MARKETPLACE_ENABLED=false
 * to hide it (tab, /marketplace route, buy/offer/cart UI and wallet approvals;
 * the route redirects home).
 */
export const MARKETPLACE_ENABLED =
  (import.meta.env.VITE_MARKETPLACE_ENABLED as string | undefined)?.trim().toLowerCase() !== "false";

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

// Default token addresses on mainnet
export const DEFAULT_LORDS_ADDRESS =
  (import.meta.env.VITE_TOKEN_LORDS as string) ||
  "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49";

export const DEFAULT_SURVIVOR_ADDRESS =
  (import.meta.env.VITE_TOKEN_SURVIVOR as string) ||
  "0x042dd777885ad2c116be96d4d634abc90a26a790ffb5871e037dd5ae7d2ec86b";

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
  symbol: "SURVIVOR",
  address: DEFAULT_SURVIVOR_ADDRESS,
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
// TRADABLE COLLECTIONS
// =============================================================================
// Beasts v3 plus the festival collections (freely transferable ERC721s; see
// services/festivalBeasts). All trade on the same Arcade marketplace contract.

export type MarketplaceCollection = {
  id: string;
  name: string;
  address: string;
  kind: "beast" | "festival";
  /** festival collections: slug in services/festivalBeasts */
  festivalSlug?: string;
};

export const MARKETPLACE_COLLECTIONS: MarketplaceCollection[] = [
  { id: "beasts", name: "Beasts", address: BEASTS_ADDRESS, kind: "beast" },
  ...FESTIVAL_COLLECTIONS.map((c) => ({
    id: c.slug,
    name: c.name,
    address: c.address,
    kind: "festival" as const,
    festivalSlug: c.slug,
  })),
];

/** Canonical (lowercase, 0x + 64 hex) form of an address, as Torii stores felts. */
export function paddedAddress(address: string): string {
  return `0x${BigInt(address).toString(16).padStart(64, "0")}`;
}

/** Every tradable collection; the marketplace shows them all in one grid. */
export const MARKETPLACE_COLLECTION_ADDRESSES: readonly string[] = MARKETPLACE_COLLECTIONS.map((c) => c.address);

/**
 * Collection-qualified token key. Token ids alone aren't unique once Beasts and
 * festival tokens share one grid, so dedupe/match on this instead.
 * A missing collection means Beasts (older records carry none).
 */
export function marketplaceTokenKey(collection: string | null | undefined, tokenId: string | number | bigint): string {
  return `${paddedAddress(collection || BEASTS_ADDRESS)}:${toTokenIdString(tokenId) ?? String(tokenId)}`;
}

// =============================================================================
// FEE STRUCTURE
// =============================================================================
// SELLER PAYS (deducted from listing price by contract):
//   - Platform Fee (Cartridge): 0% (currently disabled on arcade-main)
//   - Creator Royalty: 5%
//   - Total seller deduction: 5%
//
// BUYER PAYS (added on top of listing price):
//   - Client Fee (BeastDex): 5%
//
// Verified via Torii query on 2026-02-01:
// Book model: { fee_num: 0, royalties: true }
// =============================================================================

// Client fee configuration (paid by BUYER, added on top of listing price)
// Fee is in basis points where 10000 = 100%, so 500 = 5%
export const CLIENT_FEE_BP = 500; // 5% client fee paid by buyer
export const CLIENT_FEE_RECEIVER = "0x0495fc00f87ab20ae908dd24c763c9553b67955e6301113809320da20e8ecb5b";

// Seller fee constants (for display purposes - handled by contract)
// These are deducted from the seller's proceeds by the marketplace contract
export const PLATFORM_FEE_BP = 0; // 0% Cartridge platform fee (currently disabled)
export const CREATOR_ROYALTY_BP = 500; // 5% creator royalty
export const TOTAL_SELLER_FEE_BP = PLATFORM_FEE_BP + CREATOR_ROYALTY_BP; // 5% total

/**
 * Creator royalty the marketplace deducts from the seller, per collection
 * (ERC-2981 on each contract). Loot Survivor games charge 20%.
 */
export function sellerRoyaltyFor(collection?: string | null): { bp: number; label: string } {
  try {
    if (collection && BigInt(collection) === BigInt(GAME_CORE_ADDRESS)) {
      return { bp: ADVENTURER_ROYALTY_BP, label: "Creator Royalty (Loot Survivor)" };
    }
  } catch {
    // fall through to Beasts
  }
  return { bp: CREATOR_ROYALTY_BP, label: "Creator Royalty (Survivor DAO)" };
}

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
