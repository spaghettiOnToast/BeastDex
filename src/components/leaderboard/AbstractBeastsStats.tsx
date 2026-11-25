import { useEffect, useState } from "react";
import type { Beast } from "../../services/beast";
import { fetchAbstractBeastStats, type AbstractBeastStats } from "../../services/lootBeastStats";
import { presetShareLabel } from "../../services/beast/helpers";
import { useControllerUsernames } from "../../hooks/useControllerUsernames";
import { normaliseStarknetAddress } from "../../utils/address";
import BeastModal from "../beast/BeastModal";
import { GlanceTiles, StrongestBeastCard, type GlanceTile } from "./CollectionGlance";
import { AbstractDungeonLeaderboards } from "./LootBagLeaderboards";

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

function useAbstractBeastStats() {
  const [stats, setStats] = useState<AbstractBeastStats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchAbstractBeastStats()
      .then((s) => !cancelled && setStats(s))
      .catch((err) => {
        console.error("Failed to load Abstract beast stats:", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { stats, failed };
}

/** "Abstract Beasts at a glance": strongest beast, holders, dungeon activity and name figures. */
export function AbstractGlance() {
  const { stats, failed } = useAbstractBeastStats();
  const [selected, setSelected] = useState<Beast | null>(null);

  const strongest = stats?.strongest ?? null;
  const { usernames } = useControllerUsernames([strongest?.owner]);
  const ownerKey = normaliseStarknetAddress(strongest?.owner);

  const total = stats?.total ?? 0;
  const v = (n: number | undefined) => (n == null ? "…" : n.toLocaleString());

  const tiles: GlanceTile[] = [
    {
      label: "Holders",
      value: v(stats?.holders),
      sub: stats && stats.holders > 0 ? `~${Math.round(total / stats.holders)} beasts each` : "",
      accent: "text-white",
    },
    {
      label: "Beasts slain",
      value: v(stats?.claims),
      sub: stats ? "claimed in the Abstract Dungeon" : "",
      accent: "text-[#8bff72]",
    },
    {
      label: "Daily games",
      value: v(stats?.entries),
      sub: stats ? "free games entered" : "",
      accent: "text-[#c084fc]",
    },
    {
      label: "Players",
      value: v(stats?.players),
      sub: stats ? "entered or claimed" : "",
      accent: "text-amber-300",
    },
    {
      label: "Most common name",
      value: stats?.topName ? `“${stats.topName.label}”` : "…",
      sub: stats?.topName ? `×${stats.topName.count.toLocaleString()}` : "",
      accent: "text-purple-300",
      small: true,
      wide: true,
    },
    {
      label: "Most common prefix",
      value: stats?.topPrefix?.label ?? "…",
      sub: stats?.topPrefix ? `on ${stats.topPrefix.count.toLocaleString()} beasts` : "",
      accent: "text-emerald-300",
      small: true,
    },
    {
      label: "Grade 10",
      value: stats ? pct(stats.grade10, total) : "…",
      sub: stats ? `${stats.grade10.toLocaleString()} cards` : "",
      accent: "text-[#e2b94c]",
    },
  ];

  if (failed) return null;
  return (
    <>
      <div className="rounded-xl border border-white/[0.06] bg-surface-raised p-4">
        <div className="mb-3 text-xs uppercase tracking-[0.35em] text-zinc-500">
          Abstract Beasts at a glance
          {stats && (
            <span className="normal-case tracking-normal">
              {" "}· {total.toLocaleString()} beasts{stats.genesis > 0 && `, excluding ${stats.genesis} Genesis`}
            </span>
          )}
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
          <StrongestBeastCard
            beast={strongest}
            ownerName={ownerKey ? usernames[ownerKey] : undefined}
            ownerLabel="Owned by"
            onSelect={setSelected}
          />
          <GlanceTiles tiles={tiles} />
        </div>
      </div>
      {selected && <BeastModal beast={selected} ownerUsernames={usernames} onClose={() => setSelected(null)} />}
    </>
  );
}

/** Statistics → Abstract Beasts: classic visual tiles and glance, then the Abstract Dungeon leaderboards. */
export function AbstractBeastsStats() {
  const { stats, failed } = useAbstractBeastStats();
  const total = stats?.total ?? 0;
  const summaryTiles = [
    { label: "Shiny MIDI Beasts", value: stats?.visuals["Shiny MIDI"], gradient: "from-pink-400/20 via-purple-400/10 to-accent/20", accent: "text-pink-400" },
    { label: "Shiny Beasts", value: stats?.visuals.Shiny, gradient: "from-yellow-400/20 via-amber-400/10 to-orange-400/20", accent: "text-amber-400" },
    { label: "MIDI Beasts", value: stats?.visuals.MIDI, gradient: "from-sky-400/20 via-accent/10 to-teal-400/20", accent: "text-accent" },
    { label: "Standard Beasts", value: stats?.visuals.Regular, gradient: "from-zinc-500/20 via-zinc-700/10 to-zinc-900/20", accent: "text-zinc-300" },
  ];

  return (
    <div className="space-y-6">
      {!failed && (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {summaryTiles.map((tile) => (
            <div
              key={tile.label}
              className={`relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br ${tile.gradient} p-5`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/40" />
              <div className="relative z-10">
                <div className="text-xs uppercase tracking-[0.3em] text-zinc-400">{tile.label}</div>
                <div className={`mt-3 text-3xl font-black tracking-tight ${tile.accent}`}>
                  {tile.value == null ? "—" : tile.value.toLocaleString()}
                </div>
                <div className="mt-2 text-xs text-zinc-500">{tile.value == null ? " " : presetShareLabel(tile.value, total)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <AbstractGlance />
      <AbstractDungeonLeaderboards />
    </div>
  );
}
