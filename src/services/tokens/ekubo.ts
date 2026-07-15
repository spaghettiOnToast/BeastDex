/**
 * Ekubo API integration for dynamic token support
 * Fetches token metadata (symbol, decimals, logo) and prices from Ekubo
 */

// Starknet mainnet chain ID in hex
const STARKNET_MAINNET_CHAIN_ID = "0x534e5f4d41494e";

// Ekubo API base URL
const EKUBO_API_BASE = "https://prod-api.ekubo.org";

/**
 * Raw token data from Ekubo API
 */
export interface EkuboToken {
  chain_id: string;
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  sort_order: number;
  visibility_priority: number;
  logo_url: string | null;
  total_supply: string | null;
  usd_price: number | null;
  bridgeInfos: Record<string, { bridge_address: string }> | null;
}

/**
 * Normalized token data for use in the app
 */
export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string | null;
  usdPrice: number | null;
  sortOrder: number;
}

// In-memory cache
let tokenCache: Token[] | null = null;
let tokenMapCache: Map<string, Token> | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Normalize Starknet address to consistent format for comparison
 * Handles different hex representations (with/without leading zeros)
 */
export function normalizeAddress(address: string): string {
  // Remove 0x prefix, pad to 64 chars, lowercase
  const withoutPrefix = address.toLowerCase().replace(/^0x/, "");
  const padded = withoutPrefix.padStart(64, "0");
  return "0x" + padded;
}

/**
 * Tokens missing from Ekubo's bulk /tokens list (a curated top-N list) but
 * that the app still needs — SURVIVOR and LORDS aren't in the top 1000, but
 * both DO exist in Ekubo's full index and are fetchable individually via
 * `/tokens/{chainId}/{address}` (confirmed: real name/decimals/logo_url/
 * usd_price, not a guess). Fetched via `/tokens/batch` below and merged in;
 * live data from the bulk list still wins if an address ever appears there.
 */
const FALLBACK_TOKEN_ADDRESSES = [
  "0x042dd777885ad2c116be96d4d634abc90a26a790ffb5871e037dd5ae7d2ec86b", // SURVIVOR
  "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49", // LORDS
].map(normalizeAddress);

async function fetchFallbackTokens(addresses: string[]): Promise<Token[]> {
  if (addresses.length === 0) return [];
  try {
    const url = new URL(`${EKUBO_API_BASE}/tokens/batch`);
    for (const addr of addresses) {
      url.searchParams.append("id", `${STARKNET_MAINNET_CHAIN_ID}:${addr}`);
    }
    const response = await fetch(url.toString());
    if (!response.ok) return [];
    const data: EkuboToken[] = await response.json();
    return data.map((token): Token => ({
      address: normalizeAddress(token.address),
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      logoUrl: token.logo_url,
      usdPrice: token.usd_price,
      sortOrder: token.sort_order,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch all Starknet tokens from Ekubo API
 */
export async function fetchEkuboTokens(): Promise<Token[]> {
  // Return cached data if still fresh
  const now = Date.now();
  if (tokenCache && now - lastFetchTime < CACHE_TTL_MS) {
    return tokenCache;
  }

  try {
    const response = await fetch(`${EKUBO_API_BASE}/tokens`);
    if (!response.ok) {
      throw new Error(`Ekubo API error: ${response.status}`);
    }

    const data: EkuboToken[] = await response.json();

    // Filter for Starknet mainnet tokens and normalize
    const starknetTokens = data
      .filter((token) => token.chain_id === STARKNET_MAINNET_CHAIN_ID)
      .map((token): Token => ({
        address: normalizeAddress(token.address),
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoUrl: token.logo_url,
        usdPrice: token.usd_price,
        sortOrder: token.sort_order,
      }));

    // Merge in tokens missing from the bulk list (e.g. SURVIVOR, LORDS) via
    // the single/batch lookup, which does have them. Live bulk-list data
    // wins if an address ever appears there too.
    const knownAddresses = new Set(starknetTokens.map((t) => t.address));
    const missingAddresses = FALLBACK_TOKEN_ADDRESSES.filter((a) => !knownAddresses.has(a));
    const fallbackTokens = await fetchFallbackTokens(missingAddresses);
    const merged = [...starknetTokens, ...fallbackTokens].sort((a, b) => a.sortOrder - b.sortOrder);

    // Update cache
    tokenCache = merged;
    tokenMapCache = new Map(merged.map((t) => [t.address, t]));
    lastFetchTime = now;

    if (import.meta.env.DEV) {
      console.log(`[Ekubo] Fetched ${merged.length} Starknet tokens`);
    }
    return merged;
  } catch (error) {
    console.error("[Ekubo] Failed to fetch tokens:", error);
    // Return cached data if available, even if stale
    if (tokenCache) {
      return tokenCache;
    }
    // The bulk list failed — try the fallback tokens on their own in case
    // it's only that endpoint having trouble, rather than leaving the app
    // with no payment options at all.
    return fetchFallbackTokens(FALLBACK_TOKEN_ADDRESSES);
  }
}

/**
 * Get a single token by address
 */
export async function getTokenByAddress(address: string): Promise<Token | null> {
  // Ensure cache is populated
  if (!tokenMapCache) {
    await fetchEkuboTokens();
  }

  const normalized = normalizeAddress(address);
  return tokenMapCache?.get(normalized) ?? null;
}

/**
 * Get token decimals (defaults to 18 if unknown)
 */
export async function getTokenDecimals(address: string): Promise<number> {
  const token = await getTokenByAddress(address);
  return token?.decimals ?? 18;
}

/**
 * Get token symbol
 */
export async function getTokenSymbol(address: string): Promise<string | null> {
  const token = await getTokenByAddress(address);
  return token?.symbol ?? null;
}

/**
 * Get token logo URL
 */
export async function getTokenLogoUrl(address: string): Promise<string | null> {
  const token = await getTokenByAddress(address);
  return token?.logoUrl ?? null;
}

/**
 * Get token USD price
 */
export async function getTokenUsdPrice(address: string): Promise<number | null> {
  const token = await getTokenByAddress(address);
  return token?.usdPrice ?? null;
}

/**
 * Fetch fresh prices for multiple tokens
 * Uses the batch endpoint for efficiency
 */
export async function fetchTokenPrices(
  addresses: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  if (addresses.length === 0) {
    return prices;
  }

  try {
    // Fetch fresh token data
    const tokens = await fetchEkuboTokens();
    const tokenMap = new Map(tokens.map((t) => [t.address, t]));

    for (const address of addresses) {
      const normalized = normalizeAddress(address);
      const token = tokenMap.get(normalized);
      if (token?.usdPrice != null) {
        prices.set(normalized, token.usdPrice);
      }
    }

    return prices;
  } catch (error) {
    console.error("[Ekubo] Failed to fetch prices:", error);
    return prices;
  }
}

/**
 * Invalidate the token cache to force a refresh
 */
export function invalidateTokenCache(): void {
  tokenCache = null;
  tokenMapCache = null;
  lastFetchTime = 0;
}
