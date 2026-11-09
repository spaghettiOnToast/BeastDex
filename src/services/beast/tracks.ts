/**
 * Tracks page data: each species' King (who also carries the Species Song and
 * Sound Check we play for it), the King-set Species Song settings, and the
 * Named Song search. Sounds themselves come from `fetchTrackSound`.
 */
import type { Beast } from "./types";
import { collectablesClient } from "./collectablesClient";
import { mapSdkBeast } from "./helpers";
import { fetchBeastMusic, type MusicMode } from "./music";
import { hash } from "starknet";
import { fetchSharedSongPreset, SOUND_MANAGER_ADDRESS } from "./musicActions";
import { apiCache } from "../apiCache";
import { withReadProvider } from "../tx";

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

/** Block the Sound Manager was deployed at: purchases can't be older. */
const SOUND_MANAGER_DEPLOY_BLOCK = 17372842;

export type TrackPurchase = {
  /** decimal token id of the beast the song was bought for */
  tokenId: string;
  purchaser: string;
  /** the beast's individual track id: plays as `individual:<id>` */
  trackId: number;
  /** 0 = the first edition (a Song); later editions sell that edition's style */
  editionId: number;
  purchaseBlock: number;
  /** the song can play from this block (purchase + 10) */
  readyAt: number;
  txHash: string;
};

export function purchaseTrackRef(p: TrackPurchase): string {
  return `individual:${p.trackId}`;
}

export function editionLabel(editionId: number): string {
  return editionId === 0 ? "Song" : `Edition ${editionId + 1}`;
}

/**
 * Every `TrackPurchased` event from the Sound Manager, newest first, plus the
 * current head block (to tell which songs are still composing).
 * Event layout: keys [selector, token_id]; data [purchaser, id, edition_id,
 * purchase_block, ready_at, ...binding].
 */
export async function fetchTrackPurchases(): Promise<{ purchases: TrackPurchase[]; head: number }> {
  return apiCache.get("track-purchases", {}, async () => {
    const selector = hash.getSelectorFromName("TrackPurchased");
    return withReadProvider(async (p) => {
      const purchases: TrackPurchase[] = [];
      let token: string | undefined;
      for (let page = 0; page < 200; page++) {
        const res = await p.getEvents({
          address: SOUND_MANAGER_ADDRESS,
          keys: [[selector]],
          from_block: { block_number: SOUND_MANAGER_DEPLOY_BLOCK },
          to_block: "latest",
          chunk_size: 1000,
          continuation_token: token,
        });
        for (const e of res.events) {
          const [purchaser = "0x0", id = "0x0", edition = "0x0", purchaseBlock = "0x0", readyAt = "0x0"] = e.data;
          purchases.push({
            tokenId: BigInt(e.keys[1] ?? "0x0").toString(),
            purchaser,
            trackId: Number(BigInt(id)),
            editionId: Number(BigInt(edition)),
            purchaseBlock: Number(BigInt(purchaseBlock)),
            readyAt: Number(BigInt(readyAt)),
            txHash: e.transaction_hash,
          });
        }
        token = res.continuation_token;
        if (!token) break;
      }
      const head = await p.getBlockNumber();
      purchases.sort((a, b) => b.purchaseBlock - a.purchaseBlock || b.trackId - a.trackId);
      return { purchases, head };
    });
  });
}

const blockTimeCache = new Map<number, Promise<number | null>>();

/** A block's unix timestamp (seconds), cached. */
export function fetchBlockTime(block: number): Promise<number | null> {
  let pending = blockTimeCache.get(block);
  if (!pending) {
    pending = withReadProvider((p) => p.getBlockWithTxHashes(block))
      .then((b) => ("timestamp" in b ? Number(b.timestamp) : null))
      .catch(() => {
        blockTimeCache.delete(block);
        return null;
      });
    blockTimeCache.set(block, pending);
  }
  return pending;
}
