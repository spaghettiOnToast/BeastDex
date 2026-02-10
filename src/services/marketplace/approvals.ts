import type {
  AccountInterface,
  ProviderInterface,
  Call,
  BigNumberish,
} from "starknet";
import { BEASTS_COLLECTION_ADDRESS, MARKETPLACE_ADDRESS } from "./constants";
import { compareStarknetAddresses } from "../../utils/address";
import {
  toUint256Hex,
  fromUint256Raw,
} from "../../utils/uint256";

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
  return fromUint256Raw(low, high);
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

/**
 * Query ERC-2981 royalty info from the collection contract
 * Returns the royalty receiver address and royalty amount for a given sale price
 */
export async function queryRoyaltyInfo(
  provider: ProviderInterface,
  collectionAddress: string,
  tokenId: bigint,
  salePrice: bigint
): Promise<{ receiver: string; royaltyAmount: bigint } | null> {
  try {
    // Build token_id and sale_price as Uint256
    const tokenIdU256 = toUint256Hex(tokenId);
    const salePriceU256 = toUint256Hex(salePrice);

    const response = await provider.callContract(
      {
        contractAddress: collectionAddress,
        entrypoint: "royalty_info",
        calldata: [...tokenIdU256, ...salePriceU256],
      },
      "latest"
    );

    const rawResult = Array.isArray(response)
      ? response
      : (response as any).result;

    if (!Array.isArray(rawResult) || rawResult.length < 3) {
      return null;
    }

    // Result is: receiver (felt), royalty_amount (u256 = low, high)
    const receiver = rawResult[0];
    const royaltyAmount = fromUint256Raw(rawResult[1], rawResult[2]);

    return { receiver, royaltyAmount };
  } catch (error) {
    // Contract may not support ERC-2981
    console.warn("Failed to query royalty info (contract may not support ERC-2981):", error);
    return null;
  }
}

/**
 * Calculate royalty percentage from a sample query
 * Uses a reference price to determine the percentage
 */
export async function getRoyaltyPercentage(
  provider: ProviderInterface,
  collectionAddress: string,
  tokenId: bigint = 1n
): Promise<number | null> {
  try {
    // Use a reference sale price of 10000 to easily calculate percentage
    const referenceSalePrice = 10000n;
    const info = await queryRoyaltyInfo(provider, collectionAddress, tokenId, referenceSalePrice);

    if (!info) return null;

    // Calculate percentage: (royaltyAmount / salePrice) * 100
    const percentage = Number(info.royaltyAmount) / Number(referenceSalePrice) * 100;
    return percentage;
  } catch {
    return null;
  }
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

/**
 * Get collection approval call if needed (for multicall batching)
 * Returns null if already approved, otherwise returns the approval call
 */
export async function getCollectionApprovalCallIfNeeded(
  account: AccountInterface
): Promise<Call | null> {
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
    return null;
  }

  return {
    contractAddress: BEASTS_COLLECTION_ADDRESS,
    entrypoint: "set_approval_for_all",
    calldata: [MARKETPLACE_ADDRESS, "0x1"],
  };
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
  const calldata = toUint256Hex(needed);

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
  const calldata = toUint256Hex(needed);

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
  return fromUint256Raw(low, high);
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
    const tokenIdU256 = toUint256Hex(tokenIdBigInt);

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
  } catch {
    return null;
  }
}

/**
 * Check order validity using the marketplace contract's get_validity helper
 * This is the authoritative source - checks order status, ownership, expiration, etc.
 * @returns { valid: boolean, reason: string } - validity status and reason if invalid
 */
export async function getOrderValidity(
  provider: ProviderInterface,
  orderId: number | string,
  collection: string,
  tokenId: BigNumberish,
): Promise<{ valid: boolean; reason: string }> {
  try {
    const tokenIdBigInt = typeof tokenId === 'bigint' ? tokenId : BigInt(tokenId.toString());
    const tokenIdU256 = toUint256Hex(tokenIdBigInt);

    const response = await provider.callContract(
      {
        contractAddress: MARKETPLACE_ADDRESS,
        entrypoint: "get_validity",
        calldata: [
          orderId.toString(),
          collection,
          ...tokenIdU256,
        ],
      },
      "latest"
    );

    const rawResult = Array.isArray(response) ? response : (response as any).result;

    if (!Array.isArray(rawResult) || rawResult.length < 2) {
      console.warn("[getOrderValidity] Malformed response from contract, assuming valid");
      return { valid: true, reason: "" };
    }

    // Result is (bool, felt252) - bool as 0/1, felt252 as hex string
    const isValid = rawResult[0] === "0x1" || rawResult[0] === "1" || rawResult[0] === 1;
    const reasonFelt = rawResult[1];

    // Convert felt252 to readable string (it's stored as short string)
    let reason = "";
    if (reasonFelt && reasonFelt !== "0x0" && reasonFelt !== "0") {
      try {
        // Convert hex to ASCII string
        const hexStr = reasonFelt.startsWith("0x") ? reasonFelt.slice(2) : reasonFelt;
        const bytes = [];
        for (let i = 0; i < hexStr.length; i += 2) {
          const byte = parseInt(hexStr.substr(i, 2), 16);
          if (byte > 0) bytes.push(byte);
        }
        reason = String.fromCharCode(...bytes);
      } catch {
        reason = reasonFelt;
      }
    }

    return { valid: isValid, reason };
  } catch (error) {
    console.warn("[getOrderValidity] Contract call failed:", error);
    // Fallback: assume valid to avoid blocking transactions due to RPC issues
    return { valid: true, reason: "" };
  }
}

/**
 * Batch check order validities using the marketplace contract's get_validities helper
 * More efficient than individual calls for multiple orders
 * @returns Map of "orderId" -> { valid: boolean, reason: string }
 */
export async function getOrderValidities(
  provider: ProviderInterface,
  orders: Array<{ orderId: number | string; collection: string; tokenId: BigNumberish }>,
): Promise<Map<string, { valid: boolean; reason: string }>> {
  const results = new Map<string, { valid: boolean; reason: string }>();

  if (orders.length === 0) return results;

  try {
    // Build calldata for get_validities
    // The function expects Span<(u32, ContractAddress, u256)>
    // In Cairo calldata, a Span is represented as: [length, ...elements]
    // Each element is (order_id, collection, token_id_low, token_id_high)
    const calldata: string[] = [orders.length.toString()];

    for (const order of orders) {
      const tokenIdBigInt = typeof order.tokenId === 'bigint'
        ? order.tokenId
        : BigInt(order.tokenId.toString());
      const tokenIdU256 = toUint256Hex(tokenIdBigInt);

      calldata.push(
        order.orderId.toString(),
        order.collection,
        ...tokenIdU256,
      );
    }

    const response = await provider.callContract(
      {
        contractAddress: MARKETPLACE_ADDRESS,
        entrypoint: "get_validities",
        calldata,
      },
      "latest"
    );

    const rawResult = Array.isArray(response) ? response : (response as any).result;

    if (!Array.isArray(rawResult)) {
      throw new Error("Invalid response format");
    }

    // Response is Span<(bool, felt252)>
    // Format: [length, ...pairs] where each pair is (valid, reason)
    const resultLength = parseInt(rawResult[0], 16) || parseInt(rawResult[0], 10) || 0;

    for (let i = 0; i < Math.min(resultLength, orders.length); i++) {
      const baseIdx = 1 + (i * 2);
      if (baseIdx + 1 >= rawResult.length) break;

      const isValid = rawResult[baseIdx] === "0x1" || rawResult[baseIdx] === "1";
      const reasonFelt = rawResult[baseIdx + 1];

      let reason = "";
      if (reasonFelt && reasonFelt !== "0x0" && reasonFelt !== "0") {
        try {
          const hexStr = reasonFelt.startsWith("0x") ? reasonFelt.slice(2) : reasonFelt;
          const bytes = [];
          for (let j = 0; j < hexStr.length; j += 2) {
            const byte = parseInt(hexStr.substr(j, 2), 16);
            if (byte > 0) bytes.push(byte);
          }
          reason = String.fromCharCode(...bytes);
        } catch {
          reason = reasonFelt;
        }
      }

      results.set(orders[i].orderId.toString(), { valid: isValid, reason });
    }

    return results;
  } catch (error) {
    console.warn("[getOrderValidities] Contract call failed, falling back to individual checks:", error);

    // Fallback: check each order individually
    for (const order of orders) {
      const validity = await getOrderValidity(provider, order.orderId, order.collection, order.tokenId);
      results.set(order.orderId.toString(), validity);
    }

    return results;
  }
}

/**
 * Validate that a listing is still valid by checking if the seller still owns the token
 * @deprecated Use getOrderValidity for more comprehensive validation
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

  const isValid = compareStarknetAddresses(actualOwner, expectedOwner);

  if (!isValid && import.meta.env.DEV) {
    console.log(`[validateListingOwnership] Mismatch: actual=${actualOwner}, expected=${expectedOwner}`);
  }

  return isValid;
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
  const tokenIdU256 = toUint256Hex(tokenIdBigInt);

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
  calls.push(purchaseCall);

  // Execute with timeout to prevent hanging if wallet popup is closed
  const executeWithTimeout = <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Transaction timed out - wallet may have been closed")), timeoutMs)
      ),
    ]);
  };

  // Execute all calls in one transaction (2 minute timeout)
  const result = await executeWithTimeout(account.execute(calls), 120000);

  if (!result?.transaction_hash) {
    throw new Error("Transaction was not submitted");
  }

  // Wait for transaction confirmation
  const provider = getProvider(account);
  await provider.waitForTransaction(result.transaction_hash, {
    retryInterval: 2000,
  });

  return {
    transaction_hash: result.transaction_hash,
  };
}

