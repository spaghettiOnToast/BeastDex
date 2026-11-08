import { describe, expect, it } from "vitest";
import { formatTokenAmount, u256ToBigInt, WALLET_TOKENS } from "../src/services/tokens/walletBalances";

const e18 = 10n ** 18n;

describe("formatTokenAmount", () => {
  it("formats with separators and trims trailing zeros", () => {
    expect(formatTokenAmount(21435574129854387000000n, 18, 2)).toBe("21,435.57");
    expect(formatTokenAmount(4021170728871102n, 18, 4)).toBe("0.004");
    expect(formatTokenAmount(1611966n, 6, 2)).toBe("1.61");
    expect(formatTokenAmount(3n * e18, 18, 2)).toBe("3");
  });
  it("shows dust as a lower bound", () => {
    expect(formatTokenAmount(1n, 18, 2)).toBe("< 0.01");
    expect(formatTokenAmount(1n, 18, 0)).toBe("< 1");
  });
});

describe("u256ToBigInt", () => {
  it("combines low and high words", () => {
    expect(u256ToBigInt(["0x5", "0x0"])).toBe(5n);
    expect(u256ToBigInt(["0x0", "0x1"])).toBe(1n << 128n);
  });
});

describe("WALLET_TOKENS", () => {
  it("includes SKULL v2 at the address from Provable Games docs", () => {
    const skull = WALLET_TOKENS.find((t) => t.symbol === "SKULL" && !t.label);
    expect(BigInt(skull!.address)).toBe(BigInt("0x2798a8dc91bf1ef502cf8710751d26128fdf8e9d0823522fc08632ecc9172e8"));
  });
  it("has unique addresses", () => {
    const set = new Set(WALLET_TOKENS.map((t) => BigInt(t.address)));
    expect(set.size).toBe(WALLET_TOKENS.length);
  });
});
