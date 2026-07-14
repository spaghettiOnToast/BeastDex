import { collectablesClient } from "./collectablesClient";
import { BEAST_STATS_CACHE_TTL_MS } from "./constants";
import type { BeastHighlights } from "./types";

let highlightsCache: { data: BeastHighlights; expiresAt: number } | null = null;

const emptyLeader = { owner: null, username: null, value: 0 };

export async function fetchBeastHighlights(forceRefresh = false): Promise<BeastHighlights> {
  const now = Date.now();
  if (!forceRefresh && highlightsCache && highlightsCache.expiresAt > now) {
    return highlightsCache.data;
  }

  const [animatedShiny, shinyOnly, animatedOnly, standard] = await Promise.all([
    collectablesClient.beasts.list({ shiny: true, animated: true, limit: 1 }),
    collectablesClient.beasts.list({ shiny: true, animated: false, limit: 1 }),
    collectablesClient.beasts.list({ shiny: false, animated: true, limit: 1 }),
    collectablesClient.beasts.list({ shiny: false, animated: false, limit: 1 }),
  ]);

  const data: BeastHighlights = {
    animatedShinyCount: animatedShiny.total,
    shinyCount: shinyOnly.total,
    animatedCount: animatedOnly.total,
    standardCount: standard.total,
    leaders: {
      overall: emptyLeader,
      animatedShiny: emptyLeader,
      shiny: emptyLeader,
      animated: emptyLeader,
    },
  };

  highlightsCache = { data, expiresAt: now + BEAST_STATS_CACHE_TTL_MS };

  return data;
}
