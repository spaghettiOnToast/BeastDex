import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@starknet-react/core";
import type { Call } from "starknet";
import { ExternalLink, Music, Pause, Play, Plus, Star } from "lucide-react";
import { cn } from "../../lib/utils";
import { lootSurvivorBeastUrl } from "../../services/beast/constants";
import {
  clearTrackSounds,
  fetchBeastMusic,
  isKingSetTrack,
  trackRefOf,
  EFFECT_NAMES,
  EFFECT_TITLES,
  MUSIC_MODE_LABELS,
  type BeastMusic,
  type MusicTrack,
} from "../../services/beast/music";
import {
  buyTrackCalls,
  fetchSharedSongPreset,
  fetchSkullBalance,
  formatSkull,
  musicContractsProblem,
  setDefaultTrackCall,
  setSharedSongPresetCall,
  setTrackModeCall,
  txErrorMessage,
  waitForMusic,
  TRACK_PRICE_WEI,
} from "../../services/beast/musicActions";
import { waitForTx } from "../../services/tx";
import {
  estimateCallsFeeFri,
  fetchRankingInfo,
  fetchSpeciesRankedIds,
  formatStrk,
  rankingsStale,
  revertReason,
  updateRankingsCall,
  type RankingInfo,
} from "../../services/beast/rankings";
import { normaliseStarknetAddress } from "../../utils/address";

type Props = {
  tokenId: string;
  /** species id, to read the King's effects for Species Songs */
  speciesId?: number;
  /** species name ("Titan"), for the King's ranking notice */
  speciesName?: string;
  /** the token's `Sound Effects` preset (0-3), set by its rarity */
  soundEffects?: number;
  /** this beast is its species' King (Rank 1): its owner sets the Species Songs' effects */
  isKing?: boolean;
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

/**
 * Pre-flight for a King's staged effects change: are the species' on-chain
 * rankings current, and what will the transaction cost? When stale, the
 * transaction re-ranks the species first (`update_rankings`).
 */
type RankCheck =
  | { state: "checking" }
  | { state: "fresh"; feeFri: bigint | null }
  | { state: "stale"; info: RankingInfo; ids: string[]; feeFri: bigint }
  | { state: "error"; message: string };

/** The contract's revert reasons around King actions, in plain words. */
function kingFailureMessage(reason: string): string {
  if (/stale rankings/i.test(reason)) return "This species' rankings changed while checking. Try again.";
  if (/not strictly ranked|wrong count/i.test(reason))
    return "The ranking list from the indexer doesn't match the chain yet (a beast was just minted or changed). Try again in a minute.";
  if (/leader|king|rank/i.test(reason)) return `Only the species' Rank 1 beast can change this (${reason}).`;
  return reason.length > 160 ? `${reason.slice(0, 160)}…` : reason;
}

type Busy = { kind: "default" | "mode" | "buy" | "preset"; ref?: string; phase: "wallet" | "confirming" };

const TRACK_BLURBS: Record<string, string> = {
  "shared:0": "Warming up",
  "shared:1": "Shared by every beast of its species",
  named: "Unique to this beast",
};

/** `shared:<id>` -> id. */
const parseSharedId = (ref: string) => Number(ref.split(":")[1] ?? 0);

function blurb(track: MusicTrack): string {
  if (track.status === "pending") return "Composing…";
  return TRACK_BLURBS[track.ref] ?? (track.kind === "individual" ? "Purchased song" : "");
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
  speciesId,
  speciesName,
  soundEffects,
  isKing = false,
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
  /** King-set effects preset per Species Song ref (absent while loading / unreadable). */
  const [kingPresets, setKingPresets] = useState<Record<string, number>>({});
  /** The King's staged (not yet applied) effects choice for a Species Song. */
  const [stagedPreset, setStagedPreset] = useState<{ ref: string; preset: number } | null>(null);
  const [rankCheck, setRankCheck] = useState<RankCheck | null>(null);
  const [rankCheckRun, setRankCheckRun] = useState(0);

  const canManage =
    Boolean(account && address && owner) &&
    normaliseStarknetAddress(address) === normaliseStarknetAddress(owner);
  const canKing = canManage && isKing;

  // King staged an effects change: check the species' rankings and price the transaction.
  const stagedKey = stagedPreset ? `${stagedPreset.ref}:${stagedPreset.preset}` : null;
  useEffect(() => {
    setRankCheck(null);
    if (!stagedPreset || !canKing || !address || speciesId == null) return;
    const presetCall = setSharedSongPresetCall(tokenId, parseSharedId(stagedPreset.ref), stagedPreset.preset);
    let alive = true;
    setRankCheck({ state: "checking" });
    (async () => {
      const info = await fetchRankingInfo(speciesId);
      if (!rankingsStale(info)) {
        const feeFri = await estimateCallsFeeFri(address, [presetCall]).catch((err) => {
          // A revert here is worth showing; a flaky estimate is not.
          const reason = revertReason(err);
          if (/stale|rank|leader|king/i.test(reason)) throw new Error(kingFailureMessage(reason));
          return null;
        });
        return { state: "fresh", feeFri } as const;
      }
      const ids = await fetchSpeciesRankedIds(speciesId, info.total);
      const feeFri = await estimateCallsFeeFri(address, [updateRankingsCall(speciesId, ids), presetCall]).catch((err) => {
        throw new Error(kingFailureMessage(revertReason(err)));
      });
      return { state: "stale", info, ids, feeFri } as const;
    })()
      .then((check) => alive && setRankCheck(check))
      .catch((err) => {
        console.warn("[music] King pre-flight failed:", err);
        if (alive) setRankCheck({ state: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per staged change / retry
  }, [stagedKey, canKing, address, speciesId, tokenId, rankCheckRun]);

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

  // Species Songs use the King's effects, not the token's: read them on-chain.
  const kingTrackIds = (music?.tracks ?? []).filter(isKingSetTrack).map((t) => t.id ?? 0).join(",");
  useEffect(() => {
    setKingPresets({});
    if (!speciesId || !kingTrackIds) return;
    let alive = true;
    for (const id of kingTrackIds.split(",").map(Number)) {
      fetchSharedSongPreset(speciesId, id)
        .then((preset) => {
          if (alive) setKingPresets((prev) => ({ ...prev, [`shared:${id}`]: preset }));
        })
        .catch((err) => console.warn(`[music] couldn't read Species Song ${id} effects:`, err));
    }
    return () => {
      alive = false;
    };
  }, [speciesId, kingTrackIds]);

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

  /** A track's effects preset and an explanation, or null when unknown. */
  const trackEffect = (track: MusicTrack): { name: string; title: string } | null => {
    const king = isKingSetTrack(track);
    const preset = king ? kingPresets[track.ref] : soundEffects;
    if (preset == null || !EFFECT_NAMES[preset]) return null;
    const source = king
      ? "Set by the species' King for every beast of the species"
      : "Set by this beast's rarity";
    const echoNote = track.ref === "shared:0" && preset >= 2 ? " (Sound Checks skip the echo itself)" : "";
    return { name: EFFECT_NAMES[preset], title: `${EFFECT_TITLES[preset]}${echoNote}. ${source}.` };
  };

  /** King: apply a staged effects preset to a Species Song, then re-read it on-chain. */
  const applyPreset = async (track: MusicTrack, preset: number) => {
    if (!account || !music) return;
    const problem = musicContractsProblem(music);
    if (problem) {
      setError({ at: track.ref, message: problem });
      return;
    }
    const next = { kind: "preset" as const, ref: track.ref };
    setError(null);
    setBusy({ ...next, phase: "wallet" });
    try {
      const presetCall = setSharedSongPresetCall(tokenId, track.id ?? 0, preset);
      // Stale rankings: re-rank the species in the same transaction, or the King call reverts.
      const calls =
        rankCheck?.state === "stale" && speciesId != null
          ? [updateRankingsCall(speciesId, rankCheck.ids), presetCall]
          : [presetCall];
      const res = await account.execute(calls);
      setBusy({ ...next, phase: "confirming" });
      const outcome = await waitForTx(res.transaction_hash);
      if (outcome === "reverted" || outcome === "rejected") throw new Error(`Transaction ${outcome}.`);
      let current: number | null = null;
      for (let i = 0; i < 6 && current !== preset; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 2500));
        current = await fetchSharedSongPreset(speciesId ?? 0, track.id ?? 0).catch(() => current);
      }
      if (current != null) setKingPresets((prev) => ({ ...prev, [track.ref]: current }));
      if (current !== preset) {
        setError({ at: track.ref, message: "Your change was sent but isn't showing yet. Check back in a moment." });
      }
      setStagedPreset(null);
      clearTrackSounds(tokenId);
      onMusicChanged?.();
    } catch (err) {
      console.error("[music] set effects failed:", err);
      setError({ at: track.ref, message: txErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

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
                    {rowBusy ? busyLabel : (() => {
                      const fx = trackEffect(track);
                      return (
                        <>
                          {blurb(track)}
                          {fx && (
                            <span title={fx.title}>
                              {blurb(track) ? " · " : ""}
                              <span className="text-gold/80">{fx.name}</span>
                            </span>
                          )}
                        </>
                      );
                    })()}
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
              {canKing && ready && isKingSetTrack(track) && kingPresets[track.ref] != null && (() => {
                const saved = kingPresets[track.ref];
                const staged = stagedPreset?.ref === track.ref ? stagedPreset.preset : null;
                const chosen = staged ?? saved;
                const applying = rowBusy && busy?.kind === "preset";
                return (
                  <div className="mt-2 border-t border-white/[0.06] pt-2">
                    <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400" title="As this species' King, you choose how its Species Song is performed for every beast of the species">
                      Effects · King
                    </p>
                    <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label={`Effects of ${track.label}`}>
                      {EFFECT_NAMES.map((name, preset) => (
                        <button
                          key={name}
                          type="button"
                          role="radio"
                          aria-checked={chosen === preset}
                          disabled={busy !== null}
                          onClick={() => setStagedPreset(preset === saved ? null : { ref: track.ref, preset })}
                          title={`${EFFECT_TITLES[preset]}${preset === saved ? " (current)" : ""}`}
                          className={cn(
                            "rounded-md border px-1 py-1 text-[9px] font-semibold transition-colors disabled:opacity-50",
                            chosen === preset
                              ? "border-gold bg-gold/15 text-gold"
                              : "border-white/10 text-zinc-400 hover:border-gold/50 hover:text-gold",
                          )}
                        >
                          {name}
                          {preset === saved && <span aria-hidden> ✓</span>}
                        </button>
                      ))}
                    </div>
                    {staged != null && (() => {
                      const check = rankCheck;
                      const stale = check?.state === "stale";
                      const blocked = check == null || check.state === "checking" || check.state === "error";
                      const species = speciesName ?? "beast";
                      const newCount = stale ? check.info.total - check.info.ranked : 0;
                      return (
                        <div className="mt-1.5 space-y-1.5 rounded-md border border-gold/30 bg-gold/[0.06] px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[10px] font-semibold text-zinc-200">
                              {EFFECT_NAMES[saved]} → {EFFECT_NAMES[staged]}
                            </span>
                            <div className="flex flex-shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => setStagedPreset(null)}
                                className="text-[9px] font-semibold uppercase text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                              >
                                Discard
                              </button>
                              <button
                                type="button"
                                disabled={busy !== null || blocked}
                                onClick={() => applyPreset(track, staged)}
                                className="rounded bg-gold px-2 py-0.5 text-[9px] font-bold uppercase text-black hover:bg-gold/90 disabled:opacity-60"
                              >
                                {applying ? busyLabel : stale ? "Re-rank & apply" : "Apply"}
                              </button>
                            </div>
                          </div>
                          {check?.state === "checking" && (
                            <p className="text-[9px] text-zinc-400">Checking {species} rankings and the network fee…</p>
                          )}
                          {check?.state === "fresh" && check.feeFri != null && (
                            <p className="text-[9px] text-zinc-400">Network fee ≈ {formatStrk(check.feeFri)} STRK</p>
                          )}
                          {stale && (
                            <div className="space-y-1 rounded border border-amber-400/30 bg-amber-400/[0.07] px-2 py-1.5 text-[9px] leading-snug text-amber-100">
                              <p className="font-bold text-amber-300">
                                Higher fee: this also re-ranks every {species} (≈ {formatStrk(check.feeFri)} STRK)
                              </p>
                              <p>
                                {newCount === 1 ? "A new " + species + " was" : `${newCount} new ${species}s were`} minted since the
                                rankings were last saved on-chain. The contract only accepts King changes while every {species} is
                                ranked, so this transaction first saves the full ranking of all{" "}
                                {check.info.total.toLocaleString()} {species}s, then applies your effects.
                              </p>
                              <p className="text-amber-100/70">
                                Writing {check.info.total.toLocaleString()} beasts on-chain is what makes the fee higher. It's a
                                one-off: King changes cost the usual small fee again until the next new {species} is minted.
                              </p>
                            </div>
                          )}
                          {check?.state === "error" && (
                            <p className="text-[9px] text-red-400">
                              {check.message}{" "}
                              <button type="button" className="text-gold hover:underline" onClick={() => setRankCheckRun((n) => n + 1)}>
                                Check again
                              </button>
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
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
          <span>Open on Loot Survivor (Live previews, Replay, King sound mode)</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
      </div>
    </div>
  );
}
