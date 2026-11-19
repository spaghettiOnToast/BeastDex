import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchStakedLootBeasts,
  fetchTakenLootBeasts,
  LOOT_BAG_URL,
  type StakedLootBeast,
  type TakenLootBeast,
} from "../../services/lootDungeon";
import { fetchV3CardImgSrc } from "../../services/beast/cardImage";
import {
  BUYBACK_TOKEN,
  fetchSellQuotes,
  formatEth,
  formatEthUsd,
  type SellQuote,
  type SellQuotes,
} from "../../services/lootBuyback";
import { useSelectedToken } from "../../hooks/useEkuboTokens";
import { fetchBlockTime } from "../../services/beast/tracks";
import type { Beast } from "../../services/beast";
import { getAttributeValue } from "../../utils/beast";

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The species rank BeastDex shows (0 = unranked, e.g. not indexed yet). */
function beastRank(beast: Beast): number {
  const n = Number(getAttributeValue(beast, "Rank") ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function useCardSrc(beast: Beast): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchV3CardImgSrc({
      tokenId: beast.tokenId,
      speciesName: String(getAttributeValue(beast, "Beast") ?? beast.name),
      prefixName: getAttributeValue(beast, "Prefix") as string | undefined,
      suffixName: getAttributeValue(beast, "Suffix") as string | undefined,
      rank: beastRank(beast),
    })
      .then((s) => alive && setSrc(s))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [beast]);
  return src;
}

function timeLeft(transformsAt: number, nowMs: number): string | null {
  const secs = transformsAt - Math.floor(nowMs / 1000);
  if (secs <= 0) return null;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${Math.max(m, 1)}m`;
}

function QuoteLine({ label, quote, ethUsd }: { label: string; quote: SellQuote | null | undefined; ethUsd?: number | null }) {
  if (!quote) return null;
  const usd = formatEthUsd(quote.amount, ethUsd);
  return (
    <p
      className={`flex justify-between gap-1 text-[10px] tabular-nums ${quote.liquid ? "text-sky-300" : "text-zinc-500 line-through"}`}
      title={
        quote.liquid
          ? `Tier ${quote.tier} ${label === "Mega" ? "Mega " : ""}buyback pool pays ${formatEth(quote.amount)} ETH${usd ? ` (${usd})` : ""} right now`
          : "The buyback pool doesn't hold enough ETH to pay this right now"
      }
    >
      <span className="truncate">
        {label} {formatEth(quote.amount)} ETH
      </span>
      {usd && <span className="shrink-0 text-zinc-400">{usd}</span>}
    </p>
  );
}

function StakedCard({
  item,
  nowMs,
  quotes,
  ethUsd,
}: {
  item: StakedLootBeast;
  nowMs: number;
  quotes?: SellQuotes;
  ethUsd?: number | null;
}) {
  const { beast } = item;
  const src = useCardSrc(beast);
  const rank = beastRank(beast);

  const left = timeLeft(item.transformsAt, nowMs);
  const when = new Date(item.transformsAt * 1000).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Link
      to={`/beasts/${beast.tokenId}`}
      className="group w-36 flex-shrink-0 overflow-hidden rounded-lg border border-white/[0.06] bg-black hover:border-gold/40"
      title={`${beast.name}${rank ? ` (rank #${rank})` : ""} — ${left ? `transforms ${when}` : "ready to transform"}`}
    >
      {src ? <img src={src} alt={beast.name} className="w-full" /> : <div className="aspect-[5/7] bg-zinc-900" />}
      <div className="border-t border-white/[0.06] px-1.5 py-1">
        <p className="truncate text-[10px] font-semibold text-zinc-200 group-hover:text-gold">{beast.name}</p>
        <p className="text-[10px] font-bold text-gold/90">{rank ? `Rank #${rank}` : "Unranked"}</p>
        <p className={`truncate text-[10px] ${left ? "text-zinc-400" : "font-bold text-emerald-400"}`}>
          {left ? `Mega in ${left}` : "Ready to transform"}
        </p>
        <QuoteLine label="Sell" quote={quotes?.beast} ethUsd={ethUsd} />
        <QuoteLine label="Mega" quote={quotes?.mega} ethUsd={ethUsd} />
      </div>
    </Link>
  );
}

/**
 * A beast another player's Loot Dungeon claim took from the owner: the token
 * was burned (with any Mega progress) and the killer minted a new copy. Card
 * under the Loot Survivor skull; it links to the killer's copy.
 */
function TakenCard({ item }: { item: TakenLootBeast }) {
  const { beast } = item;
  const src = useCardSrc(beast);
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetchBlockTime(item.block).then((t) => alive && setAt(t));
    return () => {
      alive = false;
    };
  }, [item.block]);
  const when = at
    ? new Date(at * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div
      className="w-36 flex-shrink-0 overflow-hidden rounded-lg border border-red-500/30 bg-black"
      title={`${beast.name} was killed${when ? ` on ${when}` : ""} and burned, losing any Mega progress. ${item.takenBy} got a new copy.`}
    >
      <Link to={`/beasts/${item.newTokenId}`} className="relative block" aria-label={`The killer's copy of ${beast.name}`}>
        {src ? (
          <img src={src} alt={beast.name} className="w-full opacity-40 grayscale" />
        ) : (
          <div className="aspect-[5/7] bg-zinc-900" />
        )}
        <img
          src="/ls-skull.png"
          alt="Lost"
          className="pointer-events-none absolute left-1/2 top-1/2 w-14 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_8px_rgba(0,0,0,0.9)]"
          style={{ imageRendering: "pixelated" }}
        />
      </Link>
      <div className="border-t border-white/[0.06] px-1.5 py-1">
        <p className="truncate text-[10px] font-semibold text-zinc-400 line-through">{beast.name}</p>
        <p className="truncate text-[10px] text-red-400">
          Killed by{" "}
          <Link to={`/collection/${item.takenBy}`} className="underline hover:text-gold">
            {shortAddr(item.takenBy)}
          </Link>
        </p>
      </div>
    </div>
  );
}

/**
 * Loot Bag activity for an owner: beasts staked for their Mega transform
 * (escrowed in the Loot Dungeon contract, so missing from the wallet holdings)
 * and beasts other players' Loot Dungeon claims took from them. Read on chain;
 * renders nothing if there's neither.
 */
export function LootBagStakesStrip({ owner }: { owner: string | null | undefined }) {
  const [items, setItems] = useState<StakedLootBeast[]>([]);
  const [taken, setTaken] = useState<TakenLootBeast[]>([]);
  const [quotes, setQuotes] = useState<Map<string, SellQuotes>>(new Map());
  const { usdPrice: ethUsd } = useSelectedToken(BUYBACK_TOKEN.address);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setItems([]);
    setTaken([]);
    if (!owner) return;
    let alive = true;
    fetchStakedLootBeasts(owner)
      .then((list) => alive && setItems(list))
      .catch((err) => console.warn("[loot bag] stakes unavailable:", err));
    fetchTakenLootBeasts(owner)
      .then((list) => alive && setTaken(list))
      .catch((err) => console.warn("[loot bag] taken beasts unavailable:", err));
    return () => {
      alive = false;
    };
  }, [owner]);

  // A taken beast no longer belongs to this owner's stakes.
  const takenIds = new Set(taken.map((t) => t.tokenId));
  const staked = items.filter((i) => !takenIds.has(i.tokenId));

  // Buyback prices move continuously (GDA), so refresh them with the countdown.
  useEffect(() => {
    if (items.length === 0) return;
    let alive = true;
    const load = () =>
      fetchSellQuotes(items.map((i) => i.tokenId))
        .then((q) => alive && setQuotes(q))
        .catch((err) => console.warn("[loot bag] buyback prices unavailable:", err));
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [items]);

  useEffect(() => {
    if (items.length === 0) return;
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [items.length]);

  if (staked.length === 0 && taken.length === 0) return null;

  return (
    <section className="rounded-xl border border-white/[0.06] bg-surface/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-gold">
          {staked.length > 0 ? "Transforming in the Loot Bag" : "Loot Bag"}
          {staked.length > 0 && <span className="text-zinc-500"> · {staked.length}</span>}
          {taken.length > 0 && <span className="text-red-400"> · {taken.length} lost</span>}
        </h3>
        <a href={LOOT_BAG_URL} target="_blank" rel="noreferrer" className="text-[10px] text-zinc-500 hover:text-gold">
          Open Loot Bag →
        </a>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {staked.map((item) => (
          <StakedCard key={item.tokenId} item={item} nowMs={nowMs} quotes={quotes.get(item.tokenId)} ethUsd={ethUsd} />
        ))}
        {taken.map((item) => (
          <TakenCard key={`${item.txHash}:${item.tokenId}`} item={item} />
        ))}
      </div>
    </section>
  );
}

export default LootBagStakesStrip;
