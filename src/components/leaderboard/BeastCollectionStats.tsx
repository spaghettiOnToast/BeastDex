import { useEffect, useState } from "react";
import { fetchTierCollectionStats, type TierCollectionStats } from "../../services/beast";
import { useBeastHighlights } from "../../hooks/useBeastQueries";
import { GradeBrowser } from "./GradeBrowser";
import { CollectionGlance } from "./CollectionGlance";

const TIER_COLORS: Record<number, { text: string; gradient: string; border: string }> = {
  1: { text: "text-orange-400", gradient: "from-orange-500 to-orange-400", border: "border-orange-500/30" },
  2: { text: "text-purple-400", gradient: "from-purple-500 to-purple-400", border: "border-purple-500/30" },
  3: { text: "text-blue-400", gradient: "from-blue-500 to-blue-400", border: "border-blue-500/30" },
  4: { text: "text-green-400", gradient: "from-green-500 to-green-400", border: "border-green-500/30" },
  5: { text: "text-white", gradient: "from-gray-200 to-white", border: "border-gray-400/30" },
};

export function BeastCollectionStats() {
  const [tierStats, setTierStats] = useState<TierCollectionStats[]>([]);
  const [tierStatsLoading, setTierStatsLoading] = useState(true);

  const { data: highlights, loading: highlightsLoading } = useBeastHighlights();

  useEffect(() => {
    let cancelled = false;

    fetchTierCollectionStats()
      .then((data) => { if (!cancelled) { setTierStats(data); setTierStatsLoading(false); } })
      .catch(() => { if (!cancelled) setTierStatsLoading(false); });

    return () => { cancelled = true; };
  }, []);


  const summaryTiles = [
    { label: "Animated Shinies", value: highlights?.animatedShinyCount ?? 0, gradient: "from-pink-400/20 via-purple-400/10 to-accent/20", accent: "text-pink-400" },
    { label: "Shiny Beasts", value: highlights?.shinyCount ?? 0, gradient: "from-yellow-400/20 via-amber-400/10 to-orange-400/20", accent: "text-amber-400" },
    { label: "Animated Beasts", value: highlights?.animatedCount ?? 0, gradient: "from-sky-400/20 via-accent/10 to-teal-400/20", accent: "text-accent" },
    { label: "Standard Beasts", value: highlights?.standardCount ?? 0, gradient: "from-zinc-500/20 via-zinc-700/10 to-zinc-900/20", accent: "text-zinc-300" },
  ];

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryTiles.map((tile) => (
          <div
            key={tile.label}
            className={`relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br ${tile.gradient} p-5`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/40" />
            <div className="relative z-10">
              <div className="text-xs uppercase tracking-[0.3em] text-zinc-400">{tile.label}</div>
              <div className={`mt-3 text-3xl font-black tracking-tight ${tile.accent}`}>
                {highlightsLoading && !highlights ? "—" : tile.value.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-zinc-500">Total collected across all adventurers</div>
            </div>
          </div>
        ))}
      </div>

      {/* Collection-wide fun figures */}
      <CollectionGlance />

      {/* Tier stats */}
      <div className="bg-surface-raised border border-white/[0.06] rounded-xl p-4">
        <div className="text-xs uppercase tracking-[0.35em] text-zinc-500 mb-4">Collection by Tier</div>
        <div className="grid gap-3 sm:grid-cols-5">
          {tierStatsLoading ? (
            <div className="col-span-5 flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : (
            [...tierStats].sort((a, b) => a.tier - b.tier).map((tier) => {
              const remaining = Math.max(tier.maxSupply - tier.collected, 0);
              const progress = tier.maxSupply > 0 ? Math.min((tier.collected / tier.maxSupply) * 100, 100) : 0;
              const colors = TIER_COLORS[tier.tier] ?? TIER_COLORS[5];
              return (
                <div key={tier.tier} className={`relative overflow-hidden rounded-lg border ${colors.border} bg-white/[0.04] p-3`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-bold ${colors.text}`}>T{tier.tier}</span>
                    <span className="text-xs text-zinc-400">{progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden mb-2">
                    <div className={`h-full bg-gradient-to-r ${colors.gradient} transition-all`} style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className={`font-semibold ${colors.text}`}>{tier.collected.toLocaleString()}</span>
                    <span className={`font-semibold ${remaining <= 100 ? "text-red-400" : "text-zinc-400"}`}>
                      {remaining.toLocaleString()} left
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Browse beasts by card grade (0-10) */}
      <GradeBrowser />

    </div>
  );
}
