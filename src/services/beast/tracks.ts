/**
 * Tracks page data: each species' King (who also carries the Species Song and
 * Sound Check we play for it), the King-set Species Song settings, and the
 * Named Song search. Sounds themselves come from `fetchTrackSound`.
 */
import type { Beast } from "./types";
import { collectablesClient } from "./collectablesClient";
import { mapSdkBeast } from "./helpers";
import { fetchBeastMusic, type MusicMode } from "./music";
import { fetchSharedSongPreset } from "./musicActions";
import { apiCache } from "../apiCache";

/** The Species Song is the first King-controlled shared track. */
export const SPECIES_SONG_ID = 1;
export const SPECIES_SONG_REF = `shared:${SPECIES_SONG_ID}`;
export const SOUND_CHECK_REF = "shared:0";
export const NAMED_SONG_REF = "named";

/** Every species' King (Rank 1 beast), keyed by species id. */
export async function fetchSpeciesKings(): Promise<Map<number, Beast>> {
  return apiCache.get("species-kings", {}, async () => {
    const kings = new Map<number, Beast>();
    let cursor: string | undefined;
    // 100 per page (the API max); one page covers the original 75 species.
    for (let page = 0; page < 10; page++) {
      const res = await collectablesClient.beasts.list({ rank: 1, limit: 100, cursor });
      for (const item of res.items) {
        if (!kings.has(item.beastId)) kings.set(item.beastId, mapSdkBeast(item));
      }
      cursor = res.nextCursor ?? undefined;
      if (!cursor) break;
    }
    return kings;
  });
}

/**
 * Any beast of a species, to play its Species Song / Sound Check when it has no
 * King yet (nothing ranked). Species Songs sound the same on every beast.
 */
export async function fetchSpeciesStandIn(speciesId: number): Promise<Beast | null> {
  return apiCache.get("species-stand-in", { speciesId }, async () => {
    const res = await collectablesClient.beasts.list({ beastId: speciesId, limit: 1 });
    return res.items[0] ? mapSdkBeast(res.items[0]) : null;
  });
}

export type SpeciesSongSettings = {
  /** King-set effects preset 0-3, null if unreadable */
  preset: number | null;
  /** King-set sound mode, null if unknown */
  mode: MusicMode["kind"] | null;
};

/** The Species Song's King-set effects (on-chain) and sound mode (music API). */
export async function fetchSpeciesSongSettings(speciesId: number, tokenId: string): Promise<SpeciesSongSettings> {
  return apiCache.get("species-song-settings", { speciesId, tokenId }, async () => {
    const [preset, music] = await Promise.all([
      fetchSharedSongPreset(speciesId, SPECIES_SONG_ID).catch(() => null),
      fetchBeastMusic(tokenId).catch(() => null),
    ]);
    const track = music?.tracks.find((t) => t.ref === SPECIES_SONG_REF);
    return { preset, mode: track?.mode.kind ?? null };
  });
}

/**
 * Named Song search: beasts whose name matches (e.g. "Agony Bane"),
 * optionally within one species. Genesis beasts have no Named Song.
 */
export async function searchNamedSongs(query: string, speciesId?: number): Promise<Beast[]> {
  const search = query.trim();
  const res = await collectablesClient.beasts.list({
    search,
    ...(speciesId ? { beastId: speciesId } : {}),
    limit: 48,
  });
  return res.items.filter((b) => b.prefixName && b.suffixName && !b.genesis).map(mapSdkBeast);
}
