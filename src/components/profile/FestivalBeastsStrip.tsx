import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FESTIVAL_COLLECTIONS,
  fetchFestivalTokens,
  ownedFestivalTokenIds,
  splitFestivalName,
  type FestivalCollection,
  type FestivalToken,
} from "../../services/festivalBeasts";

type Owned = { collection: FestivalCollection; token: FestivalToken };

/** The festival beasts (Tiddy Mun, Black Shuck) an address holds. Renders nothing if none. */
export function FestivalBeastsStrip({ owner }: { owner: string | null | undefined }) {
  const [owned, setOwned] = useState<Owned[]>([]);

  useEffect(() => {
    if (!owner) {
      setOwned([]);
      return;
    }
    let alive = true;
    Promise.all(
      FESTIVAL_COLLECTIONS.map(async (collection) => {
        const tokens = await fetchFestivalTokens(collection).catch(() => []);
        const ids = ownedFestivalTokenIds(tokens, owner);
        return tokens.filter((t) => ids.has(t.tokenId)).map((token) => ({ collection, token }));
      }),
    ).then((groups) => alive && setOwned(groups.flat()));
    return () => {
      alive = false;
    };
  }, [owner]);

  if (owned.length === 0) return null;

  return (
    <section className="rounded-xl border border-white/[0.06] bg-surface/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-gold">Festival beasts</h3>
        <Link to="/dungeons" className="text-[10px] text-zinc-500 hover:text-gold">
          All festival beasts →
        </Link>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {owned.map(({ collection, token }) => (
          <Link
            key={`${collection.slug}-${token.tokenId}`}
            to={`/festival/${collection.slug}/${token.tokenId}`}
            className="group w-24 flex-shrink-0 overflow-hidden rounded-lg border border-white/[0.06] bg-black hover:border-white/25"
            title={token.meta?.name ?? collection.name}
          >
            {token.meta?.image ? (
              <img src={token.meta.image} alt="" className="w-full" style={{ imageRendering: "pixelated" }} />
            ) : (
              <div className="aspect-square bg-zinc-900" />
            )}
            <div className="border-t border-white/[0.06] px-1.5 py-1">
              <p className="truncate text-[9px] text-zinc-500">
                {collection.name} #{token.tokenId}
              </p>
              <p className="truncate text-[10px] font-semibold text-zinc-200 group-hover:text-gold">
                {token.meta ? splitFestivalName(token.meta.name).prefix ?? token.meta.name : collection.name}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default FestivalBeastsStrip;
