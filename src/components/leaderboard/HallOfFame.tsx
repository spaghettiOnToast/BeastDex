import { useMemo, useState } from "react";
import type { Beast } from "../../services/beast";
import { useBeasts } from "../../hooks/useBeasts";
import { useControllerUsernames } from "../../hooks/useControllerUsernames";
import BeastGrid from "../beast/BeastGrid";
import BeastModal from "../beast/BeastModal";

const PAGE_SIZE = 24;

const VIEWS = {
  perfect: {
    label: "Perfect cards",
    blurb: "Grade 10, Shiny MIDI — the rarest cards in the collection.",
    filters: { "Card Grade": ["10", "10"], Visual: ["Shiny MIDI"] },
  },
  champions: {
    label: "Species champions",
    blurb: "The #1 ranked beast of every species.",
    filters: { Rank: ["1"] },
  },
  midi: {
    label: "MIDI beasts",
    blurb: "Beasts whose card plays a MIDI track — drawn with the music-notes background.",
    filters: { MIDI: ["1"] },
  },
} as const;
type View = keyof typeof VIEWS;

/** Statistics → Hall of Fame: perfect cards and each species' #1 beast. */
export function HallOfFame() {
  const [view, setView] = useState<View>("perfect");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Beast | null>(null);

  const attributeFilters = useMemo(
    () => Object.fromEntries(Object.entries(VIEWS[view].filters).map(([k, v]) => [k, [...v]])),
    [view]
  );
  const { beasts, total, loading, error } = useBeasts({ limit: PAGE_SIZE, attributeFilters, page });
  const { usernames } = useControllerUsernames(beasts.map((b) => b.owner), { delayMs: 200 });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-zinc-500">Hall of Fame</div>
          <p className="mt-1 text-sm text-zinc-300">{VIEWS[view].blurb}</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Hall of Fame view">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={v === view}
              onClick={() => {
                setView(v);
                setPage(1); // pages are cursor-chained per query
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                v === view
                  ? "border-[#e2b94c] bg-[#e2b94c]/15 text-[#e2b94c]"
                  : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
              }`}
            >
              {VIEWS[v].label}
              {v === view && total > 0 && <span className="ml-1.5 text-zinc-400">{total.toLocaleString()}</span>}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="py-8 text-center text-sm text-red-400">Failed to load beasts</p>
      ) : (
        <BeastGrid
          beasts={beasts}
          ownerUsernames={usernames}
          onSelect={setSelected}
          loading={loading}
          emptyMessage="No beasts here yet"
        />
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => !loading && setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-zinc-300 hover:bg-white/[0.06] disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => !loading && setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-zinc-300 hover:bg-white/[0.06] disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {selected && <BeastModal beast={selected} ownerUsernames={usernames} onClose={() => setSelected(null)} />}
    </div>
  );
}

export default HallOfFame;
