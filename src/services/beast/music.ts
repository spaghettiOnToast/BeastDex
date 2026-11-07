/**
 * Beasts v3 music (read-only): a token's tracks and their sounds, from the
 * collectables API. Playback goes through the SDK's `mountBeastPlayer`.
 *
 * Not covered here (wallet transactions to the Sound Manager, and Live-mode
 * auditioning, which composes the drifted song client-side): setting the
 * default track, saving a sound mode, buying tracks.
 */
import { BeastSoundLoader, type BeastSoundData } from "@provable-games/collectables";
import { collectablesClient, COLLECTABLES_API_URL } from "./collectablesClient";

export type MusicMode = { kind: "live" | "original" | "atBlock"; block?: number };

export type MusicTrackRef = { kind: "shared" | "named" | "individual"; id?: number };

export type MusicTrack = MusicTrackRef & {
  /** `shared:0`, `shared:1`, `named`, `individual:<id>` */
  ref: string;
  label: string;
  number: number;
  mode: MusicMode;
  modeLocked: boolean;
  /** the song changes with the chain (Live mode is meaningful) */
  drifts: boolean;
  status: "ready" | "pending";
  purchaseBlock?: number;
  readyAt?: number;
};

export type BeastMusic = {
  soundManager: string;
  skull: string;
  /** track price in SKULL wei (decimal string) */
  price: string;
  head: number;
  driftDay: number;
  state: {
    speciesDefault: MusicTrackRef | null;
    override: MusicTrackRef | null;
    /** the track `token_uri` plays (the "default" star) */
    effective: MusicTrackRef | null;
    mode: MusicMode;
  };
  tracks: MusicTrack[];
};

/** `{kind, id}` -> track ref string, as `MusicTrack.ref`. */
export function trackRefOf(ref: MusicTrackRef | null | undefined): string | null {
  if (!ref) return null;
  return ref.kind === "named" ? "named" : `${ref.kind}:${ref.id ?? 0}`;
}

export const MUSIC_MODE_LABELS: Record<MusicMode["kind"], string> = {
  live: "Live",
  original: "Original",
  atBlock: "Replay",
};

/** Track list + saved default/modes. Not in the SDK client, so fetched directly. */
export async function fetchBeastMusic(tokenId: string, signal?: AbortSignal): Promise<BeastMusic | null> {
  const res = await fetch(
    `${COLLECTABLES_API_URL}/collections/beasts/tokens/${encodeURIComponent(tokenId)}/music`,
    { headers: { accept: "application/json" }, signal },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`music ${tokenId}: HTTP ${res.status}`);
  return (await res.json()) as BeastMusic;
}

/** Batches every card's "what does this token play" ask into /sounds requests. */
export const beastSoundLoader = new BeastSoundLoader(collectablesClient);

const trackSoundCache = new Map<string, Promise<BeastSoundData>>();

/** One track's sound (its saved mode), cached per token+track. */
export function fetchTrackSound(tokenId: string, track: string): Promise<BeastSoundData> {
  const key = `${tokenId}:${track}`;
  let pending = trackSoundCache.get(key);
  if (!pending) {
    pending = collectablesClient.beasts
      .sound(tokenId, { track })
      .then(({ midi, settings }) => ({ midi, settings }));
    pending.catch(() => trackSoundCache.delete(key));
    trackSoundCache.set(key, pending);
  }
  return pending;
}

/** Forget a token's cached track sounds (after its default or a mode changed). */
export function clearTrackSounds(tokenId: string): void {
  for (const key of trackSoundCache.keys()) {
    if (key.startsWith(`${tokenId}:`)) trackSoundCache.delete(key);
  }
  beastSoundLoader.invalidate(tokenId);
}
