import { useState } from "react";
import type { CollectionSet, SetCollectionStats } from "../../services/beast/setStats";
import { presetShareLabel } from "../../services/beast/helpers";

const TIER_COLORS: Record<number, { text: string; gradient: string; border: string }> = {
  1: { text: "text-orange-400", gradient: "from-orange-500 to-orange-400", border: "border-orange-500/30" },
  2: { text: "text-purple-400", gradient: "from-purple-500 to-purple-400", border: "border-purple-500/30" },
  3: { text: "text-blue-400", gradient: "from-blue-500 to-blue-400", border: "border-blue-500/30" },
  4: { text: "text-green-400", gradient: "from-green-500 to-green-400", border: "border-green-500/30" },
  5: { text: "text-white", gradient: "from-gray-200 to-white", border: "border-gray-400/30" },
};

const SET_BAR: Record<CollectionSet, { text: string; bar: string }> = {
  original: { text: "text-[#39ff14]", bar: "bg-[#39ff14] shadow-[0_0_8px_#39ff14]" },
  loot: { text: "text-[#d4a017]", bar: "bg-[#d4a017] shadow-[0_0_8px_#d4a017]" },
  abstract: { text: "text-[#c084fc]", bar: "bg-[#c084fc] shadow-[0_0_8px_#c084fc]" },
};

const VISUAL_STYLE: Record<string, { gradient: string; accent: string; sub?: string }> = {
  "Shiny MIDI": { gradient: "from-pink-400/20 via-purple-400/10 to-accent/20", accent: "text-pink-400" },
  Shiny: { gradient: "from-yellow-400/20 via-amber-400/10 to-orange-400/20", accent: "text-amber-400" },
  Mega: {
    gradient: "from-pink-400/20 via-amber-400/10 to-orange-400/20",
    accent: "text-pink-400",
    sub: "Staked beasts reach Mega form · the only shinies",
  },
  MIDI: { gradient: "from-sky-400/20 via-accent/10 to-teal-400/20", accent: "text-accent" },
  Standard: { gradient: "from-zinc-500/20 via-zinc-700/10 to-zinc-900/20", accent: "text-zinc-300" },
};

/**
 * Collection progress per species set (Originals / Loot / Abstract Beasts): a "Beasts
 * Collected" bar for each, then the selected set's visual tiles and tiers.
 */
export function SetCollectionPanel({
  sets,
  loading,
  active: activeProp,
  onActiveChange,
}: {
  sets: SetCollectionStats[];
  loading: boolean;
  /** controlled selection, for pages whose other sections follow the toggle */
  active?: CollectionSet;
  onActiveChange?: (set: CollectionSet) => void;
}) {
  const [own, setOwn] = useState<CollectionSet>("original");
  const active = activeProp ?? own;
  const setActive = onActiveChange ?? setOwn;
  const current = sets.find((s) => s.set === active) ?? sets[0];

  if (loading && sets.length === 0) {
    return (
      <div className="flex justify-center rounded-xl border border-white/[0.06] bg-surface-raised py-6">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }
  if (!current) return null;

  const visualTotal = current.visuals.reduce((s, v) => s + v.value, 0);

  return (
    <div className="space-y-3">
      {/* Beasts Collected, one bar per set */}
      <div className="rounded-xl border border-white/[0.06] bg-surface-raised px-4 py-1">
        {sets.map((s) => {
          const progress = s.maxSupply > 0 ? Math.min((s.collected / s.maxSupply) * 100, 100) : 0;
          const colors = SET_BAR[s.set];
          return (
            <div key={s.set} className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:gap-5">
              <div className="flex shrink-0 items-baseline gap-1.5 sm:w-[19rem]">
                <span className={`text-lg font-bold sm:text-xl ${colors.text}`}>{s.collected.toLocaleString()}</span>
                <span className="text-xs text-zinc-500 sm:text-sm">/</span>
                <span className="text-xs text-zinc-400 sm:text-sm">{s.maxSupply.toLocaleString()}</span>
                <span className="ml-1 truncate text-xs text-zinc-500 sm:text-sm">{s.label}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06] sm:w-auto sm:flex-1">
                <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${progress}%` }} />
              </div>
              <span className="hidden shrink-0 text-xs text-zinc-500 sm:inline">
                {Math.max(s.maxSupply - s.collected, 0).toLocaleString()} left
              </span>
            </div>
          );
        })}
      </div>

      {/* Set toggle */}
      <div className="flex gap-2">
        {sets.map((s) => (
          <button
            key={s.set}
            type="button"
            onClick={() => setActive(s.set)}
            aria-pressed={active === s.set}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              active === s.set
                ? "border-lsGold bg-lsGold/15 text-lsGold"
                : "border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:border-lsGold/40 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Visual tiles */}
      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${current.visuals.length === 3 ? "sm:grid-cols-3" : "xl:grid-cols-4"}`}>
        {current.visuals.map((v, i) => {
          const style = VISUAL_STYLE[v.label] ?? VISUAL_STYLE.Standard;
          return (
            <div
              key={v.label}
              className={`relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br ${style.gradient} p-4 sm:p-5 ${
                current.visuals.length === 3 && i === 0 ? "col-span-2 sm:col-span-1" : ""
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/40" />
              <div className="relative z-10">
                <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-400 sm:text-xs">{v.label} Beasts</div>
                <div className={`mt-2 text-2xl font-black tracking-tight sm:mt-3 sm:text-3xl ${style.accent}`}>
                  {v.value.toLocaleString()}
                </div>
                <div className="mt-1 text-[10px] text-zinc-500 sm:mt-2 sm:text-xs">
                  {v.value === 0 && style.sub ? style.sub : presetShareLabel(v.value, visualTotal)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tiers */}
      <div className="rounded-xl border border-white/[0.06] bg-surface-raised p-3 sm:p-4">
        <div className="mb-3 text-[10px] uppercase tracking-[0.35em] text-zinc-500 sm:mb-4 sm:text-xs">
          {current.label} by Tier
        </div>
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {current.tiers.map((tier) => {
            const left = Math.max(tier.maxSupply - tier.collected, 0);
            const progress = tier.maxSupply > 0 ? Math.min((tier.collected / tier.maxSupply) * 100, 100) : 0;
            const colors = TIER_COLORS[tier.tier] ?? TIER_COLORS[5];
            return (
              <div key={tier.tier} className={`relative overflow-hidden rounded-lg border ${colors.border} bg-white/[0.04] p-2 sm:p-3`}>
                <div className="mb-1.5 flex items-center justify-between sm:mb-2">
                  <span className={`text-xs font-bold sm:text-sm ${colors.text}`}>T{tier.tier}</span>
                  <span className="text-[9px] text-zinc-400 sm:text-xs">{progress.toFixed(1)}%</span>
                </div>
                <div className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.06] sm:mb-2 sm:h-1.5">
                  <div className={`h-full bg-gradient-to-r ${colors.gradient} transition-all`} style={{ width: `${progress}%` }} />
                </div>
                <div className="flex justify-between text-[9px] sm:text-xs">
                  <span className={`font-semibold ${colors.text}`}>{tier.collected.toLocaleString()}</span>
                  <span className={`font-semibold ${left <= 100 ? "text-red-400" : "text-zinc-400"}`}>{left.toLocaleString()} left</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
