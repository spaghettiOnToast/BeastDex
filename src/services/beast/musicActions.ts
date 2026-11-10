/**
 * Beasts v3 music: owner transactions on the Sound Manager. Calldata matches
 * the contract ABI (`TrackRef` = Shared(u64) | Individual(u64) | Named,
 * `SoundMode` = Live | Original | AtBlock(u64)) and lootsurvivor.io's calls.
 */
import type { Call } from "starknet";
import { toUint256Hex } from "../../utils/uint256";
import { withReadProvider } from "../tx";
import { clearTrackSounds, fetchBeastMusic, type BeastMusic, type MusicTrackRef } from "./music";

export const SOUND_MANAGER_ADDRESS = "0x01bbece5870dabbbec40efb73457848fd5425320600a42684aa23271c43abe8b";
export const SKULL_ADDRESS = "0x02798a8dc91bf1ef502cf8710751d26128fdf8e9d0823522fc08632ecc9172e8";
/** Expected price of a track: 1 SKULL (18 decimals). */
export const TRACK_PRICE_WEI = 10n ** 18n;

const sameFelt = (a: string, b: string) => {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
};

/**
 * Refuse to transact when the API points at contracts or a price we don't
 * expect (same guard lootsurvivor.io applies). Returns an error message or null.
 */
export function musicContractsProblem(music: Pick<BeastMusic, "skull" | "soundManager" | "price">): string | null {
  if (!sameFelt(music.skull, SKULL_ADDRESS)) return "This beast's music is sold for a token this app doesn't recognise.";
  if (!sameFelt(music.soundManager, SOUND_MANAGER_ADDRESS))
    return "This beast's music is managed by a contract this app doesn't recognise.";
  if (music.price !== TRACK_PRICE_WEI.toString()) return "This beast's track price isn't the expected 1 SKULL.";
  return null;
}

/** `TrackRef` enum calldata: variant index, then the id for Shared / Individual. */
function trackRefCalldata(ref: MusicTrackRef): string[] {
  if (ref.kind === "named") return ["2"];
  return [ref.kind === "shared" ? "0" : "1", String(ref.id ?? 0)];
}

/** Approve exactly 1 SKULL to the Sound Manager, then buy a new track. */
export function buyTrackCalls(tokenId: string): Call[] {
  return [
    { contractAddress: SKULL_ADDRESS, entrypoint: "approve", calldata: [SOUND_MANAGER_ADDRESS, ...toUint256Hex(TRACK_PRICE_WEI)] },
    { contractAddress: SOUND_MANAGER_ADDRESS, entrypoint: "purchase_track", calldata: [tokenId] },
  ];
}

/** Most beasts one bulk music transaction touches (keeps the multicall well inside step limits). */
export const MAX_BULK_MUSIC_BEASTS = 50;

/**
 * Buy one new track for each token: a single approve for the total, then a
 * `purchase_track` per token (the Sound Manager has no batch entrypoint).
 */
export function bulkBuyTrackCalls(tokenIds: string[]): Call[] {
  if (tokenIds.length === 0) return [];
  return [
    {
      contractAddress: SKULL_ADDRESS,
      entrypoint: "approve",
      calldata: [SOUND_MANAGER_ADDRESS, ...toUint256Hex(TRACK_PRICE_WEI * BigInt(tokenIds.length))],
    },
    ...tokenIds.map((id) => ({ contractAddress: SOUND_MANAGER_ADDRESS, entrypoint: "purchase_track", calldata: [id] })),
  ];
}

/** A wallet / transaction error as a short message for the music UI. */
export function txErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  // Wallets wrap their own failures (e.g. Ready's WalletRPCError) with the real reason in `cause`.
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
  if (/timeout|timed out/i.test(`${msg} ${cause}`))
    return "Your wallet didn't respond in time. Check its popup isn't hidden or the wallet locked, then try again.";
  if (/reject|denied|cancel|abort/i.test(msg)) return "Cancelled in wallet. Nothing was sent.";
  if (/stale rankings/i.test(`${msg} ${cause}`))
    return "This species' rankings are out of date, so King changes can't go through yet. Reopen the effects to include a ranking refresh.";
  if (/insufficient|balance/i.test(msg)) return "Not enough funds for this transaction.";
  return msg.length > 140 ? `${msg.slice(0, 140)}…` : msg || "Transaction failed.";
}

export function setDefaultTrackCall(tokenId: string, ref: MusicTrackRef): Call {
  return { contractAddress: SOUND_MANAGER_ADDRESS, entrypoint: "set_default_track", calldata: [tokenId, ...trackRefCalldata(ref)] };
}

export function setTrackModeCall(tokenId: string, ref: MusicTrackRef, mode: "live" | "original"): Call {
  return {
    contractAddress: SOUND_MANAGER_ADDRESS,
    entrypoint: "set_track_sound_mode",
    calldata: [tokenId, ...trackRefCalldata(ref), mode === "live" ? "0" : "1"],
  };
}

/**
 * The effects preset (0-3) the species' King set for a Species Song
 * (`get_shared_song_preset`; reverts for the Sound Check, shared id 0).
 */
export async function fetchSharedSongPreset(speciesId: number, sharedId: number): Promise<number> {
  const [preset = "0"] = await withReadProvider((p) =>
    p.callContract(
      { contractAddress: SOUND_MANAGER_ADDRESS, entrypoint: "get_shared_song_preset", calldata: [String(speciesId), String(sharedId)] },
      "latest",
    ),
  );
  return Number(BigInt(preset));
}

/**
 * King only: set a Species Song's effects preset (0-3) for the whole species.
 * `leaderTokenId` is the species' Rank 1 beast, which the caller must own.
 */
export function setSharedSongPresetCall(leaderTokenId: string, sharedId: number, preset: number): Call {
  return {
    contractAddress: SOUND_MANAGER_ADDRESS,
    entrypoint: "set_shared_song_preset",
    calldata: [leaderTokenId, String(sharedId), String(preset)],
  };
}

/** SKULL balance (wei) of an address. */
export async function fetchSkullBalance(address: string): Promise<bigint> {
  // Explicit "latest": starknet.js v7 defaults to "pending", which RPC 0.8+
  // nodes reject ("Invalid block id").
  const res = await withReadProvider((p) =>
    p.callContract({ contractAddress: SKULL_ADDRESS, entrypoint: "balance_of", calldata: [address] }, "latest"),
  );
  const [low = "0", high = "0"] = res;
  return BigInt(low) + (BigInt(high) << 128n);
}

/**
 * After a transaction, poll the music API until it reflects the change (the
 * indexer lags the chain). Returns the latest music either way.
 */
export async function waitForMusic(
  tokenId: string,
  done: (music: BeastMusic) => boolean,
  { attempts = 12, intervalMs = 5000 }: { attempts?: number; intervalMs?: number } = {},
): Promise<BeastMusic | null> {
  let latest: BeastMusic | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      latest = (await fetchBeastMusic(tokenId)) ?? latest;
    } catch {
      // keep polling
    }
    if (latest && done(latest)) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  clearTrackSounds(tokenId);
  return latest;
}

/** SKULL wei -> "1.5" style string. */
export function formatSkull(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 2).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
