/** Items per page in every Tracks page list. */
export const PAGE_SIZE = 15;

/** Prev / page x of y / Next. */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  const btn =
    "rounded-md border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-300 transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:text-zinc-300";
  return (
    <div className="flex items-center justify-center gap-3 pt-1">
      <button type="button" className={btn} disabled={page <= 0} onClick={() => onPage(page - 1)}>
        Prev
      </button>
      <span className="text-xs text-zinc-500">
        Page {page + 1} of {pages}
      </span>
      <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
