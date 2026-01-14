import type {
  AccountInterface,
  ProviderInterface,
  Call,
  BigNumberish,
} from "starknet";
import { BEASTS_COLLECTION_ADDRESS, MARKETPLACE_ADDRESS } from "./constants";

type Uint256 = [string, string];

const UINT128_MASK = (1n << 128n) - 1n;

function toHex(value: bigint): string {
  const hex = value.toString(16);
  return hex.startsWith("0x") ? hex : `0x${hex}`;
}

function toUint256(value: bigint): Uint256 {
  const low = value & UINT128_MASK;
  const high = value >> 128n;
  return [toHex(low), toHex(high)];
}

export function getProvider(account: AccountInterface): ProviderInterface {
  // Try multiple ways to get the provider for different account types
  const provider =
    (account as any)?.provider ??
    (account as any)?.providerOrSigner ??
    (account as any)?.account?.provider ??
    account; // For Cartridge Controller, the account itself might be the provider

  if (!provider) {
    throw new Error("Provider not available on account");
  }

  // If the account itself acts as a provider (has callContract method), use it
  if (typeof (account as any).callContract === "function") {
    return account as unknown as ProviderInterface;
  }

  return provider as ProviderInterface;
}

async function callAllowance(
  provider: ProviderInterface,
  tokenAddress: string,
  owner: string,
  spender: string
): Promise<bigint> {
  const response = await provider.callContract(
    {
      contractAddress: tokenAddress,
      entrypoint: "allowance",
      calldata: [owner, spender],
    },
    "latest"
  );
  const rawResult = Array.isArray(response)
    ? response
    : (response as any).result;
  if (!Array.isArray(rawResult) || rawResult.length < 2) {
    return 0n;
  }
  const [low, high] = rawResult;
  const lowBig = BigInt(low);
  const highBig = BigInt(high);
  return highBig * (1n << 128n) + lowBig;
}

async function callIsApprovedForAll(
  provider: ProviderInterface,
  owner: string,
  operator: string
): Promise<boolean> {
  const response = await provider.callContract(
    {
      contractAddress: BEASTS_COLLECTION_ADDRESS,
      entrypoint: "is_approved_for_all",
      calldata: [owner, operator],
    },
    "latest"
  );
  const rawResult = Array.isArray(response)
    ? response
    : (response as any).result;
  const value = Array.isArray(rawResult) ? rawResult[0] : undefined;
  return value === "0x1" || value === "1" || value === "0x01";
}

export async function ensureCollectionApproval(account: AccountInterface) {
  if (!account.address) {
    throw new Error("Wallet address not available");
  }
  const provider = getProvider(account);
  const alreadyApproved = await callIsApprovedForAll(
    provider,
    account.address,
    MARKETPLACE_ADDRESS
  );
  if (alreadyApproved) {
    return;
  }

  // Execute approval transaction
  const result = await account.execute([
    {
      contractAddress: BEASTS_COLLECTION_ADDRESS,
      entrypoint: "set_approval_for_all",
      calldata: [MARKETPLACE_ADDRESS, "0x1"],
    },
  ]);

  // Wait for transaction to be accepted on L2
  if (result?.transaction_hash) {
    await provider.waitForTransaction(result.transaction_hash, {
      retryInterval: 2000, // Check every 2 seconds
    });
  }
}

export async function ensureErc20Allowance(
  account: AccountInterface,
  tokenAddress: string | undefined,
  requiredAmount: string
) {
  if (!tokenAddress || tokenAddress === "0x0") {
    return;
  }
  if (!account.address) {
    throw new Error("Wallet address not available");
  }
  const provider = getProvider(account);
  const allowance = await callAllowance(
    provider,
    tokenAddress,
    account.address,
    MARKETPLACE_ADDRESS
  );
  const needed = BigInt(requiredAmount);
  if (allowance >= needed) {
    return;
  }
  const calldata = toUint256(needed);

  // Execute approval transaction
  const result = await account.execute([
    {
      contractAddress: tokenAddress,
      entrypoint: "approve",
      calldata: [MARKETPLACE_ADDRESS, ...calldata],
    },
  ]);

  // Wait for transaction to be accepted on L2
  if (result?.transaction_hash) {
    await provider.waitForTransaction(result.transaction_hash, {
      retryInterval: 2000, // Check every 2 seconds
    });
  }
}

export async function getErc20ApprovalCallIfNeeded(
  account: AccountInterface,
  tokenAddress: string | undefined,
  requiredAmount: string
): Promise<{
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
} | null> {
  if (!tokenAddress || tokenAddress === "0x0") {
    return null;
  }
  if (!account.address) {
    throw new Error("Wallet address not available");
  }
  const provider = getProvider(account);
  const allowance = await callAllowance(
    provider,
    tokenAddress,
    account.address,
    MARKETPLACE_ADDRESS
  );
  const needed = BigInt(requiredAmount);
  if (allowance >= needed) {
    return null;
  }
  const calldata = toUint256(needed);

  return {
    contractAddress: tokenAddress,
    entrypoint: "approve",
    calldata: [MARKETPLACE_ADDRESS, ...calldata],
  };
}

export async function getErc20Balance(
  provider: ProviderInterface,
  tokenAddress: string,
  owner: string
): Promise<bigint> {
  const response = await provider.callContract(
    {
      contractAddress: tokenAddress,
      entrypoint: "balanceOf",
      calldata: [owner],
    },
    "latest"
  );
  const rawResult = Array.isArray(response)
    ? response
    : (response as any).result;
  if (!Array.isArray(rawResult) || rawResult.length < 2) {
    return 0n;
  }
  const [low, high] = rawResult;
  const lowBig = BigInt(low);
  const highBig = BigInt(high);
  return highBig * (1n << 128n) + lowBig;
}

export async function checkSufficientBalance(
  account: AccountInterface,
  tokenAddress: string | undefined,
  requiredAmount: bigint
): Promise<{ sufficient: boolean; balance: bigint }> {
  if (!tokenAddress || tokenAddress === "0x0") {
    // Native token - we can't easily check without additional setup
    return { sufficient: true, balance: 0n };
  }
  if (!account.address) {
    throw new Error("Wallet address not available");
  }
  const provider = getProvider(account);
  const balance = await getErc20Balance(
    provider,
    tokenAddress,
    account.address
  );
  return {
    sufficient: balance >= requiredAmount,
    balance,
  };
}

/**
 * Get the owner of an NFT token by calling ownerOf on the contract
 */
async function getTokenOwner(
  provider: ProviderInterface,
  collectionAddress: string,
  tokenId: BigNumberish,
): Promise<string | null> {
  try {
    // Convert tokenId to Uint256 format
    const tokenIdBigInt = typeof tokenId === 'bigint' ? tokenId : BigInt(tokenId.toString());
    const tokenIdU256 = toUint256(tokenIdBigInt);

    const response = await provider.callContract(
      {
        contractAddress: collectionAddress,
        entrypoint: "ownerOf",
        calldata: tokenIdU256,
      },
      "latest"
    );

    const rawResult = Array.isArray(response) ? response : (response as any).result;
    if (!Array.isArray(rawResult) || rawResult.length === 0) {
      return null;
    }

    // ownerOf returns a single felt252 (address)
    return rawResult[0];
  } catch (error) {
    console.error("[validateListingOwnership] Error fetching token owner:", error);
    return null;
  }
}

/**
 * Validate that a listing is still valid by checking if the seller still owns the token
 * @returns true if the listing is valid (seller still owns the token), false otherwise
 */
export async function validateListingOwnership(
  provider: ProviderInterface,
  collectionAddress: string,
  tokenId: BigNumberish,
  expectedOwner: string,
): Promise<boolean> {
  const actualOwner = await getTokenOwner(provider, collectionAddress, tokenId);

  if (!actualOwner) {
    return false; // Unable to verify ownership
  }

  // Normalize addresses for comparison (case-insensitive)
  const normalizedActual = actualOwner.toLowerCase().trim();
  const normalizedExpected = expectedOwner.toLowerCase().trim();

  return normalizedActual === normalizedExpected;
}

/**
 * Batch validate multiple listings
 * @returns Map of tokenId -> isValid
 */
export async function batchValidateListings(
  provider: ProviderInterface,
  collectionAddress: string,
  listings: Array<{ tokenId: BigNumberish; seller: string }>,
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  // Process in parallel for better performance
  const validationPromises = listings.map(async (listing) => {
    const isValid = await validateListingOwnership(
      provider,
      collectionAddress,
      listing.tokenId,
      listing.seller
    );
    return { tokenId: listing.tokenId.toString(), isValid };
  });

  const validationResults = await Promise.all(validationPromises);

  for (const result of validationResults) {
    results.set(result.tokenId, result.isValid);
  }

  return results;
}

/**
 * Build marketplace execute call for purchasing a listing
 */
export function buildMarketplaceExecuteCall(
  orderId: BigNumberish,
  collection: string,
  tokenId: BigNumberish,
  quantity: BigNumberish,
  royalties: boolean,
  _currency: string,
  _price: BigNumberish,
  clientFee: BigNumberish,
  clientReceiver: string
): Call {
  // Convert tokenId to Uint256 format
  const tokenIdBigInt =
    typeof tokenId === "bigint" ? tokenId : BigInt(tokenId.toString());
  const tokenIdU256 = toUint256(tokenIdBigInt);

  return {
    contractAddress: MARKETPLACE_ADDRESS,
    entrypoint: "execute",
    calldata: [
      orderId.toString(),
      collection,
      ...tokenIdU256, // token_id as Uint256
      ...tokenIdU256, // asset_id (same as token_id for ERC721)
      quantity.toString(),
      royalties ? "1" : "0",
      clientFee.toString(),
      clientReceiver,
    ],
  };
}

/**
 * Execute marketplace purchase with approval in a single multicall transaction
 * This provides a better UX by combining approval + purchase into one signature
 */
export async function executePurchaseWithApproval(
  account: AccountInterface,
  orderId: BigNumberish,
  collection: string,
  tokenId: BigNumberish,
  quantity: BigNumberish,
  royalties: boolean,
  currency: string,
  price: BigNumberish,
  clientFee: BigNumberish,
  clientReceiver: string
): Promise<{ transaction_hash: string }> {
  const calls: Call[] = [];

  // Calculate total amount including client fee
  // Client fee is in basis points (10000 = 100%), so: totalAmount = price + (price * clientFee / 10000)
  const priceBigInt = typeof price === 'bigint' ? price : BigInt(price.toString());
  const clientFeeBigInt = typeof clientFee === 'bigint' ? clientFee : BigInt(clientFee.toString());
  const feeAmount = (priceBigInt * clientFeeBigInt) / 10000n;
  const totalAmount = priceBigInt + feeAmount;

  // Check if we need to add approval call with total amount (price + fee)
  const approvalCall = await getErc20ApprovalCallIfNeeded(
    account,
    currency,
    totalAmount.toString()
  );

  if (approvalCall) {
    calls.push(approvalCall);
  }

  // Add the purchase call
  const purchaseCall = buildMarketplaceExecuteCall(
    orderId,
    collection,
    tokenId,
    quantity,
    royalties,
    currency,
    price,
    clientFee,
    clientReceiver
  );
  console.log(approvalCall);
  console.log(purchaseCall);
  calls.push(purchaseCall);

  // Execute all calls in one transaction
  const result = await account.execute(calls);

  // Wait for transaction confirmation
  if (result?.transaction_hash) {
    const provider = getProvider(account);
    await provider.waitForTransaction(result.transaction_hash, {
      retryInterval: 2000,
    });
  }

  return {
    transaction_hash: result.transaction_hash || "",
  };
}
