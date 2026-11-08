/**
 * Pay-with-any-token: swap on Ekubo into exactly the amount a purchase needs,
 * inside the same multicall as the purchase (if the purchase fails, the swap
 * reverts too).
 *
 * Mirrors the Loot Survivor client's ticket purchase and Provable's ekubo-sdk:
 *   1. transfer the pay token (max spend incl. slippage) to the Ekubo router
 *   2. multihop_swap / multi_multihop_swap along the quoted route, exact output
 *   3. clear_minimum(buy token, amount needed) → sends it to the buyer, or reverts
 *   4. clear(pay token) → refunds whatever wasn't spent
 */
import { toUint256Hex } from "../../utils/uint256";

export const EKUBO_ROUTER_ADDRESS = "0x0199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e";
const EKUBO_QUOTER = "https://prod-api-quoter.ekubo.org/23448594291968334"; // Starknet mainnet

/** Slippage choices (basis points). */
export const SLIPPAGE_OPTIONS_BP = [50, 100, 200, 500] as const;
export const DEFAULT_SLIPPAGE_BP = 100;
/**
 * Premium over market value (USD in vs USD out, from Ekubo token prices) at
 * which the UI warns / refuses. Ekubo's own `price_impact` isn't used: it's
 * unreliable on multi-hop routes (it can read -105% on a favourable trade).
 */
export const WARN_PREMIUM = 0.03;
export const MAX_PREMIUM = 0.15;

type PoolKey = { token0: string; token1: string; fee: string; tick_spacing: string | number; extension: string };
type RouteNode = { pool_key: PoolKey; sqrt_ratio_limit: string; skip_ahead: string | number };
type Split = { amount_specified: string; amount_calculated?: string; route: RouteNode[] };

export type ExactOutputQuote = {
  payToken: string;
  buyToken: string;
  /** exact amount of buyToken the swap delivers */
  amountOut: bigint;
  /** expected payToken spent */
  amountIn: bigint;
  /** Ekubo's reported impact (informational only, see WARN_PREMIUM) */
  priceImpact: number;
  splits: Split[];
  fetchedAt: number;
};

/** A plain call (string calldata), assignable to starknet `Call`. */
export type SwapCall = { contractAddress: string; entrypoint: string; calldata: string[] };

export class SwapQuoteError extends Error {}

const abs = (v: bigint) => (v < 0n ? -v : v);
const hex = (v: bigint | number | string) => `0x${BigInt(v).toString(16)}`;

export const sameToken = (a?: string | null, b?: string | null) => {
  try {
    return !!a && !!b && BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
};

/** Quote paying with `payToken` for exactly `amountOut` of `buyToken`. */
export async function quoteExactOutput(
  payToken: string,
  buyToken: string,
  amountOut: bigint,
  signal?: AbortSignal,
): Promise<ExactOutputQuote> {
  if (amountOut <= 0n) throw new SwapQuoteError("Nothing to swap.");
  // Negative amount = exact output; the specified (output) token comes first.
  const res = await fetch(`${EKUBO_QUOTER}/-${amountOut.toString()}/${hex(buyToken)}/${hex(payToken)}`, { signal });
  const data = (await res.json().catch(() => null)) as
    | { total_calculated?: string; price_impact?: number | null; splits?: Split[]; error?: string }
    | null;
  if (!res.ok || !data || data.error || !data.splits?.length || data.total_calculated === undefined) {
    const msg = data?.error ?? `quote failed (${res.status})`;
    throw new SwapQuoteError(
      /liquidity/i.test(msg) ? "Not enough liquidity to swap into this token. Pay in the listing's token instead." : `Couldn't get a swap quote: ${msg}`,
    );
  }
  return {
    payToken,
    buyToken,
    amountOut,
    amountIn: abs(BigInt(data.total_calculated)),
    priceImpact: Math.abs(data.price_impact ?? 0),
    splits: data.splits,
    fetchedAt: Date.now(),
  };
}

/** Most the swap can spend: expected input plus slippage (rounded up). */
export function maxSpend(amountIn: bigint, slippageBp: number): bigint {
  return (amountIn * BigInt(10_000 + slippageBp) + 9_999n) / 10_000n;
}

/** Route calldata, walking from the output token (exact-output swaps). */
function encodeRoute(route: RouteNode[], startToken: string): string[] {
  let token = startToken;
  const out: string[] = [];
  for (const node of route) {
    const k = node.pool_key;
    token = sameToken(token, k.token1) ? k.token0 : k.token1;
    const limit = BigInt(node.sqrt_ratio_limit);
    out.push(
      hex(k.token0),
      hex(k.token1),
      hex(k.fee),
      hex(k.tick_spacing),
      hex(k.extension),
      hex(limit & ((1n << 128n) - 1n)),
      hex(limit >> 128n),
      hex(node.skip_ahead),
    );
  }
  return out;
}

/** One RouteNode[] + TokenAmount { token, amount: i129 { mag, sign = negative } }. */
function encodeSwap(split: Split, buyToken: string): string[] {
  return [
    hex(split.route.length),
    ...encodeRoute(split.route, buyToken),
    hex(buyToken),
    hex(abs(BigInt(split.amount_specified))),
    "0x1", // sign: negative → exact output
  ];
}

/**
 * How much more than market value the swap costs (0.04 = 4%), from USD prices;
 * null when either price is unknown.
 */
export function swapPremium(
  quote: Pick<ExactOutputQuote, "amountIn" | "amountOut">,
  pay: { decimals: number; usdPrice?: number | null },
  want: { decimals: number; usdPrice?: number | null },
): number | null {
  if (!pay.usdPrice || !want.usdPrice || quote.amountOut <= 0n) return null;
  const usdIn = (Number(quote.amountIn) / 10 ** pay.decimals) * pay.usdPrice;
  const usdOut = (Number(quote.amountOut) / 10 ** want.decimals) * want.usdPrice;
  return usdOut > 0 ? usdIn / usdOut - 1 : null;
}

/**
 * Calls that turn `quote.payToken` into exactly `quote.amountOut` of
 * `quote.buyToken` in the buyer's wallet. At most `maxIn` is sent to the router
 * (the rest of it is refunded by `clear`).
 */
export function buildSwapCalls(quote: ExactOutputQuote, maxIn: bigint): SwapCall[] {
  const router = EKUBO_ROUTER_ADDRESS;
  const swap: SwapCall =
    quote.splits.length === 1
      ? { contractAddress: router, entrypoint: "multihop_swap", calldata: encodeSwap(quote.splits[0], quote.buyToken) }
      : {
          contractAddress: router,
          entrypoint: "multi_multihop_swap",
          calldata: [hex(quote.splits.length), ...quote.splits.flatMap((s) => encodeSwap(s, quote.buyToken))],
        };
  return [
    { contractAddress: quote.payToken, entrypoint: "transfer", calldata: [router, ...toUint256Hex(maxIn)] },
    swap,
    { contractAddress: router, entrypoint: "clear_minimum", calldata: [quote.buyToken, ...toUint256Hex(quote.amountOut)] },
    { contractAddress: router, entrypoint: "clear", calldata: [quote.payToken] },
  ];
}

/**
 * How the buyer wants to pay (omitted / same token = no swap). `maxIn` is the
 * most they agreed to spend (shown quote + slippage); the purchase stops if a
 * fresh quote needs more.
 */
export type PayWith = { token: string; slippageBp: number; maxIn?: bigint };

export class PriceMovedError extends Error {}

/** Fresh quote + swap calls for a purchase needing exactly `amountOut` of `buyToken`. */
export async function prepareSwapForPurchase(payWith: PayWith, buyToken: string, amountOut: bigint) {
  const quote = await quoteExactOutput(payWith.token, buyToken, amountOut);
  const cap = payWith.maxIn ?? maxSpend(quote.amountIn, payWith.slippageBp);
  if (quote.amountIn > cap) {
    throw new PriceMovedError("The swap price moved above the maximum you confirmed. Review the new quote and try again.");
  }
  return { quote, maxIn: cap, calls: buildSwapCalls(quote, cap) };
}
