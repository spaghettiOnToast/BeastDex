/**
 * Adventurers market: Loot Survivor games (v2 game core NFTs) on the same
 * Arcade marketplace as Beasts. Browse / buy listings, manage and send your
 * own games, recent sales.
 *
 * A listed game stays playable by its seller, so every card shows live state
 * (refreshed each minute) and the purchase re-reads the game right before
 * confirming and again right before sending the transaction.
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useAccount } from "@starknet-react/core";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Send, Tag, X } from "lucide-react";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import { IndexerStatusBanner } from "../components/marketplace/IndexerStatusBanner";
import { MarketSwitch } from "../components/marketplace/MarketSwitch";
import ListDialog from "../components/marketplace/ListDialog";
import PurchaseConfirmDialog from "../components/marketplace/PurchaseConfirmDialog";
import TokenIcon from "../components/ui/TokenIcon";
import { Button } from "../components/ui/button";
import { AdventurerCard } from "../components/adventurers/AdventurerCard";
import { formatAgo, playedSinceListed } from "../services/adventurers/format";
import { SendGamesDialog } from "../components/adventurers/SendGamesDialog";
import { useAdventurerListings, useMyGames, type AdventurerListing } from "../hooks/useAdventurerGames";
import { useArcadeSalesForCollection } from "../hooks/useArcadeOrders";
import { useMarketplaceActions } from "./marketplace/hooks/useMarketplaceActions";
import { useTermsOfService } from "../contexts/TermsOfServiceContext";
import { cn } from "../lib/utils";
import { compareStarknetAddresses } from "../utils/address";
import { formatPrice } from "../utils/price";
import { isUserRejection } from "../utils/transaction";
import { getPaymentTokenByAddress, CLIENT_FEE_BP } from "../services/marketplace/constants";
import type { Beast } from "../services/beast";
import {
  ADVENTURER_ROYALTY_BP,
  GAME_CORE_ADDRESS,
  GAME_DUNGEONS,
  fetchGame,
  gameDungeonFor,
  gameStatus,
  gameTradeBlocker,
  lootSurvivorPlayUrl,
  type AdventurerGame,
} from "../services/adventurers";

type Tab = "browse" | "mine" | "sold";
type StatusFilter = "all" | "unplayed" | "in-progress";
type Sort = "recent" | "price-asc" | "price-desc" | "level-desc";

const symbolFor = (currency?: string | null) => getPaymentTokenByAddress(currency ?? undefined)?.symbol ?? "STRK";
const priceLabel = (l: { price: string; paymentToken?: string | null }) => {
  const symbol = symbolFor(l.paymentToken);
  return `${formatPrice(l.price, symbol)} ${symbol}`;
};

/** A ListDialog target: it only reads id/name from the Beast shape. */
function gameListTarget(game: AdventurerGame): Beast {
  const d = gameDungeonFor(game.minterId);
  return {
    id: `game:0x${BigInt(game.tokenId).toString(16)}`,
    tokenId: game.tokenId,
    name: `${d.name} · Lv ${game.level} (#${BigInt(game.tokenId).toString(16).slice(-6)})`,
    image: "",
    owner: game.owner ?? null,
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

export default function AdventurerMarketplace() {
  const { address, account } = useAccount();
  const { hasAcceptedToS, openToSDialog } = useTermsOfService();
  const [tab, setTab] = useState<Tab>("browse");

  const market = useAdventurerListings();
  const myGames = useMyGames(address);
  const sales = useArcadeSalesForCollection(GAME_CORE_ADDRESS, 50);

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

  // ---------------------------------------------------------------- browse
  const [dungeonFilter, setDungeonFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [showUnavailable, setShowUnavailable] = useState(false);

  const browseListings = useMemo(() => {
    const filtered = market.listings.filter((l) => {
      if (!l.active) return false;
      const status = l.game ? gameStatus(l.game) : null;
      const unavailable = !l.game || !!gameTradeBlocker(l.game);
      if (unavailable && !showUnavailable) return false;
      if (dungeonFilter !== "all" && (l.game?.minterId ?? -1) !== dungeonFilter) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      return true;
    });
    const price = (l: AdventurerListing) => BigInt(l.price);
    return filtered.sort((a, b) => {
      switch (sort) {
        case "price-asc":
          return price(a) < price(b) ? -1 : price(a) > price(b) ? 1 : 0;
        case "price-desc":
          return price(a) > price(b) ? -1 : price(a) < price(b) ? 1 : 0;
        case "level-desc":
          return (b.game?.level ?? 0) - (a.game?.level ?? 0);
        default:
          return (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.orderId - a.orderId;
      }
    });
  }, [market.listings, dungeonFilter, statusFilter, sort, showUnavailable]);

  const dungeonCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const l of market.listings) if (l.active && l.game) counts.set(l.game.minterId, (counts.get(l.game.minterId) ?? 0) + 1);
    return counts;
  }, [market.listings]);

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

  const buyBlocker = (b: NonNullable<typeof buying>): string | null => {
    if (!b.fresh) return "Couldn't find this game on Loot Survivor.";
    if (b.fresh.owner && !compareStarknetAddresses(b.fresh.owner, b.listing.seller)) return "The seller no longer owns this game.";
    return gameTradeBlocker(b.fresh);
  };

  const confirmBuy = async () => {
    if (!buying?.fresh) return;
    // Last look right before signing: the seller may have kept playing
    const latest = await fetchGame(buying.listing.tokenId).catch(() => null);
    if (!latest) return toast.error("Couldn't re-check the game. Try again.");
    const changes = describeChange(buying.fresh, latest);
    if (changes.length > 0) {
      setBuying({ ...buying, fresh: latest, changes });
      toast.warning("The game changed while you were reviewing it. Check the new state before buying.");
      return;
    }
    const listing = buying.listing;
    setBuying(null);
    await actions.handlePurchase(listing);
    void myGames.refetch();
  };

  // ---------------------------------------------------------------- my games
  const [hideFinished, setHideFinished] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [listTarget, setListTarget] = useState<AdventurerGame | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const myListingByToken = useMemo(() => {
    const m = new Map<string, AdventurerListing>();
    if (!address) return m;
    for (const l of market.listings) if (l.active && compareStarknetAddresses(l.seller, address)) m.set(l.tokenId, l);
    return m;
  }, [market.listings, address]);

  const visibleMyGames = useMemo(
    () => (myGames.data ?? []).filter((g) => !hideFinished || !gameTradeBlocker(g) || myListingByToken.has(g.tokenId)),
    [myGames.data, hideFinished, myListingByToken],
  );
  const selectedGames = useMemo(
    () => (myGames.data ?? []).filter((g) => selected.has(g.tokenId)),
    [myGames.data, selected],
  );
  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const cancelListing = async (listing: AdventurerListing) => {
    if (!account) return;
    setCancellingId(listing.listingId);
    const toastId = toast.loading("Cancelling listing…");
    try {
      await actions.cancel(account, BigInt(listing.orderId), GAME_CORE_ADDRESS, BigInt(listing.tokenId));
      toast.success("Listing cancelled", { id: toastId });
      market.markListingAsSold(listing.listingId);
      void market.refetchOrders();
    } catch (e) {
      if (isUserRejection(e)) toast.info("Cancel aborted", { id: toastId });
      else toast.error((e as Error).message || "Cancel failed", { id: toastId });
    } finally {
      setCancellingId(null);
    }
  };

  const refresh = () => {
    void market.refetchOrders();
    void market.refetchGames();
    void myGames.refetch();
    void sales.invalidateAndRefetch();
  };

  // ---------------------------------------------------------------- render
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: "browse", label: `Listings${market.listings.length ? ` (${market.listings.filter((l) => l.active).length})` : ""}` },
    { value: "mine", label: "My Games" },
    { value: "sold", label: "Recent Sales" },
  ];

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
          <div className="inline-flex gap-1 rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-1">
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
          <Button variant="outline" size="sm" onClick={refresh} disabled={market.ordersFetching}>
            <RefreshCw className={cn("h-4 w-4", market.ordersFetching && "animate-spin")} />
          </Button>
        </div>

        {tab === "browse" && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip active={dungeonFilter === "all"} onClick={() => setDungeonFilter("all")}>
                All dungeons
              </FilterChip>
              {GAME_DUNGEONS.map((d) => (
                <FilterChip key={d.minterId} active={dungeonFilter === d.minterId} onClick={() => setDungeonFilter(d.minterId)}>
                  <span className="h-2 w-2 rounded-full" style={{ background: d.accentColor }} />
                  {d.name}
                  {dungeonCounts.get(d.minterId) ? <span className="text-zinc-500">{dungeonCounts.get(d.minterId)}</span> : null}
                </FilterChip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["all", "Any status"],
                  ["unplayed", "Unplayed"],
                  ["in-progress", "Game started"],
                ] as const
              ).map(([v, label]) => (
                <FilterChip key={v} active={statusFilter === v} onClick={() => setStatusFilter(v)}>
                  {label}
                </FilterChip>
              ))}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="h-8 rounded-md border border-white/10 bg-black/40 px-2 text-xs text-zinc-200"
                aria-label="Sort"
              >
                <option value="recent">Recently listed</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="level-desc">Level: high to low</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                <input type="checkbox" checked={showUnavailable} onChange={(e) => setShowUnavailable(e.target.checked)} />
                Show dead / expired
              </label>
            </div>

            {market.listingsError ? (
              <p className="text-sm text-red-400">{market.listingsError}</p>
            ) : market.ordersLoading || market.gamesLoading ? (
              <p className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading listings…
              </p>
            ) : browseListings.length === 0 ? (
              <EmptyState>
                No games listed{dungeonFilter !== "all" || statusFilter !== "all" ? " for these filters" : " yet"}. List one from{" "}
                <button className="text-gold underline" onClick={() => setTab("mine")}>
                  My Games
                </button>
                .
              </EmptyState>
            ) : (
              <Grid>
                {browseListings.map((l) => {
                  const mine = !!address && compareStarknetAddresses(l.seller, address);
                  const blocker = l.game ? gameTradeBlocker(l.game) : "Loading game state…";
                  return (
                    <AdventurerCard key={l.listingId} tokenId={l.tokenId} game={l.game} listedAt={l.createdAt}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 text-sm font-bold text-gold">
                          <TokenIcon symbol={symbolFor(l.paymentToken)} size="sm" />
                          {priceLabel(l)}
                        </span>
                        {mine ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={cancellingId === l.listingId}
                            onClick={() => cancelListing(l)}
                          >
                            {cancellingId === l.listingId ? "Cancelling…" : "Cancel"}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 bg-gold/15 px-3 text-xs font-bold text-gold border border-gold hover:bg-gold/20"
                            disabled={!address || !!blocker || checkingId === l.listingId || actions.buyingListingId === l.listingId}
                            title={blocker ?? undefined}
                            onClick={() => openBuy(l)}
                          >
                            {checkingId === l.listingId ? "Checking…" : actions.buyingListingId === l.listingId ? "Buying…" : "Buy"}
                          </Button>
                        )}
                      </div>
                    </AdventurerCard>
                  );
                })}
              </Grid>
            )}
          </section>
        )}

        {tab === "mine" && (
          <section className="space-y-3">
            {!address ? (
              <EmptyState>Connect your wallet to see your games.</EmptyState>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <input type="checkbox" checked={hideFinished} onChange={(e) => setHideFinished(e.target.checked)} />
                    Hide dead / expired games
                  </label>
                  {selected.size > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">{selected.size} selected</span>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setSelected(new Set())}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 bg-gold/15 text-gold border border-gold hover:bg-gold/20"
                        onClick={() => setSendOpen(true)}
                      >
                        <Send className="mr-1 h-3.5 w-3.5" /> Send selected
                      </Button>
                    </div>
                  )}
                </div>
                {myGames.isLoading ? (
                  <p className="flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading your games…
                  </p>
                ) : myGames.error ? (
                  <p className="text-sm text-red-400">Couldn't load your games from Loot Survivor.</p>
                ) : visibleMyGames.length === 0 ? (
                  <EmptyState>
                    No {hideFinished ? "playable " : ""}games in this wallet.{" "}
                    <a className="text-gold underline" href="https://www.lootsurvivor.io/beastmode" target="_blank" rel="noopener noreferrer">
                      Get one on Loot Survivor
                    </a>
                    .
                  </EmptyState>
                ) : (
                  <Grid>
                    {visibleMyGames.map((g) => {
                      const listing = myListingByToken.get(g.tokenId);
                      const blocker = gameTradeBlocker(g);
                      return (
                        <AdventurerCard
                          key={g.tokenId}
                          tokenId={g.tokenId}
                          game={g}
                          listedAt={listing?.createdAt}
                          selected={selected.has(g.tokenId)}
                          onClick={blocker ? undefined : () => toggleSelected(g.tokenId)}
                        >
                          <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {listing ? (
                              <>
                                <span className="flex items-center gap-1 text-xs font-bold text-gold">
                                  <Tag className="h-3 w-3" /> {priceLabel(listing)}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="ml-auto h-7 px-2 text-xs"
                                  disabled={cancellingId === listing.listingId}
                                  onClick={() => cancelListing(listing)}
                                >
                                  {cancellingId === listing.listingId ? "Cancelling…" : "Cancel listing"}
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  className="h-7 bg-gold/15 px-2 text-xs text-gold border border-gold hover:bg-gold/20"
                                  disabled={!!blocker}
                                  title={blocker ?? undefined}
                                  onClick={() => requireToS(() => setListTarget(g))}
                                >
                                  List
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  disabled={!!blocker}
                                  title={blocker ?? undefined}
                                  onClick={() => {
                                    setSelected(new Set([g.tokenId]));
                                    setSendOpen(true);
                                  }}
                                >
                                  Send
                                </Button>
                              </>
                            )}
                            {gameStatus(g) !== "dead" && (
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
                        </AdventurerCard>
                      );
                    })}
                  </Grid>
                )}
              </>
            )}
          </section>
        )}

        {tab === "sold" && (
          <section>
            {sales.isLoading ? (
              <p className="text-sm text-zinc-400">Loading sales…</p>
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
          Sellers pay the game's {ADVENTURER_ROYALTY_BP / 100}% creator royalty (set by Loot Survivor on the NFT contract); buyers
          pay the {CLIENT_FEE_BP / 100}% BeastDex client fee on top of the price.
        </p>
      </div>

      <ListDialog
        open={!!listTarget}
        onOpenChange={(o) => !o && setListTarget(null)}
        beast={listTarget ? gameListTarget(listTarget) : null}
        collection={GAME_CORE_ADDRESS}
        itemLabel="Game"
        notice={
          listTarget?.started ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
              This game has started. Buyers see its live state and a "played since listed" flag if you keep playing, so
              cancel the listing before you play on.
            </div>
          ) : null
        }
        existingListings={listTarget && myListingByToken.get(listTarget.tokenId) ? [myListingByToken.get(listTarget.tokenId)!] : []}
        onListed={() => {
          setListTarget(null);
          void actions.handleListed();
        }}
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
          confirmDisabled={!!buyBlocker(buying)}
          preview={
            <div className="space-y-2">
              <div className="mx-auto w-[240px]">
                <AdventurerCard tokenId={buying.listing.tokenId} game={buying.fresh} listedAt={buying.listing.createdAt} />
              </div>
              {buyBlocker(buying) && (
                <Warning tone="red">{buyBlocker(buying)}</Warning>
              )}
              {buying.changes.length > 0 && (
                <Warning>Changed since you last saw it: {buying.changes.join(", ")}. The card shows the current state.</Warning>
              )}
              {!buyBlocker(buying) && playedSinceListed(buying.fresh, buying.listing.createdAt) && (
                <Warning>The seller has played this game since listing it. The card shows the current state.</Warning>
              )}
              {!buyBlocker(buying) && buying.fresh?.started && (
                <p className="text-center text-[11px] text-zinc-500">
                  The seller can still play until the sale lands. BeastDex re-checks the game just before you sign.
                </p>
              )}
            </div>
          }
        />
      )}
    </AppLayout>
  );
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function decodeMinter(tokenId: string): number {
  try {
    return Number((BigInt(tokenId) >> 168n) & 0xffffffn);
  } catch {
    return 0;
  }
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-white/[0.06] bg-surface/40 p-8 text-center text-sm text-zinc-400">{children}</div>;
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
