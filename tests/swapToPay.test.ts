import { describe, expect, it, vi, afterEach } from "vitest";
import {
  EKUBO_ROUTER_ADDRESS,
  PriceMovedError,
  buildSwapCalls,
  maxSpend,
  prepareSwapForPurchase,
  quoteExactOutput,
  sameToken,
  swapPremium,
  type ExactOutputQuote,
} from "../src/services/marketplace/swap";
import { BEASTS_COLLECTION_ADDRESS, CLIENT_FEE_BP, clientFeeBpFor, sellerRoyaltyFor } from "../src/services/marketplace/constants";
import { GAME_CORE_ADDRESS } from "../src/services/adventurers";

const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const SURV = "0x042dd777885ad2c116be96d4d634abc90a26a790ffb5871e037dd5ae7d2ec86b";
const e18 = 10n ** 18n;

// Shape of a real Ekubo quote (10 SURVIVOR paid in STRK, two routes), trimmed.
const pool = (t0: string, t1: string) => ({
  token0: t0,
  token1: t1,
  fee: "0x20c49ba5e353f80000000000000000",
  tick_spacing: 1000,
  extension: "0x0",
});
const apiQuote = {
  total_calculated: "-9417037129137316000",
  price_impact: -0.107,
  splits: [
    {
      amount_specified: "-7775878906250000000",
      route: [{ pool_key: pool(SURV, STRK), sqrt_ratio_limit: "0x1000003f7f1380b75", skip_ahead: 0 }],
    },
    {
      amount_specified: "-2224121093750000000",
      route: [
        { pool_key: pool(SURV, "0x1"), sqrt_ratio_limit: "0x1", skip_ahead: 0 },
        { pool_key: pool("0x1", STRK), sqrt_ratio_limit: "0x2", skip_ahead: 0 },
      ],
    },
  ],
};

afterEach(() => vi.restoreAllMocks());

const mockQuote = (body: unknown, ok = true) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok, status: ok ? 200 : 404, json: async () => body } as Response);

describe("quoteExactOutput", () => {
  it("asks for an exact-output quote and reads the input needed", async () => {
    const spy = mockQuote(apiQuote);
    const q = await quoteExactOutput(STRK, SURV, 10n * e18);
    expect(String(spy.mock.calls[0][0])).toContain(`/-${10n * e18}/${BigInt(SURV).toString(16).replace(/^/, "0x")}/`);
    expect(q.amountIn).toBe(9417037129137316000n);
    expect(q.amountOut).toBe(10n * e18);
    expect(q.splits).toHaveLength(2);
  });

  it("explains liquidity errors", async () => {
    mockQuote({ error: "Insufficient liquidity" }, false);
    await expect(quoteExactOutput(STRK, SURV, e18)).rejects.toThrow(/Not enough liquidity/);
  });
});

describe("buildSwapCalls", () => {
  const quote: ExactOutputQuote = {
    payToken: STRK,
    buyToken: SURV,
    amountOut: 10n * e18,
    amountIn: 9417037129137316000n,
    priceImpact: 0.1,
    splits: apiQuote.splits,
    fetchedAt: 0,
  };

  it("transfer cap → swap → clear_minimum(exact out) → clear(refund)", () => {
    const max = maxSpend(quote.amountIn, 100);
    const calls = buildSwapCalls(quote, max);
    expect(calls.map((c) => c.entrypoint)).toEqual(["transfer", "multi_multihop_swap", "clear_minimum", "clear"]);
    expect(calls[0].contractAddress).toBe(STRK);
    expect(calls[0].calldata[0]).toBe(EKUBO_ROUTER_ADDRESS);
    expect(BigInt(calls[0].calldata[1])).toBe(max);
    expect(calls[2].calldata[0]).toBe(SURV);
    expect(BigInt(calls[2].calldata[1])).toBe(10n * e18);
    expect(calls[3].calldata).toEqual([STRK]);
  });

  it("encodes routes from the output token, amounts as negative i129", () => {
    const [, swap] = buildSwapCalls(quote, quote.amountIn);
    const cd = swap.calldata;
    expect(cd[0]).toBe("0x2"); // two swaps
    expect(cd[1]).toBe("0x1"); // first route: one node
    // node: token0, token1, fee, tick_spacing, extension, limit.low, limit.high, skip_ahead
    expect(BigInt(cd[2])).toBe(BigInt(SURV));
    expect(BigInt(cd[5])).toBe(1000n);
    // TokenAmount: buy token, |amount|, sign
    expect(BigInt(cd[10])).toBe(BigInt(SURV));
    expect(BigInt(cd[11])).toBe(7775878906250000000n);
    expect(cd[12]).toBe("0x1");
    // second swap: two nodes
    expect(cd[13]).toBe("0x2");
  });

  it("uses multihop_swap for a single route", () => {
    const [, swap] = buildSwapCalls({ ...quote, splits: [apiQuote.splits[0]] }, quote.amountIn);
    expect(swap.entrypoint).toBe("multihop_swap");
    expect(swap.calldata[0]).toBe("0x1");
  });
});

describe("max spend and price moves", () => {
  it("adds slippage, rounding up", () => {
    expect(maxSpend(10_000n, 100)).toBe(10_100n);
    expect(maxSpend(1n, 50)).toBe(2n);
  });

  it("stops when a fresh quote needs more than the confirmed maximum", async () => {
    mockQuote(apiQuote);
    await expect(
      prepareSwapForPurchase({ token: STRK, slippageBp: 100, maxIn: 9n * e18 }, SURV, 10n * e18),
    ).rejects.toBeInstanceOf(PriceMovedError);
  });

  it("caps the transfer at the confirmed maximum", async () => {
    mockQuote(apiQuote);
    const { calls, maxIn } = await prepareSwapForPurchase({ token: STRK, slippageBp: 100, maxIn: 95n * e18 / 10n }, SURV, 10n * e18);
    expect(maxIn).toBe(95n * e18 / 10n);
    expect(BigInt(calls[0].calldata[1])).toBe(95n * e18 / 10n);
  });
});

describe("value check", () => {
  it("is the premium over market value from USD prices", () => {
    const q = { amountIn: 11n * e18, amountOut: 10n * e18 };
    expect(swapPremium(q, { decimals: 18, usdPrice: 1 }, { decimals: 18, usdPrice: 1 })).toBeCloseTo(0.1);
    expect(swapPremium(q, { decimals: 18, usdPrice: null }, { decimals: 18, usdPrice: 1 })).toBeNull();
  });

  it("compares addresses numerically", () => {
    expect(sameToken("0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", STRK)).toBe(true);
    expect(sameToken(STRK, SURV)).toBe(false);
  });
});

describe("fees per collection", () => {
  it("2.5% client fee and 20% royalty on games, 5% / 5% on Beasts", () => {
    expect(clientFeeBpFor(GAME_CORE_ADDRESS)).toBe(250);
    expect(clientFeeBpFor(BEASTS_COLLECTION_ADDRESS)).toBe(CLIENT_FEE_BP);
    expect(clientFeeBpFor(undefined)).toBe(500);
    expect(sellerRoyaltyFor(GAME_CORE_ADDRESS).bp).toBe(2000);
    expect(sellerRoyaltyFor(BEASTS_COLLECTION_ADDRESS).bp).toBe(500);
  });
});
