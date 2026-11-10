/**
 * Beasts v3 music: a token's tracks and their sounds, from the collectables
 * API. Playback goes through the SDK's `mountBeastPlayer`; owner transactions
 * (default track, sound mode, buying tracks) live in `musicActions`.
 */
import { BeastSoundLoader, MAX_SOUND_BATCH, type BeastSoundData, type BeastTrackInfo } from "@provable-games/collectables";
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

/** `Sound Effects` presets 0-3: how a track is performed (the notes stay the same). */
export const EFFECT_NAMES = ["Written", "Mega", "Echo", "Mega + echo"] as const;

export const EFFECT_TITLES: readonly string[] = [
  "Plays as written",
  "Mega lead sound, doubled an octave up; faster, louder",
  "Lead repeated a dotted eighth later, half as loud; faster, louder",
  "Mega and echo together, at the fastest and loudest settings",
];

/** Shared tracks past the Sound Check (id 0) are Species Songs, whose effects the species' King sets. */
export function isKingSetTrack(ref: MusicTrackRef): boolean {
  return ref.kind === "shared" && (ref.id ?? 0) >= 1;
}

export const MUSIC_MODE_LABELS: Record<MusicMode["kind"], string> = {
  live: "Live",
  original: "Original",
  atBlock: "Replay",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry `fn` on server errors / network failures: the music API returns the
 * odd transient 500. Aborts and 4xx are not retried.
 */
export async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const clientError = status != null && status >= 400 && status < 500;
      if (signal?.aborted || clientError || i >= attempts - 1) throw err;
      await sleep(600 * 2 ** i);
    }
  }
}

class HttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Track list + saved default/modes. Not in the SDK client, so fetched directly. */
export async function fetchBeastMusic(tokenId: string, signal?: AbortSignal): Promise<BeastMusic | null> {
  const res = await withRetry(async () => {
    const r = await fetch(`${COLLECTABLES_API_URL}/collections/beasts/tokens/${encodeURIComponent(tokenId)}/music`, {
      headers: { accept: "application/json" },
      signal,
    });
    if (r.status >= 500) throw new HttpError(`music ${tokenId}: HTTP ${r.status}`, r.status);
    return r;
  }, signal);
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

/** What a token plays and its track list (from the batched /sounds endpoint). */
export type TrackList = { effective: string | null; tracks: BeastTrackInfo[] };

/**
 * Track lists for many tokens: batches of 40 through `beasts.sounds`, a few
 * at a time, retrying failures and re-asking tokens the API is still
 * computing. `onBatch` gets each batch as it lands (null = silent / unknown).
 */
export async function fetchTrackLists(
  tokenIds: string[],
  onBatch: (lists: Record<string, TrackList | null>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const batches: string[][] = [];
  for (let i = 0; i < tokenIds.length; i += MAX_SOUND_BATCH) batches.push(tokenIds.slice(i, i + MAX_SOUND_BATCH));
  const runBatch = async (ids: string[], round = 0): Promise<void> => {
    const res = await withRetry(() => collectablesClient.beasts.sounds(ids), signal);
    if (signal?.aborted) return;
    const byId = new Map(Object.entries(res.tokens).map(([k, v]) => [BigInt(k).toString(), v]));
    const out: Record<string, TrackList | null> = {};
    const pending: string[] = [];
    for (const id of ids) {
      const t = byId.get(BigInt(id).toString());
      if (t && "pending" in t) pending.push(id);
      else out[id] = t ? { effective: t.effective, tracks: t.tracks } : null;
    }
    onBatch(out);
    if (pending.length && round < 4) {
      await sleep(3000);
      if (!signal?.aborted) await runBatch(pending, round + 1);
    }
  };
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, batches.length) }, async () => {
      while (next < batches.length && !signal?.aborted) await runBatch(batches[next++]);
    }),
  );
}

/** Track ref string (`shared:1`, `named`, `individual:3`) -> `{kind, id}`. */
export function parseTrackRef(ref: string): MusicTrackRef | null {
  if (ref === "named") return { kind: "named" };
  const m = /^(shared|individual):(\d+)$/.exec(ref);
  return m ? { kind: m[1] as "shared" | "individual", id: Number(m[2]) } : null;
}

/**
 * A beast's music changed on-chain from somewhere in the app (its card's
 * Music tab): the token's new music, or a King's new Species Song effects.
 * Lists that show music (the My Music table) listen so they stay current.
 */
export type MusicChange =
  | { kind: "token"; tokenId: string; music: BeastMusic }
  | { kind: "speciesPreset"; speciesId: number; sharedId: number; preset: number };

const musicChanges = new EventTarget();

export function emitMusicChange(change: MusicChange): void {
  musicChanges.dispatchEvent(new CustomEvent<MusicChange>("change", { detail: change }));
}

/** Subscribe to music changes; returns the unsubscribe function. */
export function onMusicChange(fn: (change: MusicChange) => void): () => void {
  const listener = (e: Event) => fn((e as CustomEvent<MusicChange>).detail);
  musicChanges.addEventListener("change", listener);
  return () => musicChanges.removeEventListener("change", listener);
}
