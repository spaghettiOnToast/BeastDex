import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { fetchIndexerStatus, type IndexerStatus } from "../../services/marketplace/safety";

const REFRESH_MS = 60_000;

/** Warns when the order-book indexer is behind the chain (listings/offers may be stale). */
export function IndexerStatusBanner() {
  const [status, setStatus] = useState<IndexerStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => fetchIndexerStatus().then((s) => alive && setStatus(s));
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!status?.stale) return null;
  const since = status.lastIndexedAt ? new Date(status.lastIndexedAt * 1000).toLocaleString() : null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
      <p>
        Marketplace data is behind the chain by {status.behind.toLocaleString()} blocks
        {since ? ` (last synced ${since})` : ""}. New listings, sales and offers may not show yet; transactions still
        settle on-chain.
      </p>
    </div>
  );
}

export default IndexerStatusBanner;
