import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/services/beast/species", () => ({
  fetchBeastSpecies: vi.fn(async () => [
    { speciesId: 1, name: "Warlock", tier: 1, type: "Magic", renderer: "0x1cda1fa6d9d97f484603e32a7958cc0693dc971582319b9577b136d23019bd5", rainbowPresets: 10, notesPresets: 12 },
    { speciesId: 94, name: "Wulver", tier: 4, type: "Hunter", renderer: "0x9853fbef30bb72e083bf65aaa682ff7033c1a31b81015a8d843d9e49a9e17c", rainbowPresets: 12, notesPresets: 10 },
  ]),
}));

import { beastsV3 } from "@provable-games/collectables";
import { fetchLootStakes, lootSpecies, parseTaking } from "../src/services/lootDungeon";

const ME = "0xa2621ff2b0317ac99b881541b96aa75a7e118901b45025aad22a23633cccbe";
const OTHER = "0x419d649f349f191ded9ae98f63627082d2d3bb6888af8fb7cd387ff54a054fc";

// 150 Loot token ids (a real mainnet Koschei with varied affixes), so
// beast_stake needs two batches (RPC cap: 100).
const BASE = beastsV3.decodeTokenId(65820186310473658339361490625647887186737374920304507346877525443113n);
const IDS = Array.from({ length: 150 }, (_, i) =>
  beastsV3.encodeTokenId({ ...BASE, prefix: 1 + (i % 60), suffix: 1 + Math.floor(i / 60) }),
);

describe("Loot Bag stakes", () => {
  let batchSizes: number[];
  beforeEach(() => {
    batchSizes = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      const calls = JSON.parse(init.body) as Array<{ id: number; params: { request: { calldata: string[] } } }>;
      batchSizes.push(calls.length);
      return new Response(JSON.stringify(calls.map((c) => {
        if (calls.length === 1 && c.params.request.calldata.length === 1) {
          // get_species_token_ids(94)
          return { jsonrpc: "2.0", id: c.id, result: [`0x${IDS.length.toString(16)}`, ...IDS.map((id) => `0x${id.toString(16)}`)] };
        }
        // beast_stake: token 3 is mine (transforming), token 7 someone else's, the rest unstaked.
        const idx = IDS.findIndex((id) => {
          const [lo, hi] = c.params.request.calldata.map(BigInt);
          return id === lo + (hi << 128n);
        });
        const staker = idx === 3 ? ME : idx === 7 ? OTHER : "0x0";
        return { jsonrpc: "2.0", id: c.id, result: [staker, "0x6a1b0000", "0x6a200000", "0x0"] };
      })), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("only reads Loot-renderer species", async () => {
    const { fetchBeastSpecies } = await import("../src/services/beast/species");
    expect(lootSpecies(await fetchBeastSpecies()).map((s) => s.speciesId)).toEqual([94]);
  });

  it("returns only the owner's stakes, batching beast_stake under the RPC cap", async () => {
    const stakes = await fetchLootStakes(ME);
    expect(stakes).toHaveLength(1);
    expect(stakes[0].tokenId).toBe(IDS[3].toString());
    expect(stakes[0].transformsAt).toBe(0x6a200000);
    expect(batchSizes).toEqual([1, 100, 50]);
  });
});

describe("Loot Dungeon takings", () => {
  // A real mainnet BeastClaimed (ordinary mint: taken_token_id = 0, taken_from = 0).
  const keys = ["0xsel", "0x100000000001f1500000400000000060000000001c878ba01144c53000b1e41", "0x115105e000000000000006001cd0237", "0x2eb2002e0082ac40001c87e36"];
  const data = ["0xbf", "0x5d", "0x2b", "0x2", "0x41", "0x17", ME, "0x0", "0x0", "0x0"];

  it("ignores ordinary claims", () => {
    expect(parseTaking({ keys, data, block_number: 18157662, transaction_hash: "0xabc" })).toBeNull();
  });

  it("reads the taken beast, who lost it and who took it", () => {
    const id = IDS[5];
    const lo = `0x${(id & ((1n << 128n) - 1n)).toString(16)}`;
    const hi = `0x${(id >> 128n).toString(16)}`;
    const t = parseTaking({ keys, data: [...data.slice(0, 6), OTHER, lo, hi, ME], block_number: 18200000, transaction_hash: "0xdef" });
    expect(t).toMatchObject({ tokenId: id.toString(), takenBy: OTHER, block: 18200000, txHash: "0xdef" });
    // The killer gets a new token (the claim's token_id); the taken one is burned.
    expect(t!.newTokenId).toBe((BigInt(keys[2]) + (BigInt(keys[3]) << 128n)).toString());
    expect(BigInt(t!.takenFrom)).toBe(BigInt(ME));
  });
});
