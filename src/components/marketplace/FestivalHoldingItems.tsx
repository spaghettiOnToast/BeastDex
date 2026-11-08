import { lazy, Suspense, useMemo, useState } from "react";
import { festivalCollectionFor, festivalPlaceholderBeast, toFestivalListingToken } from "../../services/festivalBeasts";
import type { Listing } from "../../services/marketplace/types";
import { marketplaceTokenKey } from "../../services/marketplace/constants";
import { useHeldFestivalTokens, type HeldFestivalToken } from "../../hooks/useFestivalTokens";

const ListDialog = lazy(() => import("./ListDialog"));

type Props = {
  address: string | undefined;
  /** active marketplace listings (any collection; used to mark tokens already listed) */
  listings: Listing[];
  onListed?: () => void;
};

/**
 * "My Items" grid cells for the festival tokens you hold, rendered inside the
 * same grid as your Beasts: token art + a Festival badge. Clicking an unlisted
 * token opens List for sale (the multi-beast list cart is Beasts-only).
 * Returns bare grid items (no wrapper), so place it inside the grid element.
 */
export function FestivalHoldingItems({ address, listings, onListed }: Props) {
  const held = useHeldFestivalTokens(address);
  const [listing, setListing] = useState<HeldFestivalToken | null>(null);

  const listedKeys = useMemo(
    () =>
      new Set(
        listings
          .filter((l) => l.active && festivalCollectionFor(l.collection))
          .map((l) => marketplaceTokenKey(l.collection, l.tokenId)),
      ),
    [listings],
  );

  return (
    <>
      {held.map(({ collection, token }) => {
        const isListed = listedKeys.has(marketplaceTokenKey(collection.address, token.tokenId));
        const name = token.meta?.name ?? `${collection.name} #${token.tokenId}`;
        return (
          <div key={`${collection.slug}:${token.tokenId}`} className="relative group">
            <button
              type="button"
              disabled={isListed}
              onClick={() => setListing({ collection, token })}
              title={isListed ? `${name} (listed)` : `List ${name} for sale`}
              className="block w-full overflow-hidden rounded-lg bg-black transition-opacity enabled:hover:opacity-90 disabled:cursor-default"
            >
              {token.meta?.image ? (
                <img src={token.meta.image} alt={name} className="block w-full" style={{ imageRendering: "pixelated" }} />
              ) : (
                <div className="aspect-[4/5] bg-zinc-900" />
              )}
            </button>
            {/* Festival badge (+ Listed, same style as Beast cards) */}
            <div className="pointer-events-none absolute left-1 top-1 flex gap-1">
              <span className="rounded border border-gold/50 bg-black/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold">
                Festival
              </span>
              {isListed && (
                <span className="rounded bg-gold/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">
                  Listed
                </span>
              )}
            </div>
            {!isListed && (
              <span className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded bg-black/80 px-2 py-0.5 text-[10px] font-semibold text-gold opacity-0 transition-opacity group-hover:opacity-100">
                List for sale
              </span>
            )}
          </div>
        );
      })}
      {listing && (
        <Suspense fallback={null}>
          <ListDialog
            open
            onOpenChange={(open) => !open && setListing(null)}
            beast={festivalPlaceholderBeast(toFestivalListingToken(listing.collection, listing.token), address ?? null)}
            collection={listing.collection.address}
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

export default FestivalHoldingItems;
