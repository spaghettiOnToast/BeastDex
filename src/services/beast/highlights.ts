import { collectablesClient } from "./collectablesClient";
import { BEAST_STATS_CACHE_TTL_MS } from "./constants";
import { VISUAL_TO_EFFECTS } from "./helpers";
import { fetchBeastSpecies } from "./species";
import type { BeastHighlights } from "./types";

let highlightsCache: { data: BeastHighlights; expiresAt: number } | null = null;

const emptyLeader = { owner: null, username: null, value: 0 };

export async function fetchBeastHighlights(forceRefresh = false): Promise<BeastHighlights> {
  const now = Date.now();
  if (!forceRefresh && highlightsCache && highlightsCache.expiresAt > now) {
    return highlightsCache.data;
  }

  // v3 encodes shiny/animated in visualEffects (the SDK's `animated` flag is
  // always true on v3), so count by preset.
  const [animatedShiny, shinyOnly, animatedOnly, standard] = await Promise.all([
    collectablesClient.beasts.list({ visualEffects: VISUAL_TO_EFFECTS["Shiny MIDI"], limit: 1 }),
    collectablesClient.beasts.list({ visualEffects: VISUAL_TO_EFFECTS.Shiny, limit: 1 }),
    collectablesClient.beasts.list({ visualEffects: VISUAL_TO_EFFECTS.MIDI, limit: 1 }),
    collectablesClient.beasts.list({ visualEffects: VISUAL_TO_EFFECTS.Regular, limit: 1 }),
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

  // One grouped query (paged) instead of one request per species.
  const collected = new Map<string, number>();
  let cursor: string | undefined;
  do {
    const page = await collectablesClient.beasts.groups({
      groupBy: "beast_id",
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    for (const g of page.items) {
      collected.set(g.label, (collected.get(g.label) ?? 0) + g.count);
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  // Include registered species with nothing collected yet.
  const species = await fetchBeastSpecies();
  for (const s of species) {
    if (!collected.has(s.name)) collected.set(s.name, 0);
  }

  const sorted = Array.from(collected, ([name, count]) => ({ name, collected: count })).sort(
    (a, b) => b.collected - a.collected || a.name.localeCompare(b.name)
  );
  beastNameCountCache = { data: sorted, expiresAt: now + 30 * 60 * 1000 };
  return sorted;
}
