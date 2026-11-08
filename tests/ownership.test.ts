import { describe, it, expect } from "vitest";
import type { ProviderInterface } from "starknet";
import { validateListingOwnership } from "../src/services/marketplace/approvals";

const OWNER = "0xa713449621a87918438c335880a49681413a86a679dda44a6f184b08b24f4f";
const V3 = "0x00f739e402e52830a736335a0f47d58ec78ba067443c9c6930da182eab2ff8b0";
const TOKEN = BigInt("0xad00026006c91c0001bfa457002c5c0800005a440000008a61ce4200");

/** Provider exposing only the given entrypoints (others revert like a missing entrypoint). */
const providerWith = (entrypoints: Record<string, string[]>) =>
  ({
    callContract: async ({ entrypoint }: { entrypoint: string }) => {
      if (!(entrypoint in entrypoints)) throw new Error("Requested entrypoint does not exist in the contract");
      return entrypoints[entrypoint];
    },
  }) as unknown as ProviderInterface;

describe("validateListingOwnership", () => {
  it("reads owner_of on snake_case-only contracts (Beasts v3)", async () => {
    const p = providerWith({ owner_of: [OWNER] });
    expect(await validateListingOwnership(p, V3, TOKEN, `0x00${OWNER.slice(2)}`)).toBe(true);
    expect(await validateListingOwnership(p, V3, TOKEN, "0x1234")).toBe(false);
  });

  it("falls back to camelCase ownerOf", async () => {
    const p = providerWith({ ownerOf: [OWNER] });
    expect(await validateListingOwnership(p, V3, TOKEN, OWNER)).toBe(true);
  });

  it("doesn't block when the owner can't be read (contract check is authoritative)", async () => {
    expect(await validateListingOwnership(providerWith({}), V3, TOKEN, OWNER)).toBe(true);
  });
});
