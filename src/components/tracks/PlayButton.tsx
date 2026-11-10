import { Pause, Play } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Beast } from "../../services/beast";
import type { NowPlaying, PlayerStatus } from "./TrackPlayerBar";

/** The Tracks page's shared player: one track plays at a time. */
export type Player = {
  current: NowPlaying | null;
  status: PlayerStatus;
  /** Play an item, or toggle it when it's already the current one. */
  play: (item: NowPlaying) => void;
  /** Open a beast in the card modal (instead of leaving the page). */
  open: (beast: Beast) => void;
};

export function PlayButton({
  player,
  item,
  label,
  disabled,
  className,
}: {
  player: Player;
  item: NowPlaying | null;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const isCurrent = item != null && player.current?.key === item.key;
  const playing = isCurrent && player.status === "playing";
  const loading = isCurrent && player.status === "loading";
  return (
    <button
      type="button"
      disabled={disabled || !item}
      onClick={() => item && player.play(item)}
      aria-label={`${playing ? "Pause" : "Play"} ${label}`}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40",
        isCurrent ? "border-gold bg-gold/15 text-gold" : "border-white/10 text-zinc-300 hover:border-gold/50 hover:text-gold",
        className,
      )}
    >
      {loading ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : playing ? (
        <Pause className="h-3 w-3" />
      ) : (
        <Play className="h-3 w-3" />
      )}
      {label}
    </button>
  );
}
