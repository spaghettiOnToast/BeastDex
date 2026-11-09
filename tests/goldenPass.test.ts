import { describe, expect, it } from "vitest";
import {
  BEAST_MODE_DUNGEON_ADDRESS,
  GOLDEN_TOKEN_ADDRESS,
  buildGoldenPassMintCall,
  formatCountdown,
  isCooldownError,
  summarizeGoldenPasses,
} from "../src/services/adventurers/goldenPass";
import { estimateFeeFri, WALLET_OVERHEAD_L2, ACTION_L2_GAS } from "../src/services/gas/walletFees";

describe("golden pass mint", () => {
  it("builds new_game(GoldenPass{token, id}, to, soulbound=false)", () => {
    const call = buildGoldenPassMintCall(167, "0xabc");
    expect(call.contractAddress).toBe(BEAST_MODE_DUNGEON_ADDRESS);
    expect(call.entrypoint).toBe("new_game");
    expect(call.calldata).toEqual(["1", GOLDEN_TOKEN_ADDRESS, "0xa7", "0xabc", "0"]);
  });

  it("formats cooldown countdowns", () => {
    expect(formatCountdown(3 * 86_400 + 4 * 3_600 + 59)).toBe("3d 4h");
    expect(formatCountdown(5 * 3_600 + 12 * 60)).toBe("5h 12m");
    expect(formatCountdown(20)).toBe("1m");
  });
});

describe("multi-transaction fees", () => {
  const prices = { l2Fri: 1n, l1DataFri: 0n, block: 1 };
  it("charges wallet overhead per transaction", () => {
    const one = estimateFeeFri({ goldenPassMint: 1 }, "ready", prices);
    expect(estimateFeeFri({ goldenPassMint: 1 }, "ready", prices, 6)).toBe(one * 6n);
  });
  it("charges Controller's first-login premium once", () => {
    const fee = estimateFeeFri({ goldenPassMint: 1 }, "controllerFirstPasskey", prices, 3);
    const expected =
      3 * ACTION_L2_GAS.goldenPassMint + WALLET_OVERHEAD_L2.controllerFirstPasskey + 2 * WALLET_OVERHEAD_L2.controller;
    expect(fee).toBe(BigInt(expected));
  });
});

describe("cooldown errors", () => {
  it("recognises the dungeon's revert reason", () => {
    expect(isCooldownError(new Error("... ('Golden pass on cooldown'), ENTRYPOINT_FAILED"))).toBe(true);
    expect(isCooldownError(new Error("User rejected"))).toBe(false);
  });
});

describe("golden pass summary", () => {
  it("counts ready tokens and finds the soonest unlock", () => {
    expect(
      summarizeGoldenPasses([
        { tokenId: 1, usable: true, lastUsed: 0, readyAt: null },
        { tokenId: 2, usable: false, lastUsed: 10, readyAt: 500 },
        { tokenId: 3, usable: false, lastUsed: 5, readyAt: 300 },
      ]),
    ).toEqual({ ready: 1, total: 3, nextReady: 300 });
  });
});
