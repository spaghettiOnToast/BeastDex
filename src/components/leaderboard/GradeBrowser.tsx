import { useEffect, useMemo, useState } from "react";
import type { Beast } from "../../services/beast";
import { fetchCardGradeCounts, STAT_CARD_GRADES } from "../../services/beast";
import { useBeasts } from "../../hooks/useBeasts";
import { useControllerUsernames } from "../../hooks/useControllerUsernames";
import BeastGrid from "../beast/BeastGrid";
import BeastModal from "../beast/BeastModal";

const PAGE_SIZE = 24;

/**
 * Statistics: one button per card grade (0 = ungraded) with its beast count;
 * pick a grade to browse those beasts (strongest first).
 */
export function GradeBrowser() {
  const [counts, setCounts] = useState<Record<number, number> | null>(null);
  const [grade, setGrade] = useState<number>(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Beast | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCardGradeCounts()
      .then((c) => !cancelled && setCounts(c))
      .catch(() => !cancelled && setCounts({}));
    return () => {
      cancelled = true;
    };
  }, []);

  // [g, g] = exactly grade g (see _mapAttributeFilters)
  const attributeFilters = useMemo(() => ({ "Card Grade": [String(grade), String(grade)] }), [grade]);
  const { beasts, total, loading, error } = useBeasts({ limit: PAGE_SIZE, attributeFilters, page });
  const { usernames } = useControllerUsernames(
    beasts.map((b) => b.owner),
    { delayMs: 200 }
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pick = (g: number) => {
    setGrade(g);
    setPage(1); // pages are cursor-chained per query: always start at 1
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface-raised p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-xs uppercase tracking-[0.35em] text-zinc-500">Beasts by Card Grade</div>
        {counts && (
          <div className="text-xs text-zinc-500">
            Grade {grade}: <span className="font-semibold text-zinc-300">{(counts[grade] ?? 0).toLocaleString()}</span> beasts
          </div>
        )}
      </div>

      {/* Grade buttons, 0 (ungraded) to 10 */}
      <div className="mb-4 grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-11" role="tablist" aria-label="Card grade">
        {STAT_CARD_GRADES.map((g) => {
          const count = counts?.[g];
          const active = g === grade;
          const empty = counts != null && !count;
          return (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={empty}
              onClick={() => pick(g)}
              title={g === 0 ? "Ungraded" : `Card Grade ${g}`}
              className={`flex flex-col items-center rounded-lg border px-2 py-1.5 transition-colors disabled:cursor-default disabled:opacity-40 ${
                active
                  ? g === 10
                    ? "border-[#e2b94c] bg-[#e2b94c]/15 text-[#e2b94c]"
                    : "border-white/30 bg-white/[0.08] text-white"
                  : "border-white/[0.08] bg-white/[0.03] text-zinc-300 enabled:hover:border-white/20 enabled:hover:bg-white/[0.06]"
              }`}
            >
              <span className="text-sm font-bold">{g === 0 ? "G0" : `G${g}`}</span>
              <span className="text-[10px] text-zinc-500">{count == null ? "…" : count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="py-8 text-center text-sm text-red-400">Failed to load beasts</p>
      ) : (
        <BeastGrid
          beasts={beasts}
          ownerUsernames={usernames}
          onSelect={setSelected}
          loading={loading}
          emptyMessage={`No grade ${grade} beasts`}
        />
      )}

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => !loading && setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-zinc-300 hover:bg-white/[0.06] disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-zinc-500">
            Page {page} of {totalPages.toLocaleString()}
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

export default GradeBrowser;
