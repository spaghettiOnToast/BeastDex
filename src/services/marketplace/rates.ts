import { useQuery } from '@tanstack/react-query';

export type RatesInSTRK = {
  STRK: number;
  LORDS?: number;
  USDC?: number;
  ETH?: number;
  SURVIVOR?: number;
};

const EKUBO_API_BASE = 'https://starknet-mainnet-api.ekubo.org';

interface EkuboPriceData {
  start: string;
  vwap: number;
  min: number;
  max: number;
  k_volume: string;
}

interface EkuboPriceResponse {
  timestamp: number;
  start: number;
  end: number;
  interval: number;
  data: EkuboPriceData[];
}

/**
 * Fetch the latest price for a token pair from Ekubo
 * @param baseToken - Token symbol (e.g., 'ETH', 'STRK', 'LORDS')
 * @param quoteToken - Quote token symbol (e.g., 'USDC')
 * @returns The latest VWAP price, or null if unavailable
 */
async function fetchTokenPrice(baseToken: string, quoteToken: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${EKUBO_API_BASE}/price/${baseToken}/${quoteToken}/history`
    );

    if (!response.ok) {
      console.warn(`Failed to fetch ${baseToken}/${quoteToken} price:`, response.status);
      return null;
    }

    const data: EkuboPriceResponse = await response.json();

    // Get the latest price data (last element in the array)
    if (data.data && data.data.length > 0) {
      const latestPrice = data.data[data.data.length - 1];
      return latestPrice.vwap;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching ${baseToken}/${quoteToken} price:`, error);
    return null;
  }
}

async function fetchEkuboRates(): Promise<RatesInSTRK> {
  try {
    // Fetch all prices in parallel, denominated in USDC
    const [strkUsdcPrice, lordsUsdcPrice, ethUsdcPrice, survivorUsdcPrice] = await Promise.all([
      fetchTokenPrice('STRK', 'USDC'),
      fetchTokenPrice('LORDS', 'USDC'),
      fetchTokenPrice('ETH', 'USDC'),
      fetchTokenPrice('SURVIVOR', 'USDC'),
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

    console.log('Ekubo rates fetched:', {
      prices: { strkUsdcPrice, lordsUsdcPrice, ethUsdcPrice, survivorUsdcPrice },
      rates,
    });

    return rates;
  } catch (error) {
    console.error('Error fetching Ekubo rates:', error);

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
  return useQuery({
    queryKey: ['ekubo-rates'],
    queryFn: fetchEkuboRates,
    staleTime: 60_000,
    refetchInterval: 60_000,
    initialData: { STRK: 1 } as RatesInSTRK,
  });
}

