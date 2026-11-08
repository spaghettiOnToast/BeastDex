import { describe, it, expect } from "vitest";
import { unrankedReason } from "../src/utils/beast";
import type { Beast } from "../src/services/beast";

const beast = (rank: number, extra: Partial<Beast> = {}): Beast =>
  ({ tokenId: "1", name: "x", power: 1, attributes: [{ trait_type: "Rank", value: String(rank) }], ...extra }) as unknown as Beast;

describe("unrankedReason", () => {
  it("is null for ranked beasts", () => expect(unrankedReason(beast(5, { minterData: 0 }))).toBeNull());
  it("labels Genesis beasts", () => expect(unrankedReason(beast(0, { genesis: true, minterData: 7 }))).toBe("genesis"));
  it("labels new v3 mints (minterData 0) as Festival", () => expect(unrankedReason(beast(0, { minterData: 0 }))).toBe("festival"));
  it("falls back to Unranked", () => expect(unrankedReason(beast(0, { minterData: 1234 }))).toBe("unranked"));
});
