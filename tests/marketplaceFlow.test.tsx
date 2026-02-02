import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ListDialog from "../src/components/marketplace/ListDialog";
import {
  editListingFlow,
  cancelListingFlow,
} from "../src/services/marketplace/flows";
import {
  BEASTS_COLLECTION_ADDRESS,
  DEFAULT_PAYMENT_TOKEN,
} from "../src/services/marketplace/constants";

const mockAccount: any = {
  address: "0xabc",
  estimateInvokeFee: vi.fn(),
};

const mockProvider = {
  manifest: {},
};

const listMock = vi.fn();
const buildListCallsMock = vi.fn();
const cancelMock = vi.fn();

vi.mock("@starknet-react/core", () => ({
  useAccount: () => ({ account: mockAccount }),
}));

vi.mock("@cartridge/marketplace", () => {
  const mockConfigs = {
    ["0x534e5f4d41494e"]: {
      manifest: {
        contracts: [
          {
            tag: "MARKETPLACE-Marketplace",
            address: "0xmarketplace",
          },
        ],
        world: {
          address: "0xworld",
        },
      },
      toriiUrl: "http://localhost:1234",
      rpcUrl: "http://localhost:5050",
    },
  };

  return {
    NAMESPACE: "MARKETPLACE",
    configs: mockConfigs,
    useMarketplace: () => ({ provider: mockProvider }),
    useMarketplaceActions: () => ({
      list: listMock,
      buildListCalls: buildListCallsMock,
      cancel: cancelMock,
    }),
  };
});

const parsedCall = {
  contractAddress: "0xmarketplace",
  entrypoint: "list",
  calldata: ["encoded"],
};

vi.mock("@dojoengine/core", () => ({
  parseDojoCall: vi.fn(() => parsedCall),
}));

describe("Marketplace flows", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listMock.mockResolvedValue(undefined);
    buildListCallsMock.mockReturnValue([
      {
        contractAddress: BEASTS_COLLECTION_ADDRESS,
        entrypoint: "set_approval_for_all",
        calldata: ["0xmarketplace", "0x1"],
      },
      {
        contractName: "Marketplace",
        entrypoint: "list",
        calldata: ["encoded"],
      },
    ]);
    mockAccount.estimateInvokeFee.mockResolvedValue({ suggestedMaxFee: 1000n });
  });

  it("lists a beast with converted parameters", async () => {
    const onOpenChange = vi.fn();
    const onListed = vi.fn();

    render(
      <ListDialog
        open
        onOpenChange={onOpenChange}
        beast={{
          id: "123",
          name: "Test Beast",
          power: 10,
          attributes: [],
          image: "",
          numericId: 123,
          owner: "0xowner",
        }}
        onListed={onListed}
      />
    );

    await userEvent.type(screen.getByPlaceholderText("Enter price"), "1000");

    await waitFor(() =>
      expect(mockAccount.estimateInvokeFee).toHaveBeenCalled()
    );

    const submitButton = screen.getByRole("button", { name: "List" });
    expect(submitButton).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "List" }));

    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onListed).toHaveBeenCalled();
    const [
      accountArg,
      collectionArg,
      tokenIdArg,
      quantityArg,
      priceArg,
      currencyArg,
      expirationArg,
    ] = listMock.mock.calls[0];

    expect(accountArg).toBe(mockAccount);
    expect(collectionArg).toBe(BEASTS_COLLECTION_ADDRESS);
    expect(tokenIdArg).toBe(123n);
    expect(quantityArg).toBe(1n);
    expect(priceArg).toBe(1000n);
    expect(currencyArg).toBe(DEFAULT_PAYMENT_TOKEN.address);
    expect(typeof expirationArg).toBe("bigint");
  });

  it("performs edit listing flow in order", async () => {
    const cancelSpy = vi.fn().mockResolvedValue(undefined);
    const listSpy = vi.fn().mockResolvedValue(undefined);

    const expiration = 999n;
    await editListingFlow(
      { cancel: cancelSpy, list: listSpy },
      {
        account: mockAccount,
        collectionAddress: "0xcollection",
        tokenId: "42",
        orderId: 7,
        newPrice: "1337",
        currencyAddress: "0xcurrency",
        expiration,
      }
    );

    expect(cancelSpy).toHaveBeenCalledWith(
      mockAccount,
      7n,
      "0xcollection",
      42n
    );
    expect(listSpy).toHaveBeenCalledWith(
      mockAccount,
      "0xcollection",
      42n,
      1n,
      1337n,
      "0xcurrency",
      expiration
    );
    expect(
      cancelSpy.mock.invocationCallOrder[0]
    ).toBeLessThan(listSpy.mock.invocationCallOrder[0]);
  });

  it("performs cancel listing flow", async () => {
    const cancelSpy = vi.fn().mockResolvedValue(undefined);
    await cancelListingFlow(
      { cancel: cancelSpy },
      {
        account: mockAccount,
        collectionAddress: "0xcollection",
        tokenId: "77",
        orderId: "88",
      }
    );
    expect(cancelSpy).toHaveBeenCalledWith(
      mockAccount,
      88n,
      "0xcollection",
      77n
    );
  });
});
