import { BEAST_NAMES } from "@provable-games/collectables";
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

export type BeastNameCount = { name: string; collected: number };

let beastNameCountCache: { data: BeastNameCount[]; expiresAt: number } | null = null;

export async function fetchBeastCollectedByName(): Promise<BeastNameCount[]> {
  const now = Date.now();
  if (beastNameCountCache && beastNameCountCache.expiresAt > now) {
    return beastNameCountCache.data;
  }

  const allNames = Array.from(new Set(Object.values(BEAST_NAMES))).sort();
  const counts: BeastNameCount[] = [];
  const BATCH = 5;

  for (let i = 0; i < allNames.length; i += BATCH) {
    const batch = allNames.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((name) => collectablesClient.beasts.list({ nameIn: [name], limit: 1 }))
    );
    results.forEach((result, idx) => {
      counts.push({ name: batch[idx], collected: result.total });
    });
    if (i + BATCH < allNames.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
    }
  }

  const sorted = counts.sort((a, b) => b.collected - a.collected || a.name.localeCompare(b.name));
  beastNameCountCache = { data: sorted, expiresAt: now + 30 * 60 * 1000 };
  return sorted;
}
