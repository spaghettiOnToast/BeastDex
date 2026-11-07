import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import { CheckCircle2, ExternalLink, Sword } from "lucide-react";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import { cn } from "../lib/utils";
import { DUNGEONS, LOOT_SURVIVOR_URL, lootSurvivorDungeonUrl, type Dungeon } from "../services/lootSurvivor";
import {
  FESTIVAL_COLLECTIONS,
  fetchFestivalTokens,
  ownedFestivalTokenIds,
  splitFestivalName,
  type FestivalCollection,
  type FestivalToken,
} from "../services/festivalBeasts";

function DungeonCard({ dungeon }: { dungeon: Dungeon }) {
  const closed = dungeon.status === "closed";
  return (
    <a
      href={lootSurvivorDungeonUrl(dungeon.id)}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-surface/60 transition-all hover:-translate-y-0.5 hover:border-white/20"
      style={{ boxShadow: `inset 0 -2px 0 ${dungeon.accentColor}55` }}
      aria-label={`${closed ? "View" : "Play"} ${dungeon.name} on Loot Survivor`}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-black">
        <img
          src={`${LOOT_SURVIVOR_URL}${dungeon.image}`}
          alt=""
          loading="lazy"
          className={cn(
            "h-full w-full object-cover transition-transform duration-300 group-hover:scale-105",
            closed && "grayscale opacity-60",
          )}
        />
        <span
          className={cn(
            "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            closed ? "bg-zinc-800/90 text-zinc-400" : "bg-black/70 text-white",
          )}
        >
          {closed ? "Closed" : (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: dungeon.accentColor }} /> Live
            </span>
          )}
        </span>
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/90 to-transparent pb-2 pt-8 text-xs font-bold uppercase tracking-wider text-white opacity-0 transition-opacity group-hover:opacity-100">
          {closed ? "View on Loot Survivor" : "Play on Loot Survivor"} <ExternalLink className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <h3 className="text-sm font-bold text-white">{dungeon.name}</h3>
          <p className="text-[11px] text-zinc-400">{dungeon.tagline}</p>
        </div>
        <dl className="mt-auto grid grid-cols-3 gap-1.5 text-[10px]">
          {[
            ["Entry", dungeon.entryCost],
            ["Difficulty", dungeon.difficulty],
            ["Reward", dungeon.reward || "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-1">
              <dt className="uppercase tracking-wide text-zinc-500">{label}</dt>
              <dd className="truncate font-semibold text-zinc-200" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </a>
  );
}

function FestivalSection({ collection, owner }: { collection: FestivalCollection; owner: string | undefined }) {
  const [tokens, setTokens] = useState<FestivalToken[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchFestivalTokens(collection)
      .then((t) => alive && setTokens(t))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [collection]);

  const owned = useMemo(() => ownedFestivalTokenIds(tokens ?? [], owner), [tokens, owner]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-white">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: collection.accentColor }} />
            {collection.name}
            {tokens && <span className="text-sm font-normal text-zinc-500">· {tokens.length} collected</span>}
          </h3>
          <p className="text-xs text-zinc-400">{collection.blurb}</p>
        </div>
        {owned.size > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-emerald-600/40 bg-emerald-900/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> You own {owned.size}
          </span>
        )}
      </div>

      {error ? (
        <p className="text-xs text-red-400">Couldn&apos;t load {collection.name} from chain.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {(tokens ?? Array.from({ length: 8 }, () => null)).map((t, i) =>
            t ? (
              <Link
                key={t.tokenId}
                to={`/festival/${collection.slug}/${t.tokenId}`}
                className={cn(
                  "group overflow-hidden rounded-lg border bg-black transition-colors",
                  owned.has(t.tokenId) ? "border-emerald-500/60" : "border-white/[0.06] hover:border-white/25",
                )}
              >
                {t.meta?.image ? (
                  <img
                    src={t.meta.image}
                    alt={t.meta.name}
                    loading="lazy"
                    className="w-full"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : (
                  <div className="aspect-square animate-pulse bg-zinc-900" />
                )}
                <div className="border-t border-white/[0.06] bg-surface/80 px-1.5 py-1">
                  <p className="font-mono text-[9px] text-zinc-500">#{t.tokenId}</p>
                  <p className="truncate text-[10px] font-semibold text-zinc-200 group-hover:text-gold">
                    {t.meta ? splitFestivalName(t.meta.name).prefix ?? t.meta.name : collection.name}
                  </p>
                </div>
              </Link>
            ) : (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.02]" />
            ),
          )}
        </div>
      )}
    </section>
  );
}

function DungeonsPage() {
  const { address } = useAccount();
  const live = DUNGEONS.filter((d) => d.status === "online");
  const closed = DUNGEONS.filter((d) => d.status === "closed");

  return (
    <AppLayout topBar={<TopBar />}>
      <div className="space-y-10">
        <header>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gold/30 bg-gold/10">
              <Sword className="h-5 w-5 text-gold" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gold/80">Loot Survivor</p>
              <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl">Dungeons</h1>
            </div>
          </div>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">
            Enter a dungeon on Loot Survivor to hunt beasts and win rewards. Click a dungeon to play.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Live now</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {live.map((d) => (
              <DungeonCard key={d.id} dungeon={d} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Past events</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {closed.map((d) => (
              <DungeonCard key={d.id} dungeon={d} />
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="h-px bg-gradient-to-r from-gold/30 via-gold/10 to-transparent" />
          <div>
            <h2 className="text-xl font-bold text-white">Festival beasts</h2>
            <p className="text-sm text-zinc-400">
              One-off beasts from Loot Survivor festival dungeons.
              {!address && " Connect your wallet to see which are yours."}
            </p>
          </div>
          {FESTIVAL_COLLECTIONS.map((c) => (
            <FestivalSection key={c.slug} collection={c} owner={address} />
          ))}
        </section>
      </div>
    </AppLayout>
  );
}

export default DungeonsPage;
