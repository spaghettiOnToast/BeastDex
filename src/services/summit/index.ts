import { RpcProvider } from "starknet";
import {
  fetchSummitBeastFromApi,
  mapApiToSummitBeastData,
  createDefaultSummitBeastData,
} from "../summitApi";
import type { SummitBeastData } from "./types";

export type { SummitBeastData, SummitLiveStats } from "./types";

const SKULL_CONTRACT_ADDRESS =
  "0x01c3c8284d7eed443b42f47e764032a56eaf50a9079d67993b633930e3689814";

/** Cached RPC provider singleton (stateless — safe to reuse across calls). */
let _rpcProvider: RpcProvider | null = null;
function getRpcProvider(): RpcProvider {
  if (!_rpcProvider) {
    const envUrl = (import.meta as any)?.env?.VITE_RPC_URL as string | undefined;
    _rpcProvider = new RpcProvider({
      nodeUrl: envUrl || "https://api.cartridge.gg/x/starknet/mainnet",
    });
  }
  return _rpcProvider;
}

/**
 * Fetch the number of skulls already claimed for a beast from the Skull contract on-chain.
 * Returns `null` on RPC error so callers can distinguish "0 claimed" from "call failed".
 */
export async function fetchSkullsClaimed(tokenId: number): Promise<number | null> {
  try {
    const provider = getRpcProvider();
    const result = await provider.callContract(
      {
        contractAddress: SKULL_CONTRACT_ADDRESS,
        entrypoint: "skulls_claimed",
        calldata: [`0x${tokenId.toString(16)}`],
      },
      "latest",
    );
    const raw = Array.isArray(result) ? result : (result as any).result;
    return Number(BigInt(raw[0] ?? "0"));
  } catch (err) {
    console.error(`[Summit] Failed to fetch skulls_claimed for token ${tokenId}:`, err);
    return null;
  }
}

/**
 * Batch-fetch unclaimed skull counts using only the on-chain Skull contract.
 * `kills` comes from NFT metadata ("Adventurers Killed" attribute).
 * If the RPC call fails for a token (null), it is omitted from the map so
 * the filter treats it as "no data" rather than falsely showing unclaimed skulls.
 */
const BATCH_CONCURRENCY = 5;

export async function fetchUnclaimedSkullsBatch(
  tokens: Array<{ id: number; kills: number }>,
  onProgress?: (batch: Map<number, number>) => void,
): Promise<Map<number, number>> {
  const map = new Map<number, number>();

  for (let i = 0; i < tokens.length; i += BATCH_CONCURRENCY) {
    const chunk = tokens.slice(i, i + BATCH_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async (token) => {
        const claimed = await fetchSkullsClaimed(token.id);
        if (claimed === null) return null; // RPC error — omit from results
        return { id: token.id, unclaimed: Math.max(0, token.kills - claimed) };
      }),
    );
    const batchMap = new Map<number, number>();
    for (const result of results) {
      if (result.status === "fulfilled" && result.value !== null) {
        map.set(result.value.id, result.value.unclaimed);
        batchMap.set(result.value.id, result.value.unclaimed);
      }
    }
    if (batchMap.size > 0 && onProgress) {
      onProgress(batchMap);
    }
  }

  return map;
}

export async function fetchSummitBeastData(
  tokenId: number
): Promise<SummitBeastData> {
  // Validate tokenId
  if (!tokenId || tokenId <= 0 || !Number.isFinite(tokenId)) {
    console.warn(`[Summit] Invalid tokenId: ${tokenId}`);
    return createDefaultSummitBeastData(tokenId || 0);
  }

  try {
    const apiBeast = await fetchSummitBeastFromApi(tokenId);

    if (!apiBeast) {
      return createDefaultSummitBeastData(tokenId);
    }

    return mapApiToSummitBeastData(apiBeast);
  } catch (error) {
    console.error(`[Summit] Failed to fetch beast data for ${tokenId}:`, error);
    return createDefaultSummitBeastData(tokenId);
  }
}
