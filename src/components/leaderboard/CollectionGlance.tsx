import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchCardGradeCounts,
  fetchCollectionGlance,
  type Beast,
  type CollectionGlance as Glance,
} from "../../services/beast";
import { useControllerUsernames } from "../../hooks/useControllerUsernames";
import { normaliseStarknetAddress } from "../../utils/address";
import BeastModal from "../beast/BeastModal";

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

/** "Collection at a glance": fun collection-wide figures across all players. */
export function CollectionGlance() {
  const [glance, setGlance] = useState<Glance | null>(null);
  const [grade10, setGrade10] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Beast | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCollectionGlance()
      .then((g) => !cancelled && setGlance(g))
      .catch(() => !cancelled && setFailed(true));
    fetchCardGradeCounts()
      .then((c) => !cancelled && setGrade10(c[10] ?? 0))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const strongest = glance?.strongest ?? null;
  const { usernames } = useControllerUsernames([strongest?.owner]);
  const ownerKey = normaliseStarknetAddress(strongest?.owner);
  const ownerName = ownerKey ? usernames[ownerKey] : undefined;

  if (failed) return null;
  const v = (n: number | undefined | null) => (n == null ? "…" : n.toLocaleString());
  const total = glance?.totalBeasts ?? 0;

  const tiles = [
    {
      label: "Holders",
      value: v(glance?.holders),
      sub: glance && glance.holders > 0 ? `~${Math.round(total / glance.holders)} beasts each` : "",
      accent: "text-white",
    },
    {
      label: "Perfect cards",
      value: v(glance?.perfectCards),
      sub: "Grade 10 · Animated Shiny",
      accent: "text-pink-400",
    },
    {
      label: "Grade 10",
      value: grade10 == null || !glance ? "…" : pct(grade10, total),
      sub: grade10 == null ? "" : `${grade10.toLocaleString()} mint-condition cards`,
      accent: "text-[#e2b94c]",
    },
    {
      label: "Music beasts",
      value: v(glance?.midi),
      sub: glance ? `${pct(glance.midi, total)} have a MIDI track` : "",
      accent: "text-sky-300",
    },
    {
      label: "Most common name",
      value: glance?.topName ? `“${glance.topName.label}”` : "…",
      sub: glance?.topName ? `×${glance.topName.count.toLocaleString()}` : "",
      accent: "text-purple-300",
      small: true,
    },
    {
      label: "Most common prefix",
      value: glance?.topPrefix?.label ?? "…",
      sub: glance?.topPrefix ? `on ${glance.topPrefix.count.toLocaleString()} beasts` : "",
      accent: "text-emerald-300",
      small: true,
    },
    {
      label: "Shiny odds",
      value: glance && glance.shiny > 0 ? `1 in ${Math.round(total / glance.shiny)}` : "…",
      sub: glance ? `${glance.shiny.toLocaleString()} shiny beasts` : "",
      accent: "text-amber-300",
    },
    {
      label: "Awaiting a rank",
      value: v(glance?.unranked),
      sub: glance ? `incl. ${glance.genesis} Genesis beasts` : "",
      accent: "text-zinc-300",
    },
  ];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface-raised p-4">
      <div className="mb-3 text-xs uppercase tracking-[0.35em] text-zinc-500">Collection at a glance</div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
        {/* Strongest beast */}
        <button
          type="button"
          disabled={!strongest}
          onClick={() => strongest && setSelected(strongest)}
          className="flex items-center gap-3 rounded-lg border border-[#e2b94c]/25 bg-gradient-to-br from-[#e2b94c]/10 to-transparent p-3 text-left transition-colors enabled:hover:border-[#e2b94c]/50"
        >
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black">
            {strongest?.image ? (
              <img src={strongest.image} alt="" className="h-14 w-14 object-contain" style={{ imageRendering: "pixelated" }} />
            ) : (
              <span className="text-zinc-700">?</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Strongest beast</p>
            <p className="truncate text-base font-bold text-white">{strongest?.name ?? "…"}</p>
            <p className="text-xs text-[#e2b94c]">⚡ {strongest?.power?.toLocaleString() ?? "…"} power</p>
            {strongest?.owner && (
              <p className="truncate text-[11px] text-zinc-500">
                Owned by{" "}
                <Link
                  to={`/account/${strongest.owner}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-zinc-300 hover:text-white hover:underline"
                >
                  {ownerName ?? `${strongest.owner.slice(0, 6)}…${strongest.owner.slice(-4)}`}
                </Link>
              </p>
            )}
          </div>
        </button>

        {/* Figures */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="min-w-0 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{t.label}</p>
              <p className={`mt-1 truncate font-bold leading-tight ${t.accent} ${t.small ? "text-sm" : "text-xl"}`} title={t.value}>
                {t.value}
              </p>
              {t.sub && <p className="mt-0.5 truncate text-[11px] text-zinc-500">{t.sub}</p>}
            </div>
          ))}
        </div>
      </div>
      {selected && <BeastModal beast={selected} ownerUsernames={usernames} onClose={() => setSelected(null)} />}
    </div>
  );
}

export default CollectionGlance;
