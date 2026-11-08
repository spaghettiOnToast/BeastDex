import { describe, it, expect, vi, beforeEach } from "vitest";
import { starknetId } from "starknet";

const env = vi.hoisted(() => ({
  domains: {} as Record<string, { resolver: string; expiry: number }>, // encoded label -> details
  primary: {} as Record<string, string>, // resolver -> encoded primary
}));

vi.mock("../src/services/controller", () => ({
  lookupControllerUsernames: async () => ({}),
  lookupControllerAddresses: async (names: string[]) =>
    Object.fromEntries(names.map((n) => [n.toLowerCase(), n === "ctrl" ? ["0x0c"] : []])),
}));
vi.mock("../src/services/tx", () => ({
  withReadProvider: async <T,>(fn: (p: unknown) => Promise<T>) =>
    fn({
      callContract: async ({ entrypoint, calldata }: { entrypoint: string; calldata: string[] }) => {
        if (entrypoint === "get_details_by_domain") {
          const d = env.domains[calldata[0]];
          return ["0x0", d?.resolver ?? "0x0", "0x1", "0x0", "0x" + (d?.expiry ?? 0).toString(16), "0x0"];
        }
        return [env.primary[calldata[0]] ?? "0x0"];
      },
    }),
}));

import { lookupProfileAddresses, resolveBrotherName } from "../src/services/walletNames";
import { normaliseStarknetAddress } from "../src/utils/address";

const enc = (name: string) => "0x" + starknetId.useEncoded(name).toString(16);
const A = "0xa713449621a87918438c335880a49681413a86a679dda44a6f184b08b24f4f";
const future = Math.floor(Date.now() / 1000) + 86400;

describe("resolveBrotherName", () => {
  beforeEach(() => {
    env.domains = {};
    env.primary = {};
  });

  it("resolves a name whose resolver has it as primary", async () => {
    env.domains[enc("spaghetti")] = { resolver: A, expiry: future };
    env.primary[A] = enc("spaghetti");
    expect(await resolveBrotherName("Spaghetti.brother")).toBe(normaliseStarknetAddress(A));
  });

  it("rejects a name pointed at a wallet whose primary is something else", async () => {
    env.domains[enc("imposter")] = { resolver: A, expiry: future };
    env.primary[A] = enc("spaghetti");
    expect(await resolveBrotherName("imposter.brother")).toBeNull();
  });

  it("rejects expired, unregistered and malformed names", async () => {
    env.domains[enc("old")] = { resolver: A, expiry: 1000 };
    env.primary[A] = enc("old");
    expect(await resolveBrotherName("old.brother")).toBeNull();
    expect(await resolveBrotherName("nobody.brother")).toBeNull();
    expect(await resolveBrotherName("bad name!.brother")).toBeNull();
  });

  it("lookupProfileAddresses routes .brother on-chain and others to Controller", async () => {
    env.domains[enc("spaghetti")] = { resolver: A, expiry: future };
    env.primary[A] = enc("spaghetti");
    expect(await lookupProfileAddresses(["spaghetti.brother", "ctrl"])).toEqual({
      "spaghetti.brother": [normaliseStarknetAddress(A)],
      ctrl: ["0x0c"],
    });
  });
});
