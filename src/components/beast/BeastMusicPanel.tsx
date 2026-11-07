import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@starknet-react/core";
import type { Call } from "starknet";
import { ExternalLink, Music, Pause, Play, Plus, Star } from "lucide-react";
import { cn } from "../../lib/utils";
import { lootSurvivorBeastUrl } from "../../services/beast/constants";
import {
  fetchBeastMusic,
  trackRefOf,
  MUSIC_MODE_LABELS,
  type BeastMusic,
  type MusicTrack,
} from "../../services/beast/music";
import {
  buyTrackCalls,
  fetchSkullBalance,
  formatSkull,
  musicContractsProblem,
  setDefaultTrackCall,
  setTrackModeCall,
  waitForMusic,
  TRACK_PRICE_WEI,
} from "../../services/beast/musicActions";
import { waitForTx } from "../../services/tx";
import { normaliseStarknetAddress } from "../../utils/address";

type Props = {
  tokenId: string;
  /** current owner of the beast (only they can change its music) */
  owner: string | null;
  /** track currently loaded in the player (null = the token's default) */
  selectedRef: string | null;
  playing: boolean;
  /** a track is being fetched / started */
  loadingRef: string | null;
  /** `isActive`: the track is already loaded in the player (so toggle it). */
  onPlayTrack: (track: MusicTrack, isActive: boolean) => void;
  /** The default track or a mode changed on-chain: the player should reload. */
  onMusicChanged?: () => void;
};

type Busy = { kind: "default" | "mode" | "buy"; ref?: string; phase: "wallet" | "confirming" };

const TRACK_BLURBS: Record<string, string> = {
  "shared:0": "Warming up",
  "shared:1": "Shared by every beast of its species",
  named: "Unique to this beast",
};

function blurb(track: MusicTrack): string {
  if (track.status === "pending") return "Composing…";
  return TRACK_BLURBS[track.ref] ?? (track.kind === "individual" ? "Purchased song" : "");
}

function txErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/reject|denied|cancel|abort/i.test(msg)) return "Cancelled in wallet. Nothing was sent.";
  if (/insufficient|balance/i.test(msg)) return "Not enough funds for this transaction.";
  return msg.length > 140 ? `${msg.slice(0, 140)}…` : msg || "Transaction failed.";
}

const MODE_TITLES: Record<string, string> = {
  live: "Drifts with the chain, changing once a day",
  original: "Always sounds as it was first composed",
  atBlock: "Replays a specific day",
};

/**
 * Music tab: the token's tracks; play any of them. The beast's owner can also
 * set the default track (star), switch a drifting track between Live and
 * Original, and buy new songs for 1 SKULL.
 */
export default function BeastMusicPanel({
  tokenId,
  owner,
  selectedRef,
  playing,
  loadingRef,
  onPlayTrack,
  onMusicChanged,
}: Props) {
  const { account, address } = useAccount();
  const [music, setMusic] = useState<BeastMusic | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "none">("loading");
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<{ at: string; message: string } | null>(null);
  const [skull, setSkull] = useState<bigint | null>(null);
  const [skullState, setSkullState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [skullReload, setSkullReload] = useState(0);

  const canManage =
    Boolean(account && address && owner) &&
    normaliseStarknetAddress(address) === normaliseStarknetAddress(owner);

  useEffect(() => {
    const ctrl = new AbortController();
    setState("loading");
    setMusic(null);
    setError(null);
    fetchBeastMusic(tokenId, ctrl.signal)
      .then((m) => {
        setMusic(m);
        setState(m && m.tracks.length > 0 ? "ready" : "none");
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) {
          console.warn("[music] failed to load tracks:", err);
          setState("error");
        }
      });
    return () => ctrl.abort();
  }, [tokenId]);

  // SKULL balance, for the owner's buy button.
  useEffect(() => {
    if (!canManage || !address) {
      setSkull(null);
      setSkullState("idle");
      return;
    }
    let alive = true;
    setSkullState("loading");
    fetchSkullBalance(address)
      .then((b) => {
        if (!alive) return;
        setSkull(b);
        setSkullState("ready");
      })
      .catch((err) => {
        if (!alive) return;
        console.warn("[music] couldn't read SKULL balance:", err);
        setSkull(null);
        setSkullState("error");
      });
    return () => {
      alive = false;
    };
  }, [canManage, address, music?.tracks.length, skullReload]);

  /** Send calls, wait for the tx, then for the API to show the change. */
  const run = useCallback(
    async (
      next: Omit<Busy, "phase">,
      errorKey: string,
      calls: Call[],
      reflected: (m: BeastMusic) => boolean,
    ) => {
      if (!account || !music) return;
      const problem = musicContractsProblem(music);
      if (problem) {
        setError({ at: errorKey, message: problem });
        return;
      }
      setError(null);
      setBusy({ ...next, phase: "wallet" });
      try {
        const res = await account.execute(calls);
        setBusy({ ...next, phase: "confirming" });
        const outcome = await waitForTx(res.transaction_hash);
        if (outcome === "reverted" || outcome === "rejected") throw new Error(`Transaction ${outcome}.`);
        const latest = await waitForMusic(tokenId, reflected);
        if (latest) setMusic(latest);
        if (latest && !reflected(latest)) {
          setError({ at: errorKey, message: "Your change was sent but isn't showing yet. Check back in a moment." });
        }
        onMusicChanged?.();
      } catch (err) {
        console.error("[music] transaction failed:", err);
        setError({ at: errorKey, message: txErrorMessage(err) });
      } finally {
        setBusy(null);
      }
    },
    [account, music, tokenId, onMusicChanged],
  );

  if (state === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }
  if (state === "error" || state === "none" || !music) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <p className="text-[10px] text-zinc-500">
          {state === "error" ? "Couldn't load this beast's music." : "This beast has no music."}
        </p>
      </div>
    );
  }

  const defaultRef = trackRefOf(music.state.effective);
  const activeRef = selectedRef ?? defaultRef;
  const trackCount = music.tracks.length;
  const shortfall = skull !== null && skull < TRACK_PRICE_WEI ? TRACK_PRICE_WEI - skull : 0n;

  const setDefault = (track: MusicTrack) =>
    run({ kind: "default", ref: track.ref }, track.ref, [setDefaultTrackCall(tokenId, track)], (m) =>
      trackRefOf(m.state.effective) === track.ref,
    );

  const setMode = (track: MusicTrack, mode: "live" | "original") =>
    run({ kind: "mode", ref: track.ref }, track.ref, [setTrackModeCall(tokenId, track, mode)], (m) =>
      m.tracks.find((t) => t.ref === track.ref)?.mode.kind === mode,
    );

  const buy = () =>
    run({ kind: "buy" }, "buy", buyTrackCalls(tokenId), (m) => m.tracks.length > trackCount);

  const busyLabel = busy?.phase === "wallet" ? "Confirm in wallet…" : "Confirming…";

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-3 py-2 border-b border-white/[0.06] bg-surface/30">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gold uppercase tracking-wider flex items-center gap-1.5">
            <Music className="h-3 w-3" /> Tracks
            <span className="rounded bg-white/[0.06] px-1.5 text-[9px] text-zinc-300">{trackCount}</span>
          </span>
          <span className="text-[9px] text-zinc-500" title="Day the drifting songs are currently composed from">
            Drift day {music.driftDay}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {music.tracks.map((track) => {
          const isActive = track.ref === activeRef;
          const isPlaying = isActive && playing;
          const isLoading = loadingRef === track.ref;
          const isDefault = track.ref === defaultRef;
          const ready = track.status === "ready";
          const rowBusy = busy?.ref === track.ref;
          const canSetMode = canManage && track.drifts && !track.modeLocked && ready;
          return (
            <div
              key={track.ref}
              className={cn(
                "rounded-lg border px-2.5 py-2 transition-colors",
                isPlaying ? "border-gold/40 bg-gold/[0.08]" : "border-white/[0.06] bg-white/[0.03]",
              )}
            >
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={!ready || isLoading}
                  onClick={() => onPlayTrack(track, isActive)}
                  aria-label={`${isPlaying ? "Pause" : "Play"} ${track.label}`}
                  className={cn(
                    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40",
                    isPlaying ? "border-gold bg-gold text-black" : "border-white/20 text-zinc-200 hover:border-gold hover:text-gold",
                  )}
                >
                  {isLoading ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : isPlaying ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5 translate-x-[1px]" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-bold text-zinc-100">
                    #{track.number} {track.label}
                  </p>
                  <p className="truncate text-[9px] text-zinc-500">
                    {rowBusy ? busyLabel : blurb(track)}
                  </p>
                </div>

                {track.drifts &&
                  (canSetMode ? (
                    <div className="flex flex-shrink-0 rounded-full border border-white/10 bg-black/30 p-0.5" role="group" aria-label={`Sound mode of ${track.label}`}>
                      {(["live", "original"] as const).map((mode) => {
                        const saved = track.mode.kind === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            disabled={busy !== null || saved}
                            onClick={() => setMode(track, mode)}
                            title={saved ? `Saved: ${MODE_TITLES[mode]}` : `Save ${MUSIC_MODE_LABELS[mode]}: ${MODE_TITLES[mode]}`}
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[9px] font-semibold transition-colors",
                              saved ? "bg-gold text-black" : "text-zinc-400 hover:text-gold disabled:hover:text-zinc-400",
                            )}
                          >
                            {MUSIC_MODE_LABELS[mode]}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <span
                      className="flex-shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold text-zinc-300"
                      title={`Saved mode: ${MODE_TITLES[track.mode.kind] ?? track.mode.kind}${track.modeLocked ? " (set by the species' King)" : ""}`}
                    >
                      {MUSIC_MODE_LABELS[track.mode.kind] ?? track.mode.kind}
                    </span>
                  ))}

                {canManage && !isDefault && ready ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setDefault(track)}
                    title="Set as default: saves this sound on-chain so it plays wherever the beast is shown"
                    aria-label={`Set ${track.label} as default track`}
                    className="flex-shrink-0 text-zinc-600 transition-colors hover:text-gold disabled:opacity-40"
                  >
                    {rowBusy && busy?.kind === "default" ? (
                      <span className="block h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                    ) : (
                      <Star className="h-4 w-4" />
                    )}
                  </button>
                ) : (
                  <span
                    className="flex-shrink-0"
                    title={isDefault ? "Default track: saved on-chain, plays wherever the beast is shown" : undefined}
                  >
                    <Star
                      className={cn("h-4 w-4", isDefault ? "fill-gold text-gold" : "text-zinc-700")}
                      aria-label={isDefault ? "Default track" : undefined}
                    />
                  </span>
                )}
              </div>
              {error?.at === track.ref && <p className="mt-1.5 text-[10px] text-red-400">{error.message}</p>}
            </div>
          );
        })}
      </div>

      <div className="flex-shrink-0 border-t border-white/[0.06] px-3 py-2 space-y-2">
        {canManage && (
          <div>
            <button
              type="button"
              disabled={busy !== null || shortfall > 0n || skullState === "loading"}
              onClick={buy}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-[11px] font-semibold text-gold transition-colors hover:bg-gold/20 disabled:opacity-50"
            >
              {busy?.kind === "buy" ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-gold border-t-transparent" /> {busyLabel}
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" /> Buy a new song · {formatSkull(TRACK_PRICE_WEI)} SKULL
                </>
              )}
            </button>
            <p className="mt-1 text-center text-[9px] text-zinc-500">
              {skullState === "error" ? (
                <>
                  Couldn&apos;t read your SKULL balance.{" "}
                  <button type="button" onClick={() => setSkullReload((n) => n + 1)} className="text-gold hover:underline">
                    Retry
                  </button>
                </>
              ) : skull === null ? (
                "Checking SKULL balance…"
              ) : shortfall > 0n ? (
                `You have ${formatSkull(skull)} SKULL. Need ${formatSkull(shortfall)} more.`
              ) : (
                `You have ${formatSkull(skull)} SKULL. Composed from the block your purchase lands in.`
              )}
            </p>
            {error?.at === "buy" && <p className="mt-1 text-center text-[10px] text-red-400">{error.message}</p>}
          </div>
        )}

        {!canManage && (
          <p className="text-[10px] text-zinc-500">
            {address
              ? "Only this beast's owner can change its music."
              : "Connect the wallet that owns this beast to change its default track, sound modes or buy songs."}
          </p>
        )}
        <a
          href={lootSurvivorBeastUrl(tokenId)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-2 text-[10px] text-zinc-400 hover:text-gold transition-colors"
        >
          <span>Open on Loot Survivor (Live previews, Replay, King settings)</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
      </div>
    </div>
  );
}
