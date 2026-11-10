import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Beast, BeastAttribute } from "../../services/beast";
import type { SummitBeastData } from "../../services/summit";
import CometCard from "../ui/CometCard";
import BeastCard from "./BeastCard";
import SummitStats from "./SummitStats";
import { cn } from "../../lib/utils";
import { beastConditionRows } from "../../services/beast/condition";
import { fetchTrackSound, type MusicTrack } from "../../services/beast/music";
import type { BeastPlayerHandle, BeastSoundData } from "@provable-games/collectables";
import BeastPlayerCard from "./BeastPlayerCard";
import GradedSlab from "./GradedSlab";
import { isSlabbed } from "../../utils/slab";
import BeastMusicPanel from "./BeastMusicPanel";
import { SUMMIT_ENABLED } from "../../services/summitApi/constants";

type BeastDetailContentProps = {
  beast: Beast;
  ownerUsername?: string | null;
  actionSlot?: ReactNode;
  summitData?: SummitBeastData | null;
  summitLoading?: boolean;
  hideFooter?: boolean;
};

const BOOLEAN_ATTRIBUTES = new Set(["shiny", "animated", "genesis"]);
const UNIX_TIMESTAMP_ATTRIBUTES = new Set(["last death timestamp", "minted", "transfer locked until"]);
// v3 attributes hidden from the grid: raw preset selectors (shown as "Visual")
// and the 76-digit token id (shown in the header / URL).
const HIDDEN_ATTRIBUTES = new Set(["visual effects", "token id"]);
// Display names for legacy trait keys. "Animated" is the V2 name for presets 2/3; in v3 every
// original is animated and those presets mean the MIDI effect.
const ATTRIBUTE_LABELS: Record<string, string> = { animated: "MIDI" };

type RightPanelTab = "summit" | "metadata" | "condition" | "music";

// Color mapping for different attribute types
const getAttributeStyle = (trait: string | undefined) => {
  if (!trait)
    return {
      bg: "bg-white/[0.06]",
      border: "border-white/[0.08]",
      text: "text-zinc-300",
    };
  const t = trait.toLowerCase();

  if (t === "tier")
    return {
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30",
      text: "text-yellow-300",
    };
  if (t === "level")
    return {
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      text: "text-blue-300",
    };
  if (t === "type")
    return {
      bg: "bg-purple-500/10",
      border: "border-purple-500/30",
      text: "text-purple-300",
    };
  if (t === "power")
    return {
      bg: "bg-orange-500/10",
      border: "border-orange-500/30",
      text: "text-orange-300",
    };
  if (t === "health")
    return {
      bg: "bg-pink-500/10",
      border: "border-pink-500/30",
      text: "text-pink-300",
    };
  if (t === "rank")
    return {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      text: "text-emerald-300",
    };
  if (t === "prefix" || t === "suffix")
    return {
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/30",
      text: "text-cyan-300",
    };
  if (t === "adventurers killed")
    return {
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-300",
    };
  if (t === "shiny" || t === "animated" || t === "genesis")
    return {
      bg: "bg-[#22c55e]/10",
      border: "border-[#22c55e]/30",
      text: "text-[#22c55e]",
    };

  return {
    bg: "bg-white/[0.06]",
    border: "border-white/[0.08]",
    text: "text-zinc-300",
  };
};

export function BeastDetailContent({
  beast,
  ownerUsername,
  actionSlot,
  summitData,
  summitLoading,
  hideFooter = false,
}: BeastDetailContentProps) {
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("metadata");
  // v3 only: the print condition is packed into the token id. Legacy ids
  // would decode into garbage, so gate on a v3-only field.
  const conditionRows = useMemo(
    () => (beast.visualEffects !== undefined ? beastConditionRows(beast.tokenId) : null),
    [beast.visualEffects, beast.tokenId],
  );
  // ── Music (v3) ──────────────────────────────────────────────────────────
  const isV3 = beast.visualEffects !== undefined && Boolean(beast.tokenId);
  const playerRef = useRef<BeastPlayerHandle | null>(null);
  const currentTokenRef = useRef(beast.tokenId);
  currentTokenRef.current = beast.tokenId;
  const [selectedTrackRef, setSelectedTrackRef] = useState<string | null>(null);
  const [trackSound, setTrackSound] = useState<BeastSoundData | undefined>(undefined);
  const [loadingTrackRef, setLoadingTrackRef] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  // Bumped when the owner changes the default track / a mode on-chain, so the
  // player reloads the token's (new) default sound.
  const [playerKey, setPlayerKey] = useState(0);
  const handleMusicChanged = useCallback(() => {
    setSelectedTrackRef(null);
    setTrackSound(undefined);
    setPlayerKey((k) => k + 1);
  }, []);

  // New beast: back to its default track, nothing playing.
  useEffect(() => {
    setSelectedTrackRef(null);
    setTrackSound(undefined);
    setLoadingTrackRef(null);
    setPlaying(false);
    setRightPanelTab((t) => (t === "music" || t === "condition" ? "metadata" : t));
  }, [beast.tokenId]);

  const handlePlayTrack = useCallback(
    async (track: MusicTrack, isActive: boolean) => {
      if (isActive && playerRef.current) {
        playerRef.current.toggle();
        return;
      }
      const tokenId = beast.tokenId;
      setLoadingTrackRef(track.ref);
      try {
        const sound = await fetchTrackSound(tokenId, track.ref);
        if (tokenId !== currentTokenRef.current) return; // beast changed meanwhile
        setSelectedTrackRef(track.ref);
        setTrackSound(sound); // rebuilds the player with autoplay
      } catch (err) {
        console.warn("[music] failed to load track:", err);
      } finally {
        setLoadingTrackRef(null);
      }
    },
    [beast.tokenId],
  );

  const attributes = (Array.isArray(beast.attributes) ? beast.attributes : []).filter(
    (attr) => !HIDDEN_ATTRIBUTES.has(String(attr.trait_type ?? "").toLowerCase()),
  );

  const ownerAddressLower = beast.owner ? beast.owner.toLowerCase() : "";
  const accountIdentifier = ownerUsername
    ? ownerUsername.trim().toLowerCase()
    : ownerAddressLower;

  const ownerLabel = ownerUsername
    ? ownerUsername
    : beast.owner
      ? `${beast.owner.slice(0, 6)}…${beast.owner.slice(-4)}`
      : "";

  const formatAttributeValue = (
    trait: string | undefined,
    value: BeastAttribute["value"],
  ) => {
    if (!trait) return String(value);
    const t = trait.toLowerCase();

    if (BOOLEAN_ATTRIBUTES.has(t)) {
      if (value === "1" || value === 1) return "Yes";
      if (value === "0" || value === 0) return "No";
    }

    if (t === "card grade") {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? `${n} / 10` : "—";
    }

    if (UNIX_TIMESTAMP_ATTRIBUTES.has(t)) {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n) && n > 0) {
        const d = new Date(n * 1000);
        if (!Number.isNaN(d.getTime())) return d.toLocaleString();
      }
    }

    return String(value);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Main Content: Beast Card + Right Panel */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-40 justify-center items-stretch">
        {/* Left: CometCard (green glow + tilt) with BeastCard content overlaid */}
        <div className="w-[360px] flex-shrink-0 flex items-center justify-start">
          <CometCard className="w-full">
            {isV3 ? (() => {
              const player = (
                <BeastPlayerCard
                  key={playerKey}
                  beast={beast}
                  trackSound={trackSound}
                  onStateChange={(st) => setPlaying(st.playing)}
                  onPlayer={(p) => {
                    playerRef.current = p;
                    if (!p) setPlaying(false);
                  }}
                />
              );
              // Grade 7+: the playable card sealed in its graded slab.
              return isSlabbed(beast) ? <GradedSlab beast={beast}>{player}</GradedSlab> : player;
            })() : (
              <BeastCard beast={beast} owned={false} />
            )}
          </CometCard>
        </div>

        {/* Right: Tabs + Content */}
        {/* Fixed height (matches the 360px-wide, 250:350-ratio card at ~504px) so
            switching tabs never resizes the panel — Summit's longer content
            scrolls within it instead of growing the container. */}
        <div className="w-[340px] sm:w-[360px] lg:h-[508px] flex flex-col gap-2 flex-shrink-0 overflow-hidden">
          {/* Tab Buttons - Compact */}
          <div className="flex rounded-lg border border-white/[0.06] bg-surface/60 p-0.5">
            <button
              type="button"
              onClick={() => setRightPanelTab("metadata")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all",
                rightPanelTab === "metadata"
                  ? "bg-gold/15 text-gold border border-gold/20"
                  : "text-zinc-500 hover:text-gold",
              )}
            >
              Metadata
            </button>
            {isV3 && (
              <button
                type="button"
                onClick={() => setRightPanelTab("music")}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all",
                  rightPanelTab === "music"
                    ? "bg-gold/15 text-gold border border-gold/20"
                    : "text-zinc-500 hover:text-gold",
                )}
              >
                Music
              </button>
            )}
            {conditionRows && (
              <button
                type="button"
                onClick={() => setRightPanelTab("condition")}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all",
                  rightPanelTab === "condition"
                    ? "bg-gold/15 text-gold border border-gold/20"
                    : "text-zinc-500 hover:text-gold",
                )}
              >
                Condition
              </button>
            )}
            {/* Summit only knows legacy (pre-v3) beasts, and needs its API configured */}
            {!isV3 && SUMMIT_ENABLED && (
            <button
                type="button"
                onClick={() => setRightPanelTab("summit")}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all",
                  rightPanelTab === "summit"
                    ? "bg-accent/20 text-accent border border-accent/30"
                    : "text-zinc-500 hover:text-accent",
                )}
              >
                Summit
              </button>
            )}
          </div>

          {/* Panel Content - Stretch to match card height */}
          <div className="flex-1 min-h-0 rounded-xl border border-white/[0.06] bg-surface/60 overflow-y-auto">
            {rightPanelTab === "music" && isV3 ? (
              <BeastMusicPanel
                tokenId={beast.tokenId}
                speciesId={beast.speciesId}
                speciesName={String(beast.attributes.find((a) => a.trait_type === "Beast")?.value ?? "") || undefined}
                soundEffects={beast.soundEffects ?? beast.visualEffects}
                isKing={(beast.onchainRank ?? Number(beast.attributes.find((a) => a.trait_type.toLowerCase() === "rank")?.value)) === 1}
                owner={beast.owner}
                onMusicChanged={handleMusicChanged}
                selectedRef={selectedTrackRef}
                playing={playing}
                loadingRef={loadingTrackRef}
                onPlayTrack={handlePlayTrack}
              />
            ) : rightPanelTab === "condition" && conditionRows ? (
              /* Print Condition Panel (v3) */
              <div className="h-full flex flex-col">
                <div className="flex-shrink-0 px-3 py-2 border-b border-white/[0.06] bg-surface/30">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gold uppercase tracking-wider">
                      Print Condition
                    </span>
                    <span className="text-[10px] font-bold text-zinc-300">
                      {beast.cardGrade ? `Grade ${beast.cardGrade} / 10` : "Ungraded"}
                    </span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {conditionRows.map((row) => {
                      const flawed = row.value !== "None" && row.value !== "0" && row.value !== "Centered" && row.value !== "50/50";
                      return (
                        <div
                          key={row.label}
                          className="rounded border border-white/[0.06] bg-white/[0.03] px-2 py-1.5"
                        >
                          <p className="text-[8px] uppercase tracking-wide text-zinc-500 font-medium">
                            {row.label}
                          </p>
                          <p className={`text-[11px] font-bold truncate ${flawed ? "text-amber-300" : "text-zinc-200"}`}>
                            {row.value}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : rightPanelTab === "summit" ? (
              /* Summit Stats Panel */
              <div className="min-h-full">
                <SummitStats
                  beast={beast}
                  summitData={summitData ?? null}
                  loading={summitLoading}
                />
              </div>
            ) : (
              /* Metadata Panel */
              <div className="h-full flex flex-col">
                {/* Compact Header */}
                <div className="flex-shrink-0 px-3 py-2 border-b border-white/[0.06] bg-surface/30">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gold uppercase tracking-wider">
                      Attributes
                    </span>
                    <span className="text-[9px] text-zinc-500">
                      {attributes.length}
                    </span>
                  </div>
                </div>

                {/* Scrollable Attributes - Compact Grid */}
                <div className="flex-1 overflow-y-auto p-2">
                  {attributes.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1.5">
                      {attributes.map((attr, idx) => {
                        const style = getAttributeStyle(attr.trait_type);
                        const projectedRank = beast.rankProjected && attr.trait_type === "Rank";
                        return (
                          <div
                            key={`${attr.trait_type}-${attr.value}-${idx}`}
                            className={`rounded border ${style.border} ${style.bg} px-2 py-1.5`}
                          >
                            <p className="text-[8px] uppercase tracking-wide text-zinc-500 font-medium">
                              {ATTRIBUTE_LABELS[String(attr.trait_type ?? "").toLowerCase()] ?? attr.trait_type}
                            </p>
                            <p
                              className={`text-[11px] font-bold ${style.text} truncate`}
                              title={
                                projectedRank
                                  ? `Projected rank: on-chain ranks haven't been updated since new beasts were minted (on-chain: ${beast.onchainRank ? `#${beast.onchainRank}` : "not ranked yet"})`
                                  : String(attr.value)
                              }
                            >
                              {formatAttributeValue(
                                attr.trait_type,
                                attr.value,
                              )}
                              {projectedRank && (
                                <span className="ml-1 text-[8px] font-medium uppercase tracking-wide text-zinc-500">projected</span>
                              )}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-[10px] text-zinc-500">No metadata</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer: Owner + Actions - Only shown when not hidden */}
      {!hideFooter && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
          {/* Owned by */}
          <div className="rounded-lg border border-white/[0.06] bg-surface/40 px-4 py-2.5 text-sm text-zinc-400">
            {beast.owner ? (
              <span>
                Owned by{" "}
                <Link
                  to={`/collection/${encodeURIComponent(accountIdentifier)}`}
                  className="text-gold font-medium hover:underline"
                >
                  {ownerLabel}
                </Link>
              </span>
            ) : (
              <span>Not owned</span>
            )}
          </div>

          {/* Action Buttons */}
          {actionSlot && <div className="flex flex-wrap gap-2">{actionSlot}</div>}
        </div>
      )}
    </div>
  );
}

export default BeastDetailContent;
