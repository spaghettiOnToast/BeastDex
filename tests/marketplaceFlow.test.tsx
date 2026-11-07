import { describe, expect, it, vi, beforeEach } from "vitest";
import { editListingFlow, cancelListingFlow } from "../src/services/marketplace/flows";

// v3-sized (251-bit) token id: must survive the flows without precision loss.
const V3_TOKEN_ID = (1n << 250n) + 123456789n;

// ---- Mocks for the safety guard: chain class hash + indexer book config ----
const chain = { classHash: "", book: null as null | { paused: boolean; fee_num: number } };

vi.mock("../src/services/tx", () => ({
  withReadProvider: (fn: (p: unknown) => Promise<unknown>) =>
    fn({ getClassHashAt: async () => chain.classHash, getBlockNumber: async () => 0 }),
  resolveRpcUrl: () => "http://localhost",
}));
vi.mock("../src/hooks/useArcadeBookConfig", () => ({ fetchBookConfig: async () => chain.book }));
vi.mock("../src/services/marketplace/arcadeSqlClient", () => ({ runArcadeSql: async () => [] }));

import {
  checkMarketplaceSafety,
  executeMarketplaceCalls,
  MarketplaceSafetyError,
  PINNED_MARKETPLACE_CLASS_HASH,
  MAX_PROTOCOL_FEE_BPS,
} from "../src/services/marketplace/safety";
import { MARKETPLACE_ADDRESS } from "../src/services/marketplace/constants";

const mockAccount = { address: "0xabc", execute: vi.fn().mockResolvedValue({ transaction_hash: "0x1" }) };

describe("Marketplace flows", () => {
  it("performs edit listing flow in order (cancel, then list)", async () => {
    const cancelSpy = vi.fn().mockResolvedValue(undefined);
    const listSpy = vi.fn().mockResolvedValue(undefined);
    const expiration = 999n;
    await editListingFlow(
      { cancel: cancelSpy, list: listSpy },
      {
        account: mockAccount as never,
        collectionAddress: "0xcollection",
        tokenId: V3_TOKEN_ID.toString(),
        orderId: 7,
        newPrice: "1337",
        currencyAddress: "0xcurrency",
        expiration,
      },
    );
    expect(cancelSpy).toHaveBeenCalledWith(mockAccount, 7n, "0xcollection", V3_TOKEN_ID);
    expect(listSpy).toHaveBeenCalledWith(mockAccount, "0xcollection", V3_TOKEN_ID, 1n, 1337n, "0xcurrency", expiration);
    expect(cancelSpy.mock.invocationCallOrder[0]).toBeLessThan(listSpy.mock.invocationCallOrder[0]);
  });

  it("performs cancel listing flow", async () => {
    const cancelSpy = vi.fn().mockResolvedValue(undefined);
    await cancelListingFlow(
      { cancel: cancelSpy },
      { account: mockAccount as never, collectionAddress: "0xcollection", tokenId: "77", orderId: "88" },
    );
    expect(cancelSpy).toHaveBeenCalledWith(mockAccount, 88n, "0xcollection", 77n);
  });
});

describe("Marketplace safety guard", () => {
  const listCall = { contractAddress: MARKETPLACE_ADDRESS, entrypoint: "list", calldata: ["0x1"] };

  beforeEach(() => {
    mockAccount.execute.mockClear();
    chain.classHash = PINNED_MARKETPLACE_CLASS_HASH;
    chain.book = { paused: false, fee_num: 0 };
  });

  it("allows trading when the contract and book are as reviewed", async () => {
    await executeMarketplaceCalls(mockAccount, [listCall]);
    expect(mockAccount.execute).toHaveBeenCalledWith([listCall]);
  });

  it("blocks when the contract was upgraded (class hash changed)", async () => {
    chain.classHash = "0xdeadbeef";
    await checkMarketplaceSafety(true);
    await expect(executeMarketplaceCalls(mockAccount, [listCall])).rejects.toBeInstanceOf(MarketplaceSafetyError);
    expect(mockAccount.execute).not.toHaveBeenCalled();
  });

  it("blocks when the book is paused or the fee exceeds the cap", async () => {
    chain.book = { paused: true, fee_num: 0 };
    await checkMarketplaceSafety(true);
    await expect(executeMarketplaceCalls(mockAccount, listCall)).rejects.toThrow(/paused/);

    chain.book = { paused: false, fee_num: MAX_PROTOCOL_FEE_BPS + 1 };
    await checkMarketplaceSafety(true);
    await expect(executeMarketplaceCalls(mockAccount, listCall)).rejects.toThrow(/fee/);
  });

  it("guards approvals granted to the marketplace too", async () => {
    chain.classHash = "0xdeadbeef";
    await checkMarketplaceSafety(true);
    const approve = { contractAddress: "0xbeasts", entrypoint: "set_approval_for_all", calldata: [MARKETPLACE_ADDRESS, "0x1"] };
    await expect(executeMarketplaceCalls(mockAccount, [approve])).rejects.toBeInstanceOf(MarketplaceSafetyError);
  });

  it("always allows revoking the marketplace's approval", async () => {
    chain.classHash = "0xdeadbeef";
    await checkMarketplaceSafety(true);
    const revoke = { contractAddress: "0xbeasts", entrypoint: "set_approval_for_all", calldata: [MARKETPLACE_ADDRESS, "0x0"] };
    await executeMarketplaceCalls(mockAccount, [revoke]);
    expect(mockAccount.execute).toHaveBeenCalledWith([revoke]);
  });

  it("doesn't check unrelated calls", async () => {
    chain.classHash = "0xdeadbeef";
    await checkMarketplaceSafety(true);
    const send = { contractAddress: "0xbeasts", entrypoint: "transfer_from", calldata: ["0xa", "0xb", "0x1", "0x0"] };
    await executeMarketplaceCalls(mockAccount, [send]);
    expect(mockAccount.execute).toHaveBeenCalled();
  });
});
