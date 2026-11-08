/**
 * Adventurers market: Loot Survivor games (v2 game core NFTs) on the same
 * Arcade marketplace as Beasts. Listings, my games (list / send / offers
 * received), my offers, recent sales.
 *
 * A listed game stays playable by its seller, so trading follows the rules in
 * services/adventurers/rules: list only when unplayed or idle 5 min, buy only
 * if the game hasn't moved since listing, accept an offer only if it hasn't
 * moved since the offer. Live state is re-read before every trade.
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useAccount } from "@starknet-react/core";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, HandCoins, Loader2, RefreshCw, Send, Tag, X } from "lucide-react";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import { IndexerStatusBanner } from "../components/marketplace/IndexerStatusBanner";
import { MarketSwitch } from "../components/marketplace/MarketSwitch";
import ListDialog from "../components/marketplace/ListDialog";
import MakeOfferDialog from "../components/marketplace/MakeOfferDialog";
import PurchaseConfirmDialog from "../components/marketplace/PurchaseConfirmDialog";
import TokenIcon from "../components/ui/TokenIcon";
import { Button } from "../components/ui/button";
import { AdventurerCard, GameStatusBadge } from "../components/adventurers/AdventurerCard";
import { GameOffersDialog } from "../components/adventurers/GameOffersDialog";
import { SendGamesDialog } from "../components/adventurers/SendGamesDialog";
import { useAdventurerListings, useMyGames, type AdventurerListing } from "../hooks/useAdventurerGames";
import {
  useArcadeSalesForCollection,
  useOffersReceivedForListings,
  useUserOffers,
  type ArcadeOrderModelCompat,
} from "../hooks/useArcadeOrders";
import { useMarketplaceActions } from "./marketplace/hooks/useMarketplaceActions";
import { useTermsOfService } from "../contexts/TermsOfServiceContext";
import { cn } from "../lib/utils";
import { compareStarknetAddresses } from "../utils/address";
import { formatPrice } from "../utils/price";
import { isUserRejection } from "../utils/transaction";
import { getPaymentTokenByAddress, CLIENT_FEE_BP, marketplaceTokenKey } from "../services/marketplace/constants";
import type { OrderModel } from "../services/marketplace/arcadeTypes";
import type { Beast } from "../services/beast";
import { formatAgo } from "../services/adventurers/format";
import {
  ADVENTURER_ROYALTY_BP,
  GAME_CORE_ADDRESS,
  GAME_DUNGEONS,
  IDLE_SECONDS,
  acceptOfferBlocker,
  buyBlocker,
  fetchGame,
  gameDungeonFor,
  gameStatus,
  gameTradeBlocker,
  listBlocker,
  lootSurvivorPlayUrl,
  playedSince,
  type AdventurerGame,
  type GameStatus,
} from "../services/adventurers";

type Tab = "browse" | "mine" | "offers" | "sold";
type Sort = "recent" | "price-asc" | "price-desc" | "level-desc" | "level-asc" | "health-desc" | "gold-desc" | "idle-desc" | "minted-desc";
type MineFilter = "all" | "listed" | "offers" | GameStatus | "soulbound";

const SORTS: Array<[Sort, string]> = [
  ["recent", "Recently listed"],
  ["price-asc", "Price: low to high"],
  ["price-desc", "Price: high to low"],
  ["level-desc", "Level: high to low"],
  ["level-asc", "Level: low to high"],
  ["health-desc", "Health: high to low"],
  ["gold-desc", "Gold: high to low"],
  ["idle-desc", "Longest idle"],
  ["minted-desc", "Newest game"],
];
const LEVELS = [0, 5, 10, 15, 20, 30];

const symbolFor = (currency?: string | null) => getPaymentTokenByAddress(currency ?? undefined)?.symbol ?? "STRK";
const priceLabel = (l: { price: string; paymentToken?: string | null }) => {
  const symbol = symbolFor(l.paymentToken);
  return `${formatPrice(l.price, symbol)} ${symbol}`;
};
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const cmpBig = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);

function decodeMinter(tokenId: string): number {
  try {
    return Number((BigInt(tokenId) >> 168n) & 0xffffffn);
  } catch {
    return 0;
  }
}

/** The Beast-shaped target ListDialog / MakeOfferDialog expect (they only read id + name). */
function gameTarget(tokenId: string, game: AdventurerGame | null): Beast {
  const d = gameDungeonFor(game?.minterId ?? decodeMinter(tokenId));
  return {
    id: `game:0x${BigInt(tokenId).toString(16)}`,
    tokenId,
    name: `${d.name} · Lv ${game?.level ?? "?"} (#${BigInt(tokenId).toString(16).slice(-6)})`,
    image: "",
    owner: game?.owner ?? null,
    attributes: [],
    metadata: { attributes: [] },
    power: null,
  };
}

/** What changed between two reads of a game, in words (empty = nothing). */
function describeChange(before: AdventurerGame | null, after: AdventurerGame): string[] {
  if (!before) return [];
  const out: string[] = [];
  if (after.actionCount !== before.actionCount) out.push(`${after.actionCount - before.actionCount} new action(s)`);
  if (after.health !== before.health) out.push(`health ${before.health} → ${after.health}`);
  if (after.level !== before.level) out.push(`level ${before.level} → ${after.level}`);
  if (after.gold !== before.gold) out.push(`gold ${before.gold} → ${after.gold}`);
  if (after.gameOver && !before.gameOver) out.push("the adventurer died");
  return out;
}

/** Why no one can buy a listing (dead / expired / stuck / soulbound / moved since listing), or null. */
function unavailableReason(l: AdventurerListing): string | null {
  if (!l.game) return null; // still loading: keep visible
  if (l.game.decoded.soulbound) return "soulbound";
  if (gameTradeBlocker(l.game)) return gameStatus(l.game);
  if (playedSince(l.game, l.createdAt)) return "played";
  return null;
}

/** Counts per status, plus soulbound. */
function tally(games: Array<AdventurerGame | null>) {
  const t = { unplayed: 0, "in-progress": 0, dead: 0, expired: 0, stuck: 0, soulbound: 0 } as Record<GameStatus | "soulbound", number>;
  for (const g of games) {
    if (!g) continue;
    t[gameStatus(g)] += 1;
    if (g.decoded.soulbound) t.soulbound += 1;
  }
  return t;
}

export default function AdventurerMarketplace() {
  const { address, account } = useAccount();
  const { hasAcceptedToS, openToSDialog } = useTermsOfService();
  const [tab, setTab] = useState<Tab>("browse");

  const market = useAdventurerListings();
  const myGames = useMyGames(address);
  const sales = useArcadeSalesForCollection(GAME_CORE_ADDRESS, 50);

  const myTokenKeys = useMemo(
    () => (myGames.data ?? []).map((g) => marketplaceTokenKey(GAME_CORE_ADDRESS, g.tokenId)),
    [myGames.data],
  );
  const offersReceived = useOffersReceivedForListings(GAME_CORE_ADDRESS, myTokenKeys, !!address);
  const myOffers = useUserOffers(address, GAME_CORE_ADDRESS);

  const actions = useMarketplaceActions({
    account,
    refetchOrders: market.refetchOrders,
    reloadUserBeasts: async () => {
      await myGames.refetch();
    },
    invalidateSales: sales.invalidateAndRefetch,
    markListingAsSold: market.markListingAsSold,
  });

  const requireToS = useCallback(
    (fn: () => void) => {
      if (!hasAcceptedToS) {
        toast.error("Please accept the Terms of Service to use the marketplace", {
          action: { label: "View Terms", onClick: openToSDialog },
        });
        return;
      }
      fn();
    },
    [hasAcceptedToS, openToSDialog],
  );

  // ================================================================ listings
  const [dungeonFilter, setDungeonFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "unplayed" | "in-progress">("all");
  const [minLevel, setMinLevel] = useState(0);
  const [buyableOnly, setBuyableOnly] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [sort, setSort] = useState<Sort>("recent");

  const activeListings = useMemo(() => market.listings.filter((l) => l.active), [market.listings]);

  const hiddenCounts = useMemo(() => {
    const c = { dead: 0, expired: 0, stuck: 0, soulbound: 0, played: 0 } as Record<string, number>;
    for (const l of activeListings) {
      const r = unavailableReason(l);
      if (r) c[r] = (c[r] ?? 0) + 1;
    }
    return c;
  }, [activeListings]);

  const listingTally = useMemo(() => tally(activeListings.map((l) => l.game)), [activeListings]);

  const browseListings = useMemo(() => {
    const filtered = activeListings.filter((l) => {
      if (!showUnavailable && unavailableReason(l)) return false;
      if (dungeonFilter !== "all" && (l.game?.minterId ?? decodeMinter(l.tokenId)) !== dungeonFilter) return false;
      if (statusFilter !== "all" && (!l.game || gameStatus(l.game) !== statusFilter)) return false;
      if (minLevel > 0 && (l.game?.level ?? 0) < minLevel) return false;
      if (buyableOnly && buyBlocker(l.game, l.createdAt)) return false;
      return true;
    });
    const idleSince = (l: AdventurerListing) => (l.game?.started ? (l.game.lastActionAt ?? Infinity) : (l.game?.decoded.mintedAt ?? Infinity));
    return filtered.sort((a, b) => {
      switch (sort) {
        case "price-asc":
          return cmpBig(BigInt(a.price), BigInt(b.price));
        case "price-desc":
          return cmpBig(BigInt(b.price), BigInt(a.price));
        case "level-desc":
          return (b.game?.level ?? 0) - (a.game?.level ?? 0);
        case "level-asc":
          return (a.game?.level ?? 0) - (b.game?.level ?? 0);
        case "health-desc":
          return (b.game?.health ?? 0) - (a.game?.health ?? 0);
        case "gold-desc":
          return (b.game?.gold ?? 0) - (a.game?.gold ?? 0);
        case "idle-desc":
          return idleSince(a) - idleSince(b);
        case "minted-desc":
          return (b.game?.decoded.mintedAt ?? 0) - (a.game?.decoded.mintedAt ?? 0);
        default:
          return (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.orderId - a.orderId;
      }
    });
  }, [activeListings, dungeonFilter, statusFilter, minLevel, buyableOnly, showUnavailable, sort]);

  const dungeonCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const l of activeListings) {
      const m = l.game?.minterId ?? decodeMinter(l.tokenId);
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    return counts;
  }, [activeListings]);

  // ---------------------------------------------------------------- buying
  const [buying, setBuying] = useState<{ listing: AdventurerListing; fresh: AdventurerGame | null; changes: string[] } | null>(
    null,
  );
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const openBuy = (listing: AdventurerListing) =>
    requireToS(async () => {
      if (!address) return toast.error("Connect your wallet first");
      setCheckingId(listing.listingId);
      try {
        const fresh = await fetchGame(listing.tokenId);
        setBuying({ listing, fresh, changes: fresh ? describeChange(listing.game, fresh) : [] });
      } catch {
        toast.error("Couldn't read the game's current state. Try again in a moment.");
      } finally {
        setCheckingId(null);
      }
    });

  const purchaseBlocker = (b: NonNullable<typeof buying>): string | null => {
    if (b.fresh?.owner && !compareStarknetAddresses(b.fresh.owner, b.listing.seller)) return "The seller no longer owns this game.";
    return buyBlocker(b.fresh, b.listing.createdAt);
  };

  const confirmBuy = async () => {
    if (!buying?.fresh) return;
    // Last look right before signing: the seller may have kept playing
    const latest = await fetchGame(buying.listing.tokenId).catch(() => null);
    if (!latest) return toast.error("Couldn't re-check the game. Try again.");
    const changes = describeChange(buying.fresh, latest);
    if (changes.length > 0 || buyBlocker(latest, buying.listing.createdAt)) {
      setBuying({ ...buying, fresh: latest, changes });
      toast.warning("The game changed while you were reviewing it.");
      return;
    }
    const listing = buying.listing;
    setBuying(null);
    await actions.handlePurchase(listing);
    void myGames.refetch();
  };

  // ---------------------------------------------------------------- offers (making)
  const [offerTarget, setOfferTarget] = useState<{ tokenId: string; game: AdventurerGame | null } | null>(null);

  // ================================================================ my games
  const [mineFilter, setMineFilter] = useState<MineFilter>("all");
  const [mineSort, setMineSort] = useState<"newest" | "level" | "last-action">("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [listTarget, setListTarget] = useState<AdventurerGame | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [offersFor, setOffersFor] = useState<AdventurerGame | null>(null);

  const myListingByToken = useMemo(() => {
    const m = new Map<string, AdventurerListing>();
    if (!address) return m;
    for (const l of activeListings) if (compareStarknetAddresses(l.seller, address)) m.set(l.tokenId, l);
    return m;
  }, [activeListings, address]);

  const offersByToken = useMemo(() => {
    const m = new Map<string, ArcadeOrderModelCompat[]>();
    for (const o of offersReceived.data ?? []) {
      const id = BigInt(o.tokenId).toString();
      m.set(id, [...(m.get(id) ?? []), o]);
    }
    return m;
  }, [offersReceived.data]);

  const allMine = useMemo(() => myGames.data ?? [], [myGames.data]);
  const mineTally = useMemo(() => tally(allMine), [allMine]);
  const visibleMyGames = useMemo(() => {
    const keep = (g: AdventurerGame) => {
      switch (mineFilter) {
        case "all":
          return true;
        case "listed":
          return myListingByToken.has(g.tokenId);
        case "offers":
          return offersByToken.has(g.tokenId);
        case "soulbound":
          return g.decoded.soulbound;
        default:
          return gameStatus(g) === mineFilter;
      }
    };
    return allMine.filter(keep).sort((a, b) => {
      if (mineSort === "level") return b.level - a.level;
      if (mineSort === "last-action") return (b.lastActionAt ?? b.decoded.mintedAt) - (a.lastActionAt ?? a.decoded.mintedAt);
      return b.decoded.mintedAt - a.decoded.mintedAt;
    });
  }, [allMine, mineFilter, mineSort, myListingByToken, offersByToken]);

  const selectedGames = useMemo(() => allMine.filter((g) => selected.has(g.tokenId)), [allMine, selected]);
  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const cancelOrder = async (order: { listingId: string; orderId: number; tokenId: string }, label: string) => {
    if (!account) return;
    setCancellingId(order.listingId);
    const toastId = toast.loading(`Cancelling ${label}…`);
    try {
      await actions.cancel(account, BigInt(order.orderId), GAME_CORE_ADDRESS, BigInt(order.tokenId));
      toast.success(`${label[0].toUpperCase()}${label.slice(1)} cancelled`, { id: toastId });
      market.markListingAsSold(order.listingId);
      void market.refetchOrders();
      void myOffers.refetch();
    } catch (e) {
      if (isUserRejection(e)) toast.info("Cancel aborted", { id: toastId });
      else toast.error((e as Error).message || "Cancel failed", { id: toastId });
    } finally {
      setCancellingId(null);
    }
  };

  const acceptOffer = async (offer: ArcadeOrderModelCompat) => {
    if (!offersFor) return;
    const fresh = await fetchGame(offersFor.tokenId).catch(() => null);
    const blocker = acceptOfferBlocker(fresh, offer.createdAt);
    if (blocker) {
      if (fresh) setOffersFor(fresh);
      return toast.error(blocker);
    }
    const ok = await actions.handleAcceptOffer(offer as unknown as OrderModel);
    if (ok) {
      setOffersFor(null);
      void offersReceived.refetch();
      void myGames.refetch();
    }
  };

  // ================================================================ my offers
  const now = Math.floor(Date.now() / 1000);
  const myOfferRows = useMemo(
    () => (myOffers.data ?? []).filter((o) => o.status.into() === 1).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [myOffers.data],
  );
  const offerGames = useQuery({
    queryKey: ["adventurerOfferGames", myOfferRows.map((o) => o.tokenId).join(",")],
    enabled: tab === "offers" && myOfferRows.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const ids = [...new Set(myOfferRows.map((o) => BigInt(o.tokenId).toString()))];
      const games = await Promise.all(ids.map((id) => fetchGame(id).catch(() => null)));
      return new Map(ids.map((id, i) => [id, games[i]]));
    },
  });

  const refresh = () => {
    void market.refetchOrders();
    void market.refetchGames();
    void myGames.refetch();
    void offersReceived.refetch();
    void myOffers.refetch();
    void sales.invalidateAndRefetch();
  };

  // ================================================================ render
  const receivedCount = offersReceived.data?.length ?? 0;
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: "browse", label: `Listings${activeListings.length ? ` (${activeListings.length})` : ""}` },
    { value: "mine", label: `My Games${allMine.length ? ` (${allMine.length})` : ""}${receivedCount ? ` · ${receivedCount} offer${receivedCount === 1 ? "" : "s"}` : ""}` },
    { value: "offers", label: `My Offers${myOfferRows.length ? ` (${myOfferRows.length})` : ""}` },
    { value: "sold", label: "Recent Sales" },
  ];
  const hiddenTotal = Object.values(hiddenCounts).reduce((a, b) => a + b, 0);

  return (
    <AppLayout topBar={<TopBar />}>
      <IndexerStatusBanner />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MarketSwitch />
          <p className="text-xs text-zinc-500">
            Loot Survivor games are NFTs: buy a fresh ticket or a run in progress, then play it on lootsurvivor.io.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex flex-wrap gap-1 rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-1">
            {tabs.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition",
                  tab === t.value ? "bg-white/10 font-semibold text-white" : "text-zinc-400 hover:text-white",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={market.ordersFetching} aria-label="Refresh">
            <RefreshCw className={cn("h-4 w-4", market.ordersFetching && "animate-spin")} />
          </Button>
        </div>

        {/* ------------------------------------------------------------ listings */}
        {tab === "browse" && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip active={dungeonFilter === "all"} onClick={() => setDungeonFilter("all")}>
                All dungeons <Count n={activeListings.length} />
              </FilterChip>
              {GAME_DUNGEONS.map((d) => (
                <FilterChip key={d.minterId} active={dungeonFilter === d.minterId} onClick={() => setDungeonFilter(d.minterId)}>
                  <span className="h-2 w-2 rounded-full" style={{ background: d.accentColor }} />
                  {d.name} <Count n={dungeonCounts.get(d.minterId) ?? 0} />
                </FilterChip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
                Any status
              </FilterChip>
              <FilterChip active={statusFilter === "unplayed"} onClick={() => setStatusFilter("unplayed")}>
                Unplayed <Count n={listingTally.unplayed} />
              </FilterChip>
              <FilterChip active={statusFilter === "in-progress"} onClick={() => setStatusFilter("in-progress")}>
                Live <Count n={listingTally["in-progress"]} />
              </FilterChip>
              <select
                value={minLevel}
                onChange={(e) => setMinLevel(Number(e.target.value))}
                className="h-8 rounded-md border border-white/10 bg-black/40 px-2 text-xs text-zinc-200"
                aria-label="Minimum level"
              >
                {LEVELS.map((lv) => (
                  <option key={lv} value={lv}>
                    {lv === 0 ? "Any level" : `Level ${lv}+`}
                  </option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="h-8 rounded-md border border-white/10 bg-black/40 px-2 text-xs text-zinc-200"
                aria-label="Sort"
              >
                {SORTS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-zinc-400" title="Hide games in cooldown or otherwise not buyable right now">
                <input type="checkbox" checked={buyableOnly} onChange={(e) => setBuyableOnly(e.target.checked)} />
                Buyable now
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
              <span>
                Showing {browseListings.length} of {activeListings.length}
              </span>
              {hiddenTotal > 0 && (
                <>
                  <span>
                    {showUnavailable ? "Including" : "Hidden"}:{" "}
                    {[
                      [hiddenCounts.dead, "dead"],
                      [hiddenCounts.expired, "expired"],
                      [hiddenCounts.soulbound, "soulbound"],
                      [hiddenCounts.stuck, "stuck"],
                      [hiddenCounts.played, "played since listed"],
                    ]
                      .filter(([n]) => (n as number) > 0)
                      .map(([n, label]) => `${n} ${label}`)
                      .join(" · ")}
                  </span>
                  <label className="flex items-center gap-1.5 text-zinc-400">
                    <input type="checkbox" checked={showUnavailable} onChange={(e) => setShowUnavailable(e.target.checked)} />
                    Show them
                  </label>
                </>
              )}
            </div>

            {market.listingsError ? (
              <p className="text-sm text-red-400">{market.listingsError}</p>
            ) : market.ordersLoading || market.gamesLoading ? (
              <Spinner>Loading listings…</Spinner>
            ) : browseListings.length === 0 ? (
              <EmptyState>
                No games listed{activeListings.length ? " for these filters" : " yet"}. List one from{" "}
                <button className="text-gold underline" onClick={() => setTab("mine")}>
                  My Games
                </button>
                .
              </EmptyState>
            ) : (
              <Grid>
                {browseListings.map((l) => {
                  const mine = !!address && compareStarknetAddresses(l.seller, address);
                  const blocker = l.game ? buyBlocker(l.game, l.createdAt) : "Loading game state…";
                  const offerBlocker = l.game ? gameTradeBlocker(l.game) : "Loading game state…";
                  return (
                    <AdventurerCard key={l.listingId} tokenId={l.tokenId} game={l.game} listedAt={l.createdAt}>
                      <div className="space-y-1.5">
                        <span className="flex items-center gap-1 text-sm font-bold text-gold">
                          <TokenIcon symbol={symbolFor(l.paymentToken)} size="sm" />
                          {priceLabel(l)}
                        </span>
                        {mine ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-full text-xs"
                            disabled={cancellingId === l.listingId}
                            onClick={() => cancelOrder(l, "listing")}
                          >
                            {cancellingId === l.listingId ? "Cancelling…" : "Cancel listing"}
                          </Button>
                        ) : (
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              className="h-7 flex-1 bg-gold/15 text-xs font-bold text-gold border border-gold hover:bg-gold/20"
                              disabled={!address || !!blocker || checkingId === l.listingId || actions.buyingListingId === l.listingId}
                              title={blocker ?? undefined}
                              onClick={() => openBuy(l)}
                            >
                              {checkingId === l.listingId ? "Checking…" : actions.buyingListingId === l.listingId ? "Buying…" : "Buy"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={!address || !!offerBlocker}
                              title={offerBlocker ?? "Make an offer"}
                              onClick={() => requireToS(() => setOfferTarget({ tokenId: l.tokenId, game: l.game }))}
                            >
                              Offer
                            </Button>
                          </div>
                        )}
                        {!mine && blocker && l.game && <p className="text-[10px] leading-tight text-amber-300/80">{blocker}</p>}
                      </div>
                    </AdventurerCard>
                  );
                })}
              </Grid>
            )}
          </section>
        )}

        {/* ------------------------------------------------------------ my games */}
        {tab === "mine" && (
          <section className="space-y-3">
            {!address ? (
              <EmptyState>Connect your wallet to see your games.</EmptyState>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ["all", "All", allMine.length],
                      ["unplayed", "Unplayed", mineTally.unplayed],
                      ["in-progress", "Live", mineTally["in-progress"]],
                      ["listed", "Listed", myListingByToken.size],
                      ["offers", "Has offers", offersByToken.size],
                      ["dead", "Dead", mineTally.dead],
                      ["expired", "Expired", mineTally.expired],
                      ["stuck", "Stuck", mineTally.stuck],
                      ["soulbound", "Soulbound", mineTally.soulbound],
                    ] as Array<[MineFilter, string, number]>
                  )
                    .filter(([v, , n]) => v === "all" || n > 0)
                    .map(([v, label, n]) => (
                      <FilterChip key={v} active={mineFilter === v} onClick={() => setMineFilter(v)}>
                        {label} <Count n={n} />
                      </FilterChip>
                    ))}
                  <select
                    value={mineSort}
                    onChange={(e) => setMineSort(e.target.value as typeof mineSort)}
                    className="h-8 rounded-md border border-white/10 bg-black/40 px-2 text-xs text-zinc-200"
                    aria-label="Sort my games"
                  >
                    <option value="newest">Newest</option>
                    <option value="level">Level</option>
                    <option value="last-action">Last played</option>
                  </select>
                </div>
                {selected.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">{selected.size} selected</span>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setSelected(new Set())} aria-label="Clear selection">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" className="h-7 bg-gold/15 text-gold border border-gold hover:bg-gold/20" onClick={() => setSendOpen(true)}>
                      <Send className="mr-1 h-3.5 w-3.5" /> Send selected
                    </Button>
                  </div>
                )}
                <p className="text-[11px] text-zinc-500">
                  Games can be listed when unplayed, or {IDLE_SECONDS / 60} minutes after their last move (once it's revealed). Playing a
                  listed game voids the listing for buyers, so cancel it first. Click cards to select several to send.
                </p>
                {myGames.isLoading ? (
                  <Spinner>Loading your games…</Spinner>
                ) : myGames.error ? (
                  <p className="text-sm text-red-400">Couldn't load your games from Loot Survivor.</p>
                ) : visibleMyGames.length === 0 ? (
                  <EmptyState>
                    No games{mineFilter === "all" ? " in this wallet" : " match this filter"}.{" "}
                    <a className="text-gold underline" href="https://www.lootsurvivor.io/beastmode" target="_blank" rel="noopener noreferrer">
                      Get one on Loot Survivor
                    </a>
                    .
                  </EmptyState>
                ) : (
                  <Grid>
                    {visibleMyGames.map((g) => {
                      const listing = myListingByToken.get(g.tokenId);
                      const sendBlock = gameTradeBlocker(g);
                      const listBlock = listBlocker(g);
                      const offers = offersByToken.get(g.tokenId) ?? [];
                      return (
                        <AdventurerCard
                          key={g.tokenId}
                          tokenId={g.tokenId}
                          game={g}
                          listedAt={listing?.createdAt}
                          selected={selected.has(g.tokenId)}
                          onClick={sendBlock ? undefined : () => toggleSelected(g.tokenId)}
                        >
                          <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                            {listing && (
                              <div className="flex items-center gap-1.5">
                                <span className="flex items-center gap-1 text-xs font-bold text-gold">
                                  <Tag className="h-3 w-3" /> {priceLabel(listing)}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="ml-auto h-7 px-2 text-xs"
                                  disabled={cancellingId === listing.listingId}
                                  onClick={() => cancelOrder(listing, "listing")}
                                >
                                  {cancellingId === listing.listingId ? "Cancelling…" : "Cancel"}
                                </Button>
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {!listing && (
                                <Button
                                  size="sm"
                                  className="h-7 bg-gold/15 px-2 text-xs text-gold border border-gold hover:bg-gold/20"
                                  disabled={!!listBlock}
                                  title={listBlock ?? undefined}
                                  onClick={() => requireToS(() => setListTarget(g))}
                                >
                                  List
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                disabled={!!sendBlock}
                                title={sendBlock ?? undefined}
                                onClick={() => {
                                  setSelected(new Set([g.tokenId]));
                                  setSendOpen(true);
                                }}
                              >
                                Send
                              </Button>
                              {offers.length > 0 && (
                                <Button size="sm" variant="outline" className="h-7 border-gold/50 px-2 text-xs text-gold" onClick={() => setOffersFor(g)}>
                                  <HandCoins className="mr-1 h-3.5 w-3.5" /> {offers.length} offer{offers.length === 1 ? "" : "s"}
                                </Button>
                              )}
                              {gameStatus(g) !== "dead" && gameStatus(g) !== "expired" && (
                                <a
                                  href={lootSurvivorPlayUrl(g.tokenId, g.minterId)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-auto flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
                                >
                                  Play <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                            {!listing && listBlock && !sendBlock && <p className="text-[10px] leading-tight text-amber-300/80">{listBlock}</p>}
                          </div>
                        </AdventurerCard>
                      );
                    })}
                  </Grid>
                )}
              </>
            )}
          </section>
        )}

        {/* ------------------------------------------------------------ my offers */}
        {tab === "offers" && (
          <section className="space-y-2">
            {!address ? (
              <EmptyState>Connect your wallet to see your offers.</EmptyState>
            ) : myOffers.isLoading ? (
              <Spinner>Loading offers…</Spinner>
            ) : myOfferRows.length === 0 ? (
              <EmptyState>You haven't made any offers on games. Use “Offer” on a listing.</EmptyState>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/[0.03] text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Game</th>
                      <th className="px-3 py-2">Status now</th>
                      <th className="px-3 py-2">Offer</th>
                      <th className="px-3 py-2">Made</th>
                      <th className="px-3 py-2">Expires</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {myOfferRows.map((o) => {
                      const id = BigInt(o.tokenId).toString();
                      const g = offerGames.data?.get(id) ?? null;
                      const d = gameDungeonFor(decodeMinter(id));
                      const expired = o.expiration <= now;
                      const moved = playedSince(g, o.createdAt);
                      return (
                        <tr key={o.id} className="border-t border-white/[0.04]">
                          <td className="px-3 py-2">
                            <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: d.accentColor }} />
                            {d.name} {g ? `Lv ${g.level}` : ""}{" "}
                            <span className="font-mono text-zinc-500">#{BigInt(o.tokenId).toString(16).slice(-6)}</span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1">
                              {g ? <GameStatusBadge status={gameStatus(g)} /> : <span className="text-zinc-500">…</span>}
                              {moved && <span className="text-amber-300">played since</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-semibold text-gold">{priceLabel({ price: o.price, paymentToken: o.currency })}</td>
                          <td className="px-3 py-2 text-zinc-400">{o.createdAt ? formatAgo(o.createdAt) : "—"}</td>
                          <td className={cn("px-3 py-2", expired ? "text-red-400" : "text-zinc-400")}>
                            {expired ? "Expired" : new Date(o.expiration * 1000).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={cancellingId === String(o.id)}
                              onClick={() => cancelOrder({ listingId: String(o.id), orderId: o.id, tokenId: id }, "offer")}
                            >
                              {cancellingId === String(o.id) ? "Cancelling…" : "Cancel"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-zinc-500">
              Offers lock in the price, not the game: if the owner keeps playing, BeastDex won't let them accept an older offer, but
              the marketplace contract itself doesn't check. Cancel offers on games whose state changed, and prefer short durations.
            </p>
          </section>
        )}

        {/* ------------------------------------------------------------ sales */}
        {tab === "sold" && (
          <section>
            {sales.isLoading ? (
              <Spinner>Loading sales…</Spinner>
            ) : (sales.data ?? []).length === 0 ? (
              <EmptyState>No adventurer sales yet.</EmptyState>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/[0.03] text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Game</th>
                      <th className="px-3 py-2">Price</th>
                      <th className="px-3 py-2">From</th>
                      <th className="px-3 py-2">To</th>
                      <th className="px-3 py-2">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sales.data ?? []).map((s) => {
                      const d = gameDungeonFor(decodeMinter(s.order.tokenId));
                      return (
                        <tr key={s.orderId} className="border-t border-white/[0.04]">
                          <td className="px-3 py-2">
                            <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: d.accentColor }} />
                            {d.name} <span className="font-mono text-zinc-500">#{BigInt(s.order.tokenId).toString(16).slice(-6)}</span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-gold">{priceLabel({ price: s.order.price, paymentToken: s.order.currency })}</td>
                          <td className="px-3 py-2 font-mono text-zinc-400">{short(s.from)}</td>
                          <td className="px-3 py-2 font-mono text-zinc-400">{short(s.to)}</td>
                          <td className="px-3 py-2 text-zinc-400">{formatAgo(s.time)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <p className="text-[11px] text-zinc-600">
          Sellers pay the game's {ADVENTURER_ROYALTY_BP / 100}% creator royalty (set by Loot Survivor on the NFT contract); buyers pay
          the {CLIENT_FEE_BP / 100}% BeastDex client fee on top of the price.
        </p>
      </div>

      <ListDialog
        open={!!listTarget}
        onOpenChange={(o) => !o && setListTarget(null)}
        beast={listTarget ? gameTarget(listTarget.tokenId, listTarget) : null}
        collection={GAME_CORE_ADDRESS}
        itemLabel="Game"
        notice={
          listTarget?.started ? (
            <Warning>
              This game has started. If you play it after listing, buyers can't purchase it until you relist, so cancel the
              listing before you play on.
            </Warning>
          ) : null
        }
        onListed={() => {
          setListTarget(null);
          void actions.handleListed();
        }}
      />

      <MakeOfferDialog
        open={!!offerTarget}
        onOpenChange={(o) => !o && setOfferTarget(null)}
        beast={offerTarget ? gameTarget(offerTarget.tokenId, offerTarget.game) : null}
        tokenId={offerTarget?.tokenId}
        collection={GAME_CORE_ADDRESS}
        itemLabel="Game"
        notice={
          <Warning>
            You're offering on the game as it is now. If the owner plays after your offer, BeastDex won't let them accept it, but
            other marketplaces might. Choose a short duration.
          </Warning>
        }
        onOfferMade={() => {
          setOfferTarget(null);
          setTimeout(() => void myOffers.refetch(), 3000);
        }}
      />

      <GameOffersDialog
        open={!!offersFor}
        onOpenChange={(o) => !o && setOffersFor(null)}
        game={offersFor}
        offers={offersFor ? (offersByToken.get(offersFor.tokenId) ?? []) : []}
        acceptingId={actions.acceptingOfferId}
        onAccept={acceptOffer}
      />

      <SendGamesDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        games={selectedGames}
        onRemove={(id) => toggleSelected(id)}
        onSent={() => {
          setSelected(new Set());
          setTimeout(() => void myGames.refetch(), 4000);
        }}
      />

      {buying && (
        <PurchaseConfirmDialog
          open
          onOpenChange={(o) => !o && setBuying(null)}
          listing={buying.listing}
          priceLabel={priceLabel(buying.listing)}
          isProcessing={actions.buyingListingId === buying.listing.listingId}
          onConfirm={confirmBuy}
          itemLabel="Game"
          itemName={`${gameDungeonFor(buying.fresh?.minterId ?? decodeMinter(buying.listing.tokenId)).name} · Lv ${buying.fresh?.level ?? "?"}`}
          confirmDisabled={!!purchaseBlocker(buying)}
          preview={
            <div className="space-y-2">
              <div className="mx-auto w-[240px]">
                <AdventurerCard tokenId={buying.listing.tokenId} game={buying.fresh} listedAt={buying.listing.createdAt} />
              </div>
              {purchaseBlocker(buying) && <Warning tone="red">{purchaseBlocker(buying)}</Warning>}
              {buying.changes.length > 0 && (
                <Warning>Changed since you last saw it: {buying.changes.join(", ")}. The card shows the current state.</Warning>
              )}
              {!purchaseBlocker(buying) && buying.fresh?.started && (
                <p className="text-center text-[11px] text-zinc-500">
                  Untouched since it was listed. BeastDex re-checks it once more just before you sign.
                </p>
              )}
            </div>
          }
        />
      )}
    </AppLayout>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-white/[0.06] bg-surface/40 p-8 text-center text-sm text-zinc-400">{children}</div>;
}

function Spinner({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-zinc-400">
      <Loader2 className="h-4 w-4 animate-spin" /> {children}
    </p>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-zinc-500">{n}</span>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
        active ? "border-gold/60 bg-gold/10 text-gold" : "border-white/10 text-zinc-400 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function Warning({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "red" }) {
  return (
    <div
      className={cn(
        "flex items-start gap-1.5 rounded-md border p-2 text-xs",
        tone === "red" ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200",
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> <span>{children}</span>
    </div>
  );
}
