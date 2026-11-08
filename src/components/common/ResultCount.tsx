type Props = {
  count: number;
  /** Singular noun; an "s" is added for other counts. */
  noun?: string;
  /** Extra figures shown after the count, e.g. "45 species". */
  extra?: string | null;
  /** Active filter labels. */
  filters?: string[];
  loading?: boolean;
  className?: string;
};

/** "87 beasts · 45 species · Shiny · Grade 10": how many results the current filters give. */
export function ResultCount({ count, noun = "beast", extra, filters = [], loading, className = "" }: Props) {
  return (
    <p className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-400 ${className}`} aria-live="polite">
      {loading ? (
        <span className="text-zinc-500">Counting…</span>
      ) : (
        <>
          <span>
            <span className="text-sm font-bold tabular-nums text-white">{count.toLocaleString()}</span> {count === 1 ? noun : `${noun}s`}
          </span>
          {extra && <span className="text-zinc-500">· {extra}</span>}
          {filters.map((f) => (
            <span key={f} className="rounded border border-[#e2b94c]/30 bg-[#e2b94c]/10 px-1.5 py-px text-[11px] text-[#e2b94c]">
              {f}
            </span>
          ))}
        </>
      )}
    </p>
  );
}

export default ResultCount;
