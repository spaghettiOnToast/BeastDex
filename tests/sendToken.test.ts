import { describe, expect, it } from "vitest";
import { getChecksumAddress } from "starknet";
import {
  buildTransferCall,
  checkRecipientInput,
  maxSendable,
  parseTokenAmount,
  rawToInput,
  STRK_ADDRESS,
  STRK_FEE_RESERVE,
} from "../src/services/tokens/send";

const e18 = 10n ** 18n;
const ADDR = "0x00a713449621a87918438c335880a49681413a86a679dda44a6f184b08b24f4f";

describe("parseTokenAmount", () => {
  it("parses plain decimals", () => {
    expect(parseTokenAmount("12.5", 18)).toBe(12n * e18 + 5n * 10n ** 17n);
    expect(parseTokenAmount("1.61", 6)).toBe(1_610_000n);
    expect(parseTokenAmount(".5", 6)).toBe(500_000n);
    expect(parseTokenAmount("1,000", 0)).toBe(1000n);
  });
  it("rejects junk and too many decimals", () => {
    expect(parseTokenAmount("", 18)).toBeNull();
    expect(parseTokenAmount(".", 18)).toBeNull();
    expect(parseTokenAmount("1e5", 18)).toBeNull();
    expect(parseTokenAmount("-1", 18)).toBeNull();
    expect(parseTokenAmount("1.1234567", 6)).toBeNull();
  });
  it("round-trips with rawToInput", () => {
    expect(rawToInput(21435574129854387000000n, 18)).toBe("21435.574129854387");
    expect(parseTokenAmount(rawToInput(1_611_966n, 6), 6)).toBe(1_611_966n);
  });
});

describe("maxSendable", () => {
  it("keeps a STRK fee reserve, not for other tokens", () => {
    expect(maxSendable(10n * e18, STRK_ADDRESS)).toBe(10n * e18 - STRK_FEE_RESERVE);
    expect(maxSendable(1n * e18, STRK_ADDRESS)).toBe(0n);
    expect(maxSendable(10n * e18, "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49")).toBe(10n * e18);
  });
});

describe("checkRecipientInput", () => {
  it("accepts real addresses, lower or checksummed", () => {
    expect(checkRecipientInput(ADDR)).toEqual({ kind: "address", address: "0xa713449621a87918438c335880a49681413a86a679dda44a6f184b08b24f4f" });
    expect(checkRecipientInput(getChecksumAddress(ADDR)).kind).toBe("address");
  });
  it("rejects Ethereum, truncated and bad-checksum addresses", () => {
    expect(checkRecipientInput("0x" + "ab".repeat(20))).toMatchObject({ kind: "invalid", message: expect.stringMatching(/Ethereum/) });
    expect(checkRecipientInput("0xa7134496")).toMatchObject({ kind: "invalid", message: expect.stringMatching(/too short/) });
    const good = getChecksumAddress(ADDR);
    // flip the case of one letter so the checksum breaks
    const i = good.search(/[a-fA-F]/);
    const bad = good.slice(0, i) + (good[i] === good[i].toUpperCase() ? good[i].toLowerCase() : good[i].toUpperCase()) + good.slice(i + 1);
    expect(checkRecipientInput(bad)).toMatchObject({ kind: "invalid", message: expect.stringMatching(/checksum/) });
  });
  it("treats other input as a name to resolve", () => {
    expect(checkRecipientInput("spaghetti.brother")).toEqual({ kind: "name", name: "spaghetti.brother" });
    expect(checkRecipientInput("  ")).toEqual({ kind: "empty" });
    expect(checkRecipientInput("bad name!")).toMatchObject({ kind: "invalid" });
  });
});

describe("buildTransferCall", () => {
  it("encodes transfer(recipient, u256)", () => {
    const big = (5n << 128n) + 7n;
    expect(buildTransferCall("0x1", ADDR, big)).toEqual({
      contractAddress: "0x1",
      entrypoint: "transfer",
      calldata: [ADDR, "0x7", "0x5"],
    });
  });
});
