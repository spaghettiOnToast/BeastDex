import { Link } from "react-router-dom";
import { Music } from "lucide-react";
import { cn } from "../../lib/utils";

/** Link to the Tracks page's My Music tab, where the wallet manages its beasts' tracks. */
export function ManageTracksLink({ className }: { className?: string }) {
  return (
    <Link
      to="/tracks?tab=mine"
      title="See and change your beasts' tracks"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-gold/40 hover:text-gold",
        className,
      )}
    >
      <Music className="h-3.5 w-3.5" /> <span>Manage tracks</span>
    </Link>
  );
}
