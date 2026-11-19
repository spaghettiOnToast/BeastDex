import { describe, it, expect, vi, afterEach } from "vitest";
import { speciesFilter } from "../src/services/beast/setStats";

describe("speciesFilter", () => {
  it("sends a contiguous set as a range (the API caps beastIdIn at 50)", () => {
    const originals = Array.from({ length: 77 }, (_, i) => 77 - i);
    expect(speciesFilter(originals)).toEqual({ beastIdGte: 1, beastIdLte: 77 });
  });
  it("falls back to an id list when the set has gaps", () => {
    expect(speciesFilter([3, 1, 7])).toEqual({ beastIdIn: [1, 3, 7] });
  });
});

describe("username lookup", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sends lowercase names, since the lookup only matches those (mobile capitalises)", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(init.body);
      return new Response(JSON.stringify({ results: [{ username: "beamo", addresses: ["0x7155"] }] }), { status: 200 });
    }));
    const { lookupControllerAddresses } = await import("../src/services/controller");
    const out = await lookupControllerAddresses(["Beamo"]);
    expect(JSON.parse(bodies[0]).usernames).toEqual(["beamo"]);
    expect(out.beamo).toHaveLength(1);
  });
});
