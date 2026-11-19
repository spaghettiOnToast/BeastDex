import { describe, it, expect } from "vitest";
import { BUYBACK_POOLS, buybackPoolFor, formatEth, formatEthUsd, quoteAmount } from "../src/services/lootBuyback";

describe("Loot buyback pools", () => {
  it("covers every Loot species once per pool kind", () => {
    for (const mega of [false, true]) {
      const species = BUYBACK_POOLS.filter((p) => p.mega === mega).flatMap((p) => p.species).sort((a, b) => a - b);
      expect(species).toEqual(Array.from({ length: 30 }, (_, i) => 78 + i));
    }
    expect(buybackPoolFor(94, false)?.tier).toBe(4);
    expect(buybackPoolFor(94, true)?.pair).toBe("0x0757dcc3913df8302ea87308f79377f6a3401281047fa7d804d76cb63a5dc6f0");
    expect(buybackPoolFor(1, false)).toBeUndefined();
  });

  it("reads the seller's amount from an NFTQuote", () => {
    // Real mainnet tier-4 quote.
    const q = ["0x0", "0x36e5f2b6a1c4", "0x3d5a", "0x32ffa8a5e9c5", "0x0", "0x2d34b8b2e9", "0x0", "0x2af2b0f9d8a", "0x0"];
    expect(quoteAmount(q)).toBe(0x32ffa8a5e9c5n);
    expect(quoteAmount(["0x1", ...q.slice(1)])).toBeNull(); // curve error
    expect(quoteAmount(undefined)).toBeNull();
  });

  it("formats small ETH amounts", () => {
    expect(formatEth(56074258584901n)).toBe("0.000056");
    expect(formatEth(12_300_000_000_000_000n)).toBe("0.012");
    expect(formatEth(1_500_000_000_000_000_000n)).toBe("1.5");
    expect(formatEth(0n)).toBe("0");
  });

  it("formats USD values", () => {
    expect(formatEthUsd(56074258584901n, 1796.36)).toBe("$0.10");
    expect(formatEthUsd(810_000_000_000_000n, 1796.36)).toBe("$1.46");
    expect(formatEthUsd(1_000_000_000n, 1796.36)).toBe("<$0.01");
    expect(formatEthUsd(56074258584901n, null)).toBeNull();
  });
});
