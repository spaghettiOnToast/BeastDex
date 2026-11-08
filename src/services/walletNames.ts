/**
 * Display names for wallet addresses, for every wallet type (Controller,
 * Ready/Argent, Braavos, …):
 *   1. Cartridge Controller username (best-effort API)
 *   2. Brother ID primary name (`name.brother`, on-chain — what Ready shows)
 * Names containing profanity are never shown (the caller falls back to the
 * shortened address).
 */
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { starknetId } from "starknet";
import { lookupControllerUsernames } from "./controller";
import { withReadProvider } from "./tx";
import { normaliseStarknetAddresses } from "../utils/address";

/** Brother ID registry (mainnet). `getPrimary(user)` -> encoded primary domain. */
export const BROTHER_ID_ADDRESS = "0x0212f1c57700f5a3913dd11efba540196aad4cf67772f7090c62709dd804fa74";
/** Where users claim / set their `.brother` name. */
export const BROTHER_ID_URL = "https://brother-id.vercel.app/";

const profanity = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

/** False for names containing profanity (also catches leetspeak, e.g. "sh1t"). */
export function isCleanName(name: string): boolean {
  return !profanity.hasMatch(name);
}

/** Brother ID stores domains in Starknet ID's base-37 encoding. */
export function decodeBrotherDomain(encoded: string | bigint): string | null {
  const value = BigInt(encoded);
  if (value === 0n) return null;
  const decoded = starknetId.useDecoded([value]).replace(/\.stark$/, "");
  return decoded ? `${decoded}.brother` : null;
}

// address -> name (null = looked up, none)
const brotherCache = new Map<string, string | null>();
const BROTHER_CONCURRENCY = 8;

async function lookupBrotherName(address: string): Promise<string | null> {
  if (brotherCache.has(address)) return brotherCache.get(address) ?? null;
  try {
    const res = await withReadProvider((p) =>
      p.callContract({ contractAddress: BROTHER_ID_ADDRESS, entrypoint: "getPrimary", calldata: [address] }, "latest")
    );
    const name = decodeBrotherDomain(res[0] ?? "0x0");
    brotherCache.set(address, name);
    return name;
  } catch {
    return null; // not cached: retry next time
  }
}

/** Primary `.brother` names for addresses (normalised address -> name). */
export async function lookupBrotherNames(addresses: Array<string | null | undefined>): Promise<Record<string, string>> {
  const unique = normaliseStarknetAddresses(addresses);
  const out: Record<string, string> = {};
  for (let i = 0; i < unique.length; i += BROTHER_CONCURRENCY) {
    const batch = unique.slice(i, i + BROTHER_CONCURRENCY);
    const names = await Promise.all(batch.map(lookupBrotherName));
    batch.forEach((address, j) => {
      const name = names[j];
      if (name) out[address] = name;
    });
  }
  return out;
}

/**
 * Display names for addresses (normalised address -> name): Controller
 * username, else `.brother` name. Profane names are dropped.
 */
export async function lookupWalletNames(addresses: Array<string | null | undefined>): Promise<Record<string, string>> {
  const unique = normaliseStarknetAddresses(addresses);
  if (unique.length === 0) return {};

  const controller = await lookupControllerUsernames(unique).catch(() => ({}) as Record<string, string>);
  const out: Record<string, string> = {};
  for (const [address, name] of Object.entries(controller)) {
    if (name && isCleanName(name)) out[address] = name;
  }

  const remaining = unique.filter((a) => !out[a]);
  const brother = await lookupBrotherNames(remaining);
  for (const [address, name] of Object.entries(brother)) {
    if (isCleanName(name)) out[address] = name;
  }
  return out;
}
