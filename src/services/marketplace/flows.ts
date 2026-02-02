import { getDefaultListingExpiration } from "./constants";

type BigNumberishInput = string | number | bigint;

function toBigInt(value: BigNumberishInput): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("Cannot convert empty string to bigint");
  }
  return BigInt(trimmed.startsWith("0x") ? trimmed : trimmed);
}

export type CancelListingParams<TAccount> = {
  account: TAccount;
  collectionAddress: string;
  tokenId: BigNumberishInput;
  orderId: BigNumberishInput;
};

export async function cancelListingFlow<TAccount>(
  actions: {
    cancel: (
      account: TAccount,
      orderId: bigint,
      collectionAddress: string,
      tokenId: bigint
    ) => Promise<unknown>;
  },
  params: CancelListingParams<TAccount>
) {
  const { cancel } = actions;
  const { account, collectionAddress, tokenId, orderId } = params;
  const tokenIdBigInt = toBigInt(tokenId);
  const orderIdBigInt = toBigInt(orderId);
  // Return the underlying action result so callers can surface tx hash
  return await cancel(account, orderIdBigInt, collectionAddress, tokenIdBigInt);
}

export type EditListingParams<TAccount> = CancelListingParams<TAccount> & {
  newPrice: BigNumberishInput;
  currencyAddress: string;
  quantity?: BigNumberishInput;
  expiration?: BigNumberishInput;
};

class EditListingError extends Error {
  public step: "cancel" | "list";
  public cancelSucceeded: boolean;

  constructor(message: string, step: "cancel" | "list", cancelSucceeded: boolean) {
    super(message);
    this.name = "EditListingError";
    this.step = step;
    this.cancelSucceeded = cancelSucceeded;
  }
}

export async function editListingFlow<TAccount>(
  actions: {
    cancel: (
      account: TAccount,
      orderId: bigint,
      collectionAddress: string,
      tokenId: bigint
    ) => Promise<unknown>;
    list: (
      account: TAccount,
      collectionAddress: string,
      tokenId: bigint,
      quantity: bigint,
      price: bigint,
      currencyAddress: string,
      expiration: bigint
    ) => Promise<unknown>;
  },
  params: EditListingParams<TAccount>
) {
  const {
    account,
    collectionAddress,
    tokenId,
    orderId,
    newPrice,
    currencyAddress,
    quantity = 1n,
    expiration,
  } = params;

  const tokenIdBigInt = toBigInt(tokenId);
  const orderIdBigInt = toBigInt(orderId);
  const priceBigInt = toBigInt(newPrice);
  const quantityBigInt = toBigInt(quantity);
  const expirationBigInt = toBigInt(
    expiration ?? getDefaultListingExpiration()
  );

  // Step 1: Cancel existing listing
  try {
    await actions.cancel(account, orderIdBigInt, collectionAddress, tokenIdBigInt);
  } catch (error) {
    throw new EditListingError(
      (error as Error).message || "Failed to cancel existing listing",
      "cancel",
      false
    );
  }

  // Step 2: Create new listing
  try {
    await actions.list(
      account,
      collectionAddress,
      tokenIdBigInt,
      quantityBigInt,
      priceBigInt,
      currencyAddress,
      expirationBigInt
    );
  } catch (error) {
    throw new EditListingError(
      (error as Error).message || "Failed to create new listing",
      "list",
      true // Cancel already succeeded
    );
  }
}
