import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchFestivalTokens,
  festivalCollectionFor,
  getFestivalCollection,
  festivalPlaceholderBeast,
  ownedFestivalTokenIds,
  splitFestivalName,
  toFestivalListingToken,
  type FestivalToken,
} from "../../services/festivalBeasts";
import type { Listing } from "../../services/marketplace/types";

const ListDialog = lazy(() => import("./ListDialog"));

type Props = {
  /** festival collection slug (services/festivalBeasts) */
  slug: string;
  address: string | undefined;
  /** active marketplace listings (any collection; used to mark tokens already listed) */
  listings: Listing[];
  onListed?: () => void;
  /**
   * Section of the combined "My Items" tab: titled, and renders nothing when
   * there's nothing to show (no wallet, loading, or no tokens held).
   */
  asSection?: boolean;
};

/** Marketplace "My Items" for a festival collection: the tokens you hold, with List buttons. */
export function FestivalHoldingsPanel({ slug, address, listings, onListed, asSection = false }: Props) {
  const collection = getFestivalCollection(slug);
  const [tokens, setTokens] = useState<FestivalToken[] | null>(null);
  const [listing, setListing] = useState<FestivalToken | null>(null);

  useEffect(() => {
    if (!collection) return;
    let alive = true;
    setTokens(null);
    fetchFestivalTokens(collection)
      .then((t) => alive && setTokens(t))
      .catch(() => alive && setTokens([]));
    return () => {
      alive = false;
    };
  }, [collection]);

  const owned = useMemo(() => {
    const ids = ownedFestivalTokenIds(tokens ?? [], address);
    return (tokens ?? []).filter((t) => ids.has(t.tokenId));
  }, [tokens, address]);

  const listedIds = useMemo(
    () =>
      new Set(
        listings
          .filter((l) => l.active && collection && festivalCollectionFor(l.collection)?.slug === collection.slug)
          .map((l) => l.tokenId),
      ),
    [listings, collection],
  );

  if (!collection) return null;
  if (asSection && (!address || tokens === null || owned.length === 0)) return null;
  if (!address) {
    return <p className="py-10 text-center text-sm text-zinc-500">Connect your wallet to see your {collection.name}.</p>;
  }
  if (tokens === null) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.03]" />
        ))}
      </div>
    );
  }
  if (owned.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500">
        You don&apos;t hold any {collection.name}.{" "}
        <Link to="/dungeons" className="text-gold hover:underline">
          See the festival beasts
        </Link>
      </p>
    );
  }

  return (
    <>
      {asSection && (
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
          {collection.name}
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9px] tracking-wider text-gold">
            Festival
          </span>
        </h3>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {owned.map((t) => {
          const isListed = listedIds.has(String(t.tokenId));
          return (
            <div key={t.tokenId} className="overflow-hidden rounded-lg border border-white/[0.06] bg-surface/60">
              <Link to={`/festival/${slug}/${t.tokenId}`} className="block bg-black">
                {t.meta?.image ? (
                  <img src={t.meta.image} alt={t.meta.name} className="w-full" style={{ imageRendering: "pixelated" }} />
                ) : (
                  <div className="aspect-square bg-zinc-900" />
                )}
              </Link>
              <div className="space-y-1.5 p-2">
                <p className="truncate text-[11px] font-semibold text-zinc-200">
                  {t.meta ? splitFestivalName(t.meta.name).prefix ?? t.meta.name : collection.name}{" "}
                  <span className="font-mono text-zinc-500">#{t.tokenId}</span>
                </p>
                <button
                  type="button"
                  disabled={isListed}
                  onClick={() => setListing(t)}
                  className="w-full rounded-md border border-gold/40 bg-gold/10 py-1 text-[11px] font-semibold text-gold hover:bg-gold/20 disabled:cursor-default disabled:border-white/10 disabled:bg-transparent disabled:text-zinc-500"
                >
                  {isListed ? "Listed" : "List for sale"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {listing && (
        <Suspense fallback={null}>
          <ListDialog
            open
            onOpenChange={(open) => !open && setListing(null)}
            beast={festivalPlaceholderBeast(toFestivalListingToken(collection, listing), address)}
            collection={collection.address}
            onListed={() => {
              setListing(null);
              onListed?.();
            }}
          />
        </Suspense>
      )}
    </>
  );
}

export default FestivalHoldingsPanel;
