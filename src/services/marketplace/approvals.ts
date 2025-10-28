import type { AccountInterface, ProviderInterface } from "starknet";
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

function getProvider(account: AccountInterface): ProviderInterface {
  const provider = (account as any)?.provider ?? (account as any)?.providerOrSigner;
  if (!provider) {
    throw new Error("Provider not available on account");
  }
  return provider as ProviderInterface;
}

async function callAllowance(
  provider: ProviderInterface,
  tokenAddress: string,
  owner: string,
  spender: string,
): Promise<bigint> {
  const response = await provider.callContract({
    contractAddress: tokenAddress,
    entrypoint: "allowance",
    calldata: [owner, spender],
  });
  const rawResult = Array.isArray(response) ? response : (response as any).result;
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
  operator: string,
): Promise<boolean> {
  const response = await provider.callContract({
    contractAddress: BEASTS_COLLECTION_ADDRESS,
    entrypoint: "is_approved_for_all",
    calldata: [owner, operator],
  });
  const rawResult = Array.isArray(response) ? response : (response as any).result;
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
    MARKETPLACE_ADDRESS,
  );
  if (alreadyApproved) {
    return;
  }
  await account.execute([
    {
      contractAddress: BEASTS_COLLECTION_ADDRESS,
      entrypoint: "set_approval_for_all",
      calldata: [MARKETPLACE_ADDRESS, "0x1"],
    },
  ]);
}

export async function ensureErc20Allowance(
  account: AccountInterface,
  tokenAddress: string | undefined,
  requiredAmount: string,
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
    MARKETPLACE_ADDRESS,
  );
  const needed = BigInt(requiredAmount);
  if (allowance >= needed) {
    return;
  }
  const calldata = toUint256(needed);
  await account.execute([
    {
      contractAddress: tokenAddress,
      entrypoint: "approve",
      calldata: [MARKETPLACE_ADDRESS, ...calldata],
    },
  ]);
}

export async function getErc20Balance(
  provider: ProviderInterface,
  tokenAddress: string,
  owner: string,
): Promise<bigint> {
  const response = await provider.callContract({
    contractAddress: tokenAddress,
    entrypoint: "balanceOf",
    calldata: [owner],
  });
  const rawResult = Array.isArray(response) ? response : (response as any).result;
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
  requiredAmount: bigint,
): Promise<{ sufficient: boolean; balance: bigint }> {
  if (!tokenAddress || tokenAddress === "0x0") {
    // Native token - we can't easily check without additional setup
    return { sufficient: true, balance: 0n };
  }
  if (!account.address) {
    throw new Error("Wallet address not available");
  }
  const provider = getProvider(account);
  const balance = await getErc20Balance(provider, tokenAddress, account.address);
  return {
    sufficient: balance >= requiredAmount,
    balance,
  };
}
