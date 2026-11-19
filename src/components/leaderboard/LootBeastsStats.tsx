import { useEffect, useState } from "react";
import type { Beast } from "../../services/beast";
import { fetchLootBeastStats, type LootBeastStats } from "../../services/lootBeastStats";
import { presetShareLabel } from "../../services/beast/helpers";
import { useControllerUsernames } from "../../hooks/useControllerUsernames";
import { normaliseStarknetAddress } from "../../utils/address";
import BeastModal from "../beast/BeastModal";
import { GlanceTiles, StrongestBeastCard, type GlanceTile } from "./CollectionGlance";
import { LootBagLeaderboards } from "./LootBagLeaderboards";

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

function useLootBeastStats() {
  const [stats, setStats] = useState<LootBeastStats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchLootBeastStats()
      .then((s) => !cancelled && setStats(s))
      .catch((err) => {
        console.error("Failed to load Loot beast stats:", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { stats, failed };
}

/** "Loot Beasts at a glance": strongest beast, holders (stakers included), Loot Bag and Mega figures. */
export function LootGlance() {
  const { stats, failed } = useLootBeastStats();
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
      label: "In the Loot Bag",
      value: v(stats?.staked),
      sub: stats ? `${pct(stats.staked, total)} staked for Mega` : "",
      accent: "text-[#7dfbff]",
    },
    {
      label: "Megas ready",
      value: v(stats?.megaReady),
      sub: stats ? "staked beasts past their transform time" : "",
      accent: "text-[#ff7cf7]",
    },
    {
      label: "Next Mega",
      value: stats ? (stats.nextMegaAt ? new Date(stats.nextMegaAt * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—") : "…",
      sub: stats?.nextMegaAt
        ? new Date(stats.nextMegaAt * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
        : "",
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
          Loot Beasts at a glance
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
            ownerLabel={stats?.strongestStaked ? "Staked by" : "Owned by"}
            onSelect={setSelected}
          />
          <GlanceTiles tiles={tiles} />
        </div>
      </div>
      {selected && <BeastModal beast={selected} ownerUsernames={usernames} onClose={() => setSelected(null)} />}
    </>
  );
}

/** Statistics → Loot Beasts: Loot visual tiles and glance, then the Loot Bag leaderboards. */
export function LootBeastsStats() {
  const { stats, failed } = useLootBeastStats();
  const total = stats?.total ?? 0;
  // Loot shinies only come from Mega transforms (presets 2/3): one "Mega" tile.
  const mega = stats ? stats.visuals.Shiny + stats.visuals["Shiny MIDI"] : undefined;
  const summaryTiles = [
    { label: "Mega Beasts", value: mega, gradient: "from-pink-400/20 via-amber-400/10 to-orange-400/20", accent: "text-pink-400" },
    { label: "MIDI Beasts", value: stats?.visuals.MIDI, gradient: "from-sky-400/20 via-accent/10 to-teal-400/20", accent: "text-accent" },
    { label: "Standard Beasts", value: stats?.visuals.Regular, gradient: "from-zinc-500/20 via-zinc-700/10 to-zinc-900/20", accent: "text-zinc-300" },
  ];

  return (
    <div className="space-y-6">
      {!failed && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {summaryTiles.map((tile) => (
            <div
              key={tile.label}
              className={`relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br ${tile.gradient} p-5 first:col-span-2 sm:first:col-span-1`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/40" />
              <div className="relative z-10">
                <div className="text-xs uppercase tracking-[0.3em] text-zinc-400">{tile.label}</div>
                <div className={`mt-3 text-3xl font-black tracking-tight ${tile.accent}`}>
                  {tile.value == null ? "—" : tile.value.toLocaleString()}
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  {tile.value == null
                    ? " "
                    : tile.value === 0 && tile.label === "Mega Beasts"
                      ? "Stake a beast to reach Mega form"
                      : presetShareLabel(tile.value, total)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <LootGlance />
      <LootBagLeaderboards />
    </div>
  );
}
