import {
  fetchSummitBeastFromApi,
  mapApiToSummitBeastData,
  createDefaultSummitBeastData,
} from "../summitApi";
import type { SummitBeastData } from "./types";

export type { SummitBeastData, SummitLiveStats } from "./types";

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
