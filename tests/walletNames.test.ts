import { describe, it, expect, vi, beforeEach } from "vitest";

const env = vi.hoisted(() => ({
  controller: {} as Record<string, string>,
  brother: {} as Record<string, string>, // address -> encoded primary domain (hex)
}));

vi.mock("../src/services/controller", () => ({
  lookupControllerUsernames: async (addrs: string[]) =>
    Object.fromEntries(addrs.filter((a) => env.controller[a]).map((a) => [a, env.controller[a]])),
}));
vi.mock("../src/services/tx", () => ({
  withReadProvider: async <T,>(fn: (p: unknown) => Promise<T>) =>
    fn({
      callContract: async ({ calldata }: { calldata: string[] }) => [env.brother[calldata[0]] ?? "0x0"],
    }),
}));

import { decodeBrotherDomain, isCleanName, lookupWalletNames } from "../src/services/walletNames";
import { normaliseStarknetAddress } from "../src/utils/address";
import { starknetId } from "starknet";

const A = normaliseStarknetAddress("0x00a713449621a87918438c335880a49681413a86a679dda44a6f184b08b24f4f")!;
const B = normaliseStarknetAddress("0x0b")!;
const C = normaliseStarknetAddress("0x0c")!;
// separate addresses for the profanity test (names are cached per address)
const D = normaliseStarknetAddress("0x0d")!;
const E = normaliseStarknetAddress("0x0e")!;
const enc = (name: string) => "0x" + starknetId.useEncoded(name).toString(16);

describe("Brother ID names", () => {
  it("decodes the on-chain primary domain (what Ready shows)", () => {
    expect(decodeBrotherDomain("0x21a9f0c8188c")).toBe("spaghetti.brother");
    expect(decodeBrotherDomain("0x0")).toBeNull();
  });
});

describe("isCleanName", () => {
  it("blocks profanity incl. leetspeak, allows innocent words", () => {
    expect(isCleanName("spaghetti.brother")).toBe(true);
    expect(isCleanName("assassin")).toBe(true);
    expect(isCleanName("sh1t.brother")).toBe(false);
    expect(isCleanName("b1tch")).toBe(false);
  });
});

describe("lookupWalletNames", () => {
  beforeEach(() => {
    env.controller = {};
    env.brother = {};
  });

  it("prefers the Controller username, then the .brother name", async () => {
    env.controller = { [A]: "spag" };
    env.brother = { [A]: enc("spaghetti"), [B]: enc("bobby") };
    const names = await lookupWalletNames([A, B, C]);
    expect(names).toEqual({ [A]: "spag", [B]: "bobby.brother" });
  });

  it("drops profane names so the address is shown instead", async () => {
    env.controller = { [D]: "fuckface" };
    env.brother = { [D]: enc("spaghetti"), [E]: enc("shit") };
    const names = await lookupWalletNames([D, E]);
    expect(names).toEqual({ [D]: "spaghetti.brother" });
  });
});
