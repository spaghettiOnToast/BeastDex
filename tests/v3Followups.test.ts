import { describe, it, expect, vi, beforeEach } from "vitest";
import { RpcProvider } from "starknet";

// --- fetchFestivalTokens: scan past burned ids -----------------------------

const chain = vi.hoisted(() => ({ supply: 0, live: new Set<number>() }));

vi.mock("../src/services/tx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/tx")>();
  return {
    ...actual,
    withReadProvider: async <T,>(fn: (p: RpcProvider) => Promise<T>) =>
      fn({
        callContract: async ({ entrypoint, calldata }: { entrypoint: string; calldata: string[] }) => {
          if (entrypoint === "total_supply") return [`0x${chain.supply.toString(16)}`, "0x0"];
          const id = Number(BigInt(calldata[0]));
          if (!chain.live.has(id)) throw new Error("ERC721: invalid token ID");
          if (entrypoint === "owner_of") return ["0xabc"];
          throw new Error("no token_uri in test"); // metadata optional
        },
      } as unknown as RpcProvider),
  };
});

import { fetchFestivalTokens, type FestivalCollection } from "../src/services/festivalBeasts";

const collection = (address: string): FestivalCollection => ({
  slug: "test",
  name: "Test",
  address,
  dungeonId: "0",
  dungeonName: "Test",
  accentColor: "#fff",
  blurb: "",
});

describe("fetchFestivalTokens", () => {
  beforeEach(() => {
    chain.supply = 0;
    chain.live = new Set();
  });

  it("loads ids 1..supply when nothing is burned", async () => {
    chain.supply = 3;
    chain.live = new Set([1, 2, 3]);
    const tokens = await fetchFestivalTokens(collection("0x1"));
    expect(tokens.map((t) => t.tokenId)).toEqual([1, 2, 3]);
  });

  it("skips burned ids and keeps scanning to find the highest tokens", async () => {
    chain.supply = 3; // 5 minted, #2 and #4 burned
    chain.live = new Set([1, 3, 5]);
    const tokens = await fetchFestivalTokens(collection("0x2"));
    expect(tokens.map((t) => t.tokenId)).toEqual([1, 3, 5]);
    expect(tokens.every((t) => t.owner === "0xabc")).toBe(true);
  });

  it("stops after the scan slack if tokens never turn up", async () => {
    chain.supply = 2;
    chain.live = new Set([1]);
    const tokens = await fetchFestivalTokens(collection("0x3"));
    expect(tokens.map((t) => t.tokenId)).toEqual([1]);
  });
});

// --- getReadProvider: public-RPC fallback on access errors -----------------

describe("getReadProvider", () => {
  it("retries callContract on the public RPC when the configured one refuses access", async () => {
    vi.stubEnv("VITE_RPC_URL", "https://refuses.example/rpc");
    vi.resetModules();
    const { getReadProvider, DEFAULT_RPC_URL } = await vi.importActual<typeof import("../src/services/tx")>(
      "../src/services/tx",
    );
    const seen: string[] = [];
    const spy = vi.spyOn(RpcProvider.prototype, "callContract").mockImplementation(async function (this: RpcProvider) {
      const url = this.channel.nodeUrl;
      seen.push(url);
      if (url !== DEFAULT_RPC_URL) throw new Error("401 Unauthorized");
      return ["0x1"];
    });

    const res = await getReadProvider().callContract({ contractAddress: "0x1", entrypoint: "x", calldata: [] });
    expect(res).toEqual(["0x1"]);
    expect(seen).toEqual(["https://refuses.example/rpc", DEFAULT_RPC_URL]);

    spy.mockRestore();
    vi.unstubAllEnvs();
  });
});
