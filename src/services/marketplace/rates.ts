import { useQuery } from '@tanstack/react-query';
import { fetchEkuboTokens } from '../tokens/ekubo';

export type RatesInSTRK = {
  STRK: number;
  LORDS?: number;
  USDC?: number;
  ETH?: number;
  SURVIVOR?: number;
};

// Cache key for localStorage
const RATES_CACHE_KEY = 'ekubo-rates-cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CachedRates {
  rates: RatesInSTRK;
  timestamp: number;
}

function getCachedRates(): RatesInSTRK | null {
  try {
    const cached = localStorage.getItem(RATES_CACHE_KEY);
    if (!cached) return null;

    const { rates, timestamp }: CachedRates = JSON.parse(cached);
    const age = Date.now() - timestamp;

    // Return cached rates if less than 5 minutes old
    if (age < CACHE_DURATION) {
      return rates;
    }
    return null;
  } catch {
    return null;
  }
}

function setCachedRates(rates: RatesInSTRK): void {
  try {
    const cached: CachedRates = {
      rates,
      timestamp: Date.now(),
    };
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignore localStorage errors
  }
}

// Ekubo Quoter API base URL
const EKUBO_QUOTER_API_BASE = 'https://prod-api-quoter.ekubo.org';

// Mainnet chain ID in decimal format
const CHAIN_ID_DECIMAL = '23448594291968334';

// Standard amount: 1 token with 18 decimals
const STANDARD_AMOUNT = '1000000000000000000';

// USDC token address (quote token)
const USDC_ADDRESS = '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8';

// Request timeout in milliseconds
const REQUEST_TIMEOUT = 5000;

interface QuoterResponse {
  total_calculated: string;
  specifiedAmount: string;
  route: any[];
}

/**
 * Fetch the latest price for a token using Ekubo's quoter API
 * @param tokenAddress - Token contract address
 * @returns The price in USDC, or null if unavailable
 */
async function fetchTokenPriceInUSDC(tokenAddress: string): Promise<number | null> {
  try {
    // Manual override for USDC - always return price of 1
    if (
      tokenAddress === '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8' ||
      tokenAddress === '0x33068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb'
    ) {
      return 1;
    }

    // Create a timeout promise
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Request timeout'));
      }, REQUEST_TIMEOUT);
    });

    // Quoter API format: /{chainId}/{amount}/{tokenAddress}/{quoteToken}
    const apiUrl = `${EKUBO_QUOTER_API_BASE}/${CHAIN_ID_DECIMAL}/${STANDARD_AMOUNT}/${tokenAddress}/${USDC_ADDRESS}`;

    const fetchPromise = (async () => {
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('API did not return JSON');
      }

      const quoteResponse: QuoterResponse = await response.json();

      // The quoter returns the amount of USDC we'd get for the input amount
      // USDC has 6 decimals, so divide by 10^6 to get the dollar price
      if (!quoteResponse.total_calculated) {
        throw new Error('No quote data available');
      }

      // Convert the quote amount (in USDC smallest unit) to dollar price
      const price = Number(quoteResponse.total_calculated) / 1e6;
      return price;
    })();

    // Race between the timeout and the fetch
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

async function fetchEkuboRates(): Promise<RatesInSTRK> {
  try {
    // Get token addresses from Ekubo API
    const tokens = await fetchEkuboTokens();
    const strkToken = tokens.find((t) => t.symbol === 'STRK');
    const lordsToken = tokens.find((t) => t.symbol === 'LORDS');
    const ethToken = tokens.find((t) => t.symbol === 'ETH');
    const survivorToken = tokens.find((t) => t.symbol === 'SURVIVOR');

    // Fetch all prices in parallel, denominated in USDC
    const [strkUsdcPrice, lordsUsdcPrice, ethUsdcPrice, survivorUsdcPrice] =
      await Promise.all([
        strkToken ? fetchTokenPriceInUSDC(strkToken.address) : null,
        lordsToken ? fetchTokenPriceInUSDC(lordsToken.address) : null,
        ethToken ? fetchTokenPriceInUSDC(ethToken.address) : null,
        survivorToken && survivorToken.address !== '0x0'
          ? fetchTokenPriceInUSDC(survivorToken.address)
          : null,
      ]);

    const rates: RatesInSTRK = { STRK: 1 };

    // Convert prices to rates denominated in STRK
    // If STRK = 0.5 USDC and ETH = 3948 USDC, then ETH in STRK = 3948 / 0.5 = 7896
    if (strkUsdcPrice && strkUsdcPrice > 0) {
      // USDC rate in STRK (e.g., if STRK = 0.5 USDC, then USDC in STRK = 1/0.5 = 2)
      rates.USDC = 1 / strkUsdcPrice;

      // LORDS rate in STRK
      if (lordsUsdcPrice && lordsUsdcPrice > 0) {
        rates.LORDS = lordsUsdcPrice / strkUsdcPrice;
      }

      // ETH rate in STRK
      if (ethUsdcPrice && ethUsdcPrice > 0) {
        rates.ETH = ethUsdcPrice / strkUsdcPrice;
      }

      // SURVIVOR rate in STRK
      if (survivorUsdcPrice && survivorUsdcPrice > 0) {
        rates.SURVIVOR = survivorUsdcPrice / strkUsdcPrice;
      }
    }

    // Cache the rates
    setCachedRates(rates);

    return rates;
  } catch {
    // Fallback to env-provided rates if available
    const env = (import.meta as any).env || {};
    const lords = parseFloat(env.VITE_RATE_LORDS_IN_STRK || '');
    const usdc = parseFloat(env.VITE_RATE_USDC_IN_STRK || '');
    const eth = parseFloat(env.VITE_RATE_ETH_IN_STRK || '');
    const survivor = parseFloat(env.VITE_RATE_SURVIVOR_IN_STRK || '');
    const rates: RatesInSTRK = { STRK: 1 };
    if (Number.isFinite(lords) && lords > 0) rates.LORDS = lords;
    if (Number.isFinite(usdc) && usdc > 0) rates.USDC = usdc;
    if (Number.isFinite(eth) && eth > 0) rates.ETH = eth;
    if (Number.isFinite(survivor) && survivor > 0) rates.SURVIVOR = survivor;
    return rates;
  }
}

export function usePriceRates() {
  // Get cached rates for instant display
  const cachedRates = getCachedRates();

  return useQuery({
    queryKey: ['ekubo-rates'],
    queryFn: fetchEkuboRates,
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: cachedRates || ({ STRK: 1 } as RatesInSTRK),
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    // Ensure immediate execution
    networkMode: 'always',
  });
}
