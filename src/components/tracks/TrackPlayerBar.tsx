import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { mountBeastPlayer, type BeastPlayerHandle } from "@provable-games/collectables";
import { Pause, Play, X } from "lucide-react";
import type { Beast } from "../../services/beast";
import { fetchV3CardImgSrc } from "../../services/beast/cardImage";
import { fetchTrackSound } from "../../services/beast/music";

export type NowPlaying = {
  /** unique per playable item, e.g. `species:12:shared:1` */
  key: string;
  beast: Beast;
  /** track ref to play: `shared:0`, `shared:1`, `named` */
  track: string;
  title: string;
  subtitle: string;
};

export type PlayerStatus = "loading" | "playing" | "paused" | "error";

type Props = {
  item: NowPlaying | null;
  /** bump to toggle play/pause of the current item */
  toggleSignal: number;
  onStatus: (status: PlayerStatus) => void;
  onClose: () => void;
};

function attr(beast: Beast, trait: string): string | null {
  const a = beast.attributes.find((x) => x.trait_type.toLowerCase() === trait.toLowerCase());
  return a?.value != null ? String(a.value) : null;
}

/**
 * One player for the whole Tracks page, docked at the bottom: the playing
 * beast's card as a thumbnail plus transport. Uses the SDK player (the same
 * synth as the token's on-chain page) with its own button hidden.
 */
export default function TrackPlayerBar({ item, toggleSignal, onStatus, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<BeastPlayerHandle | null>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const report = (s: PlayerStatus) => {
    setStatus(s);
    onStatusRef.current(s);
  };

  useEffect(() => {
    const container = containerRef.current;
    playerRef.current?.dispose();
    playerRef.current = null;
    if (!item || !container) return;
    let alive = true;
    report("loading");
    setError(null);
    const { beast, track } = item;
    (async () => {
      try {
        const [card, sound] = await Promise.all([
          fetchV3CardImgSrc({
            tokenId: beast.tokenId,
            speciesName: attr(beast, "Beast") ?? beast.name,
            prefixName: attr(beast, "Prefix"),
            suffixName: attr(beast, "Suffix"),
            rank: Number(attr(beast, "Rank") ?? 0) || 0,
          }),
          fetchTrackSound(beast.tokenId, track),
        ]);
        if (!alive) return;
        playerRef.current = mountBeastPlayer(container, {
          card,
          sound,
          playButton: false,
          autoplay: true,
          alt: beast.name,
          onStateChange: (s) => {
            if (!alive) return;
            if (s.error) {
              setError(s.error);
              report("error");
            } else if (s.ready) {
              report(s.playing ? "playing" : "paused");
            }
          },
        });
      } catch (err) {
        console.warn("[tracks] couldn't start track:", err);
        if (alive) {
          setError("Couldn't load this track.");
          report("error");
        }
      }
    })();
    return () => {
      alive = false;
      playerRef.current?.dispose();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when the item changes
  }, [item?.key]);

  useEffect(() => {
    if (toggleSignal > 0) playerRef.current?.toggle();
  }, [toggleSignal]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/90 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
        <Link
          to={`/beasts/${encodeURIComponent(item.beast.tokenId)}`}
          className="relative h-[67px] w-12 flex-shrink-0 overflow-hidden rounded"
          aria-label={`Open ${item.beast.name}`}
        >
          <div ref={containerRef} className="absolute inset-0" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{item.title}</p>
          <p className="truncate text-[11px] text-zinc-400">
            {status === "error" ? <span className="text-red-400">{error}</span> : item.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => playerRef.current?.toggle()}
          disabled={status === "loading" || status === "error"}
          aria-label={status === "playing" ? "Pause" : "Play"}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gold text-black transition-colors hover:bg-gold/90 disabled:opacity-50"
        >
          {status === "loading" ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
          ) : status === "playing" ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 translate-x-[1px]" />
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close player"
          className="flex-shrink-0 text-zinc-500 transition-colors hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
