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
 * Tokens that Ekubo's public /tokens API does not index but the app still
 * needs to support (SURVIVOR and LORDS aren't listed on Ekubo at all, even
 * though both are actively tradeable there). These are merged into the
 * Ekubo response and are automatically superseded if Ekubo ever starts
 * indexing the same address. usdPrice is filled in via the quoter API
 * below since Ekubo's metadata list has no price for them.
 */
const STATIC_FALLBACK_TOKENS: Token[] = [
  {
    address: normalizeAddress(
      "0x042dd777885ad2c116be96d4d634abc90a26a790ffb5871e037dd5ae7d2ec86b"
    ),
    symbol: "SURVIVOR",
    name: "Survivor",
    decimals: 18, // verified on-chain via decimals() call
    logoUrl: null,
    usdPrice: null,
    sortOrder: 0,
  },
  {
    address: normalizeAddress(
      "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49"
    ),
    symbol: "LORDS",
    name: "Lords",
    decimals: 18, // verified on-chain via decimals() call
    logoUrl: null,
    usdPrice: null,
    sortOrder: 0,
  },
];

// Ekubo quoter API — used only to price STATIC_FALLBACK_TOKENS, since
// Ekubo's /tokens metadata list has no usd_price for them.
const EKUBO_QUOTER_API_BASE = "https://prod-api-quoter.ekubo.org";
const QUOTER_CHAIN_ID_DECIMAL = "23448594291968334";
const QUOTER_STANDARD_AMOUNT = "1000000000000000000"; // 1 token at 18 decimals
const QUOTER_USDC_ADDRESS = "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8";

async function fetchQuotedUsdPrice(tokenAddress: string): Promise<number | null> {
  try {
    const url = `${EKUBO_QUOTER_API_BASE}/${QUOTER_CHAIN_ID_DECIMAL}/${QUOTER_STANDARD_AMOUNT}/${tokenAddress}/${QUOTER_USDC_ADDRESS}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data: { total_calculated?: string } = await response.json();
    if (!data.total_calculated) return null;
    return Number(data.total_calculated) / 1e6; // USDC has 6 decimals
  } catch {
    return null;
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

    // Merge in tokens Ekubo doesn't index (e.g. SURVIVOR, LORDS). Live Ekubo
    // data wins if the address is ever indexed there too. Price them via the
    // quoter API in parallel since they have no usd_price from /tokens.
    const knownAddresses = new Set(starknetTokens.map((t) => t.address));
    const missingFallbacks = STATIC_FALLBACK_TOKENS.filter((t) => !knownAddresses.has(t.address));
    const pricedFallbacks = await Promise.all(
      missingFallbacks.map(async (t) => ({
        ...t,
        usdPrice: t.usdPrice ?? (await fetchQuotedUsdPrice(t.address)),
      }))
    );
    const merged = [...starknetTokens, ...pricedFallbacks].sort((a, b) => a.sortOrder - b.sortOrder);

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
    // Ekubo is unreachable — at least return the statically known tokens
    // rather than leaving the app with no payment options at all.
    return STATIC_FALLBACK_TOKENS;
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
