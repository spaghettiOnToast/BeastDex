import { describe, expect, it, vi, beforeEach } from "vitest";

const lookup = vi.fn();
vi.mock("../src/services/walletNames", () => ({ lookupWalletNames: (a: string[]) => lookup(a) }));

import { usernameCache } from "../src/services/usernameCache";
import { normaliseStarknetAddress } from "../src/utils/address";

const named = normaliseStarknetAddress("0x1234")!;
const unnamed = normaliseStarknetAddress("0x3c39219e")!;

describe("usernameCache", () => {
  beforeEach(() => {
    usernameCache.clearCache();
    lookup.mockReset();
  });

  it("returns no entry (not a shortened address) for wallets without a name", async () => {
    lookup.mockResolvedValue({ [named]: "alice" });
    const first = await usernameCache.getUsernames([named, unnamed]);
    expect(first).toEqual({ [named]: "alice" });
    // Cached: same answer without another lookup.
    const second = await usernameCache.getUsernames([named, unnamed]);
    expect(second).toEqual({ [named]: "alice" });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("returns no names when the lookup fails, and retries next time", async () => {
    lookup.mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await usernameCache.getUsernames([named])).toEqual({});
    lookup.mockResolvedValue({ [named]: "alice" });
    expect(await usernameCache.getUsernames([named])).toEqual({ [named]: "alice" });
  });
});
