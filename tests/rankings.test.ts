import { describe, it, expect } from "vitest";
import { formatStrk, rankingsStale, revertReason, updateRankingsCall } from "../src/services/beast/rankings";
import { BEASTS_V3_ADDRESS } from "../src/services/beast/constants";

describe("species rankings", () => {
  it("is stale when the ranking doesn't cover every beast", () => {
    expect(rankingsStale({ ranked: 1153, total: 1154, updatedAtBlock: 1 })).toBe(true);
    expect(rankingsStale({ ranked: 1154, total: 1154, updatedAtBlock: 1 })).toBe(false);
  });

  it("encodes update_rankings(species, Span<felt252>)", () => {
    expect(updateRankingsCall(56, ["11", "22", "33"])).toEqual({
      contractAddress: BEASTS_V3_ADDRESS,
      entrypoint: "update_rankings",
      calldata: ["56", "3", "11", "22", "33"],
    });
  });

  it("digs the contract's reason out of Argent's multicall wrapper", () => {
    const msg =
      "Execution failed. Failure reason: (0x61 ('argent/multicall-failed'), 0x0 (''), 0x53 ('Sound: stale rankings'), 0x45 ('ENTRYPOINT_FAILED')).";
    expect(revertReason(new Error(msg))).toBe("Sound: stale rankings");
    expect(revertReason(new Error("plain"))).toBe("plain");
  });

  it("formats STRK fees", () => {
    expect(formatStrk(1_645_000_000_000_000_000n)).toBe("1.65");
    expect(formatStrk(23_000_000_000_000_000n)).toBe("0.023");
  });
});
