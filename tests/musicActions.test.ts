import { describe, it, expect } from "vitest";
import {
  buyTrackCalls,
  bulkBuyTrackCalls,
  setDefaultTrackCall,
  setTrackModeCall,
  musicContractsProblem,
  formatSkull,
  SKULL_ADDRESS,
  SOUND_MANAGER_ADDRESS,
  TRACK_PRICE_WEI,
} from "../src/services/beast/musicActions";

const TOKEN = "947819263557514267912889930803457441577027375186918101925526716893";

describe("Sound Manager calldata (matches ABI + lootsurvivor.io)", () => {
  it("buys a track: approve exactly 1 SKULL, then purchase_track", () => {
    const [approve, purchase] = buyTrackCalls(TOKEN);
    expect(approve).toEqual({
      contractAddress: SKULL_ADDRESS,
      entrypoint: "approve",
      calldata: [SOUND_MANAGER_ADDRESS, "0xde0b6b3a7640000", "0x0"], // u256(1e18)
    });
    expect(purchase).toEqual({ contractAddress: SOUND_MANAGER_ADDRESS, entrypoint: "purchase_track", calldata: [TOKEN] });
  });

  it("bulk-buys: one approve for the total, then a purchase_track per token", () => {
    const calls = bulkBuyTrackCalls([TOKEN, "5", "6"]);
    expect(calls).toHaveLength(4);
    expect(calls[0]).toEqual({
      contractAddress: SKULL_ADDRESS,
      entrypoint: "approve",
      calldata: [SOUND_MANAGER_ADDRESS, "0x29a2241af62c0000", "0x0"], // u256(3e18)
    });
    expect(calls.slice(1).map((c) => c.calldata[0])).toEqual([TOKEN, "5", "6"]);
    expect(calls.slice(1).every((c) => c.entrypoint === "purchase_track")).toBe(true);
    expect(bulkBuyTrackCalls([])).toEqual([]);
  });

  it("encodes TrackRef: Shared=0, Individual=1, Named=2 (no id)", () => {
    expect(setDefaultTrackCall(TOKEN, { kind: "shared", id: 1 }).calldata).toEqual([TOKEN, "0", "1"]);
    expect(setDefaultTrackCall(TOKEN, { kind: "individual", id: 7 }).calldata).toEqual([TOKEN, "1", "7"]);
    expect(setDefaultTrackCall(TOKEN, { kind: "named" }).calldata).toEqual([TOKEN, "2"]);
    expect(setDefaultTrackCall(TOKEN, { kind: "named" }).entrypoint).toBe("set_default_track");
  });

  it("encodes SoundMode: Live=0, Original=1", () => {
    expect(setTrackModeCall(TOKEN, { kind: "named" }, "live").calldata).toEqual([TOKEN, "2", "0"]);
    expect(setTrackModeCall(TOKEN, { kind: "shared", id: 1 }, "original").calldata).toEqual([TOKEN, "0", "1", "1"]);
    expect(setTrackModeCall(TOKEN, { kind: "named" }, "live").entrypoint).toBe("set_track_sound_mode");
  });
});

describe("music safety guard", () => {
  // Exactly what the live API returned (unpadded addresses).
  const ok = {
    skull: "0x2798a8dc91bf1ef502cf8710751d26128fdf8e9d0823522fc08632ecc9172e8",
    soundManager: "0x1bbece5870dabbbec40efb73457848fd5425320600a42684aa23271c43abe8b",
    price: "1000000000000000000",
  };
  it("accepts the expected contracts and price", () => expect(musicContractsProblem(ok)).toBeNull());
  it("refuses an unknown token, manager or price", () => {
    expect(musicContractsProblem({ ...ok, skull: "0x1" })).toMatch(/token/);
    expect(musicContractsProblem({ ...ok, soundManager: "0x1" })).toMatch(/contract/);
    expect(musicContractsProblem({ ...ok, price: "2000000000000000000" })).toMatch(/price/);
  });
});

describe("formatSkull", () => {
  it("formats wei", () => {
    expect(formatSkull(TRACK_PRICE_WEI)).toBe("1");
    expect(formatSkull(1_500_000_000_000_000_000n)).toBe("1.5");
    expect(formatSkull(0n)).toBe("0");
  });
});
