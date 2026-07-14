import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from "react";
import SortDropdown, { type SortOption, sortOptionToBeastSortField, HOMEPAGE_EXCLUDED_OPTIONS } from "../components/sort/SortDropdown";
import { useSearchParams } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import TopBar from "../components/header/TopBar";
import StatsPanel from "../components/stats/StatsPanel";
import BeastGrid from "../components/beast/BeastGrid";
import BeastModal from "../components/beast/BeastModal";
import PaginationControls from "../components/pagination/PaginationControls";
import { FiltersButton } from "../components/filters/FiltersButton";
import { FiltersDrawer } from "../components/filters/FiltersDrawer";
import { AppLayout } from "../components/layout/AppLayout";
import { Button } from "../components/ui/button";
import { RefreshCw } from "lucide-react";
import { useBeasts } from "../hooks/useBeasts";
import {
  fetchBeastAttributeFilters,
  fetchBeastStats,
  fetchBeastHighlights,
  fetchTierCollectionStats,
  fetchTopBeasts,
  hasCompleteMetadata,
  type BeastAttributeFilters,
  type BeastStats,
  type BeastHighlights,
  type Beast,
  type TierCollectionStats,
} from "../services/beast";
import { useControllerUsernames } from "../hooks/useControllerUsernames";
import { getUserFriendlyErrorMessage } from "../utils/error";
import { config } from "../config";
import { useListedTokens } from "../hooks/useListedTokens";
import { useGlobalCart } from "../contexts/GlobalCartContext";
import { formatPrice } from "../utils/price";
import { getPaymentTokenByAddress, BEASTS_COLLECTION_ADDRESS, CLIENT_FEE_BP, CLIENT_FEE_RECEIVER, ROYALTIES_ENABLED } from "../services/marketplace/constants";
import { useTokenMap, tokenAmountToUsd } from "../hooks/useEkuboTokens";
import { toBigIntSafe } from "../utils/bigint";
import type { Listing } from "../services/marketplace/types";

// Lazy load marketplace dialogs - only needed when modal opens (~20% of users)
const MakeOfferDialog = lazy(() => import("../components/marketplace/MakeOfferDialog"));
const PurchaseConfirmDialog = lazy(() => import("../components/marketplace/PurchaseConfirmDialog"));
import { executePurchaseWithApproval, getOrderValidity, getPublicProvider } from "../services/marketplace/approvals";
import { toast } from "sonner";
import { isUserRejection } from "../utils/transaction";
import { useSoldListings } from "../contexts/SoldListingsContext";

const HIDDEN_FILTER_TRAITS = new Set<string>([
  "adventurerkilledcount",
  "adventurer killed count",
  "adventurers killed",
  "lastkilledby",
  "last killed by",
  "lastdeathtimestamp",
  "last death timestamp"
]);
const PAGE_SIZE = config.pagination.defaultPageSize;

function HomePage() {
  const [search, setSearch] = useState("");
  const [availableFilters, setAvailableFilters] =
    useState<BeastAttributeFilters>({});
  const [attributeFilters, setAttributeFilters] =
    useState<BeastAttributeFilters>({});
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [ownerAddressFilters] = useState<string[]>([]);
  const [beastStats, setBeastStats] = useState<BeastStats | null>(null);
  const [mintedLoading, setMintedLoading] = useState(true);
  const [mintedError, setMintedError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [highlights, setHighlights] = useState<BeastHighlights | null>(null);
  const [highlightsLoading, setHighlightsLoading] = useState(true);
  const [highlightsError, setHighlightsError] = useState<string | null>(null);
  const [tierStats, setTierStats] = useState<TierCollectionStats[]>([]);
  const [tierStatsLoading, setTierStatsLoading] = useState(true);
  const [selectedBeast, setSelectedBeast] = useState<Beast | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchParams] = useSearchParams();

  // Two-phase loading: show top beasts immediately while full list loads
  const [initialBeasts, setInitialBeasts] = useState<Beast[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  // Marketplace state
  const { address, account } = useAccount();
  const globalCart = useGlobalCart();
  // Use lightweight listing check (no beast hydration - doesn't compete with homepage queries)
  const { getListingForToken } = useListedTokens();
  const { getToken } = useTokenMap();
  const { markAsSold, notifyOfferMade, notifyPurchase } = useSoldListings();
  const [makeOfferOpen, setMakeOfferOpen] = useState(false);
  const [offerBeast, setOfferBeast] = useState<Beast | null>(null);
  const [purchaseConfirmOpen, setPurchaseConfirmOpen] = useState(false);
  const [purchasingListing, setPurchasingListing] = useState<Listing | null>(null);
  const [purchaseProcessing, setPurchaseProcessing] = useState(false);

  // Phase 1: Fetch top beasts immediately (fast, heavily cached)
  useEffect(() => {
    let mounted = true;

    // Only fetch initial beasts on first load (page 1, no filters, default sort)
    const isInitialLoad = page === 1 &&
      !search &&
      Object.keys(attributeFilters).length === 0 &&
      sortOption === "default";

    if (isInitialLoad) {
      setInitialLoading(true);
      fetchTopBeasts(10)
        .then((topBeasts) => {
          if (mounted) {
            setInitialBeasts(topBeasts);
            setInitialLoading(false);
          }
        })
        .catch((err) => {
          console.warn("Failed to fetch top beasts:", err);
          if (mounted) {
            setInitialLoading(false);
          }
        });
    } else {
      // Not initial load, don't show initial beasts
      setInitialBeasts([]);
      setInitialLoading(false);
    }

    return () => { mounted = false; };
  }, [page, search, attributeFilters, sortOption]);

  // Phase 2: Fetch full paginated list (slower, but complete)
  const { beasts: fullBeasts, loading: fullLoading, error, reload, total } = useBeasts({
    limit: PAGE_SIZE,
    search,
    attributeFilters,
    ownerAddresses: ownerAddressFilters,
    page,
    sort: sortOptionToBeastSortField(sortOption),
  });

  // Use initial beasts while full list is loading, then switch to full list
  // Filter out beasts with incomplete metadata (missing name, image, or attributes)
  const rawBeasts = fullBeasts.length > 0 ? fullBeasts : initialBeasts;
  const beasts = useMemo(
    () => rawBeasts.filter(hasCompleteMetadata),
    [rawBeasts]
  );
  const loading = initialLoading && fullLoading;

  const ownerAddresses = useMemo(
    () => beasts.map((beast) => beast.owner).filter(Boolean),
    [beasts]
  );

  // Defer username lookups to allow beasts to render first
  const { usernames: ownerUsernames } = useControllerUsernames(ownerAddresses, {
    delayMs: 300,
  });

  useEffect(() => {
    const searchQuery = searchParams.get("search") ?? "";
    setSearch(searchQuery);
  }, [searchParams]);

  // Staggered data loading to avoid overwhelming the indexer
  // Filters load first (needed for UI), then stats and highlights after a delay
  useEffect(() => {
    let mounted = true;

    async function loadFilters() {
      try {
        setFiltersLoading(true);
        setFiltersError(null);
        const filters = await fetchBeastAttributeFilters();
        if (!mounted) return;
        const filteredEntries = (
          Object.entries(filters) as Array<[string, string[]]>
        ).filter(([trait]) => !HIDDEN_FILTER_TRAITS.has(trait.toLowerCase()));
        const cleanedFilters = Object.fromEntries(
          filteredEntries
        ) as BeastAttributeFilters;
        setAvailableFilters(cleanedFilters);
        setAttributeFilters((prev: BeastAttributeFilters) => {
          const nextEntries = (
            Object.entries(prev) as Array<[string, string[]]>
          ).filter(([trait]) =>
            Object.prototype.hasOwnProperty.call(cleanedFilters, trait)
          );
          return Object.fromEntries(nextEntries) as BeastAttributeFilters;
        });
      } catch (error: unknown) {
        console.error("Failed to load beast filters", error);
        if (!mounted) return;
        setFiltersError(getUserFriendlyErrorMessage(error, "Failed to load filters"));
      } finally {
        if (mounted) setFiltersLoading(false);
      }
    }

    async function loadBeastStats() {
      try {
        setMintedLoading(true);
        setMintedError(null);
        const stats = await fetchBeastStats();
        if (!mounted) return;
        setBeastStats(stats);
      } catch (error: unknown) {
        console.error("Failed to load minted beast count", error);
        if (!mounted) return;
        setMintedError(getUserFriendlyErrorMessage(error, "Failed to load beast stats"));
      } finally {
        if (mounted) setMintedLoading(false);
      }
    }

    async function loadHighlights() {
      try {
        setHighlightsLoading(true);
        setHighlightsError(null);
        const highlightsData = await fetchBeastHighlights();
        if (!mounted) return;
        setHighlights(highlightsData);
      } catch (error: unknown) {
        console.error("Failed to load beast highlights", error);
        if (!mounted) return;
        setHighlightsError(
          getUserFriendlyErrorMessage(error, "Failed to load beast highlights")
        );
      } finally {
        if (mounted) setHighlightsLoading(false);
      }
    }

    async function loadTierStats() {
      try {
        setTierStatsLoading(true);
        const data = await fetchTierCollectionStats();
        if (!mounted) return;
        setTierStats(data);
      } catch (err) {
        console.error("Failed to load tier stats:", err);
      } finally {
        if (mounted) setTierStatsLoading(false);
      }
    }

    // Stagger all data loading to avoid overwhelming the indexer
    // Beasts load via useBeasts hook immediately, so defer everything else
    const filtersTimer = setTimeout(() => {
      if (mounted) loadFilters();
    }, 300);

    const statsTimer = setTimeout(() => {
      if (mounted) loadBeastStats();
    }, 800);

    const highlightsTimer = setTimeout(() => {
      if (mounted) loadHighlights();
    }, 1500);

    const tierStatsTimer = setTimeout(() => {
      if (mounted) loadTierStats();
    }, 2000);

    return () => {
      mounted = false;
      clearTimeout(filtersTimer);
      clearTimeout(statsTimer);
      clearTimeout(highlightsTimer);
      clearTimeout(tierStatsTimer);
    };
  }, []);

  const handleSelectBeast = useCallback((beast: Beast) => {
    setSelectedBeast(beast);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedBeast(null);
  }, []);

  const handleOpenFilters = useCallback(() => {
    setFiltersOpen(true);
  }, []);

  const handleCloseFilters = useCallback(() => {
    setFiltersOpen(false);
  }, []);

  const handleFilterChange = useCallback((trait: string, value: string) => {
    setPage(1);
    setAttributeFilters((prev) => {
      const newFilters = { ...prev };
      if (value && value.trim()) {
        newFilters[trait] = [value];
      } else {
        delete newFilters[trait];
      }
      return newFilters;
    });
  }, []);

  const handleMultiFilterChange = useCallback((trait: string, values: string[]) => {
    setPage(1);
    setAttributeFilters((prev) => {
      const next = { ...prev };
      if (values && values.length > 0) next[trait] = values;
      else delete next[trait];
      return next;
    });
  }, []);

  const handleRankRangeChange = useCallback((rankValues: string[]) => {
    setPage(1);
    setAttributeFilters((prev) => {
      const next = { ...prev };
      if (rankValues.length > 0) next["Rank"] = rankValues;
      else delete next["Rank"];
      return next;
    });
  }, []);

  const handleHealthRangeChange = useCallback((min: number, max: number) => {
    setPage(1);
    setAttributeFilters((prev) => {
      const next = { ...prev };
      if (min === -1 && max === -1) delete next["Health"];
      else next["Health"] = [String(min), String(max)];
      return next;
    });
  }, []);

  const handleLevelRangeChange = useCallback((min: number, max: number) => {
    setPage(1);
    setAttributeFilters((prev) => {
      const next = { ...prev };
      if (min === -1 && max === -1) delete next["Level"];
      else next["Level"] = [String(min), String(max)];
      return next;
    });
  }, []);

  const handleAdventurersKilledRangeChange = useCallback((min: number, max: number) => {
    setPage(1);
    setAttributeFilters((prev) => {
      const next = { ...prev };
      if (min === -1 && max === -1) delete next["Adventurers Killed"];
      else next["Adventurers Killed"] = [String(min), String(max)];
      return next;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setPage(1);
    setAttributeFilters({});
  }, []);

  // Find listing for selected beast (if any) - uses lightweight lookup (no beast hydration)
  const selectedBeastListing = useMemo(() => {
    if (!selectedBeast) return null;
    const tokenId = selectedBeast.numericId?.toString() || selectedBeast.id.split(":").pop() || "";
    return getListingForToken(tokenId);
  }, [selectedBeast, getListingForToken]);

  // Layer 2: On-chain contract check when modal opens with a listing (1 RPC call)
  useEffect(() => {
    if (!selectedBeastListing) return;

    let cancelled = false;
    const { orderId, tokenId, listingId } = selectedBeastListing;

    getOrderValidity(
      getPublicProvider(),
      orderId,
      BEASTS_COLLECTION_ADDRESS,
      tokenId,
    ).then(({ valid }) => {
      if (!cancelled && !valid) {
        markAsSold(listingId);
      }
    });

    return () => { cancelled = true; };
  }, [selectedBeastListing, markAsSold]);

  // Format price with USD for the listing
  const formatPriceWithUsd = useCallback((listing: Listing) => {
    const token = getPaymentTokenByAddress(listing.paymentToken);
    const symbol = token?.symbol || "STRK";
    const priceFormatted = formatPrice(listing.price, symbol);

    // Calculate USD
    const tokenInfo = getToken(listing.paymentToken || "0x0");
    if (tokenInfo?.usdPrice) {
      try {
        const priceBigInt = toBigIntSafe(listing.price);
        const usdValue = tokenAmountToUsd(priceBigInt, tokenInfo.decimals, tokenInfo.usdPrice);
        return `${priceFormatted} ($${usdValue.toFixed(2)})`;
      } catch {
        return priceFormatted;
      }
    }
    return priceFormatted;
  }, [getToken]);

  // Handle direct purchase execution
  const handleDirectPurchase = useCallback(async (listing: Listing) => {
    if (!account || !listing) return;

    setPurchaseProcessing(true);
    const toastId = toast.loading("Processing purchase...");

    try {
      await executePurchaseWithApproval(
        account,
        listing.orderId,
        BEASTS_COLLECTION_ADDRESS,
        listing.tokenId,
        0, // quantity: 0 for ERC721 (non-fungible)
        ROYALTIES_ENABLED,
        listing.paymentToken || "0x0",
        listing.price,
        CLIENT_FEE_BP,
        CLIENT_FEE_RECEIVER
      );

      toast.success("Purchase successful!", { id: toastId });

      // Optimistically mark listing as sold (shared across all pages)
      markAsSold(listing.listingId);
      // Notify other pages about the purchase
      notifyPurchase();

      setPurchaseConfirmOpen(false);
      setPurchasingListing(null);
    } catch (e) {
      if (isUserRejection(e)) {
        toast.info("Purchase cancelled", { id: toastId });
      } else {
        const errorMessage = (e as Error).message || "Failed to complete purchase";
        toast.error(errorMessage, { id: toastId });
      }
    } finally {
      setPurchaseProcessing(false);
    }
  }, [account, markAsSold, notifyPurchase]);

  // Custom action slot for BeastModal - shows actions for both listed and unlisted beasts
  const beastModalActionSlot = useMemo(() => {
    if (!selectedBeast) return undefined;

    const listing = selectedBeastListing;
    const isOwner = listing && address?.toLowerCase() === listing.seller?.toLowerCase();

    // Owner shouldn't see buy/offer buttons on homepage modal
    if (isOwner) {
      return undefined;
    }

    // Beast is not listed - show only "Make Offer" button
    if (!listing) {
      return (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="default"
            onClick={() => {
              setOfferBeast(selectedBeast);
              handleCloseModal();
              setMakeOfferOpen(true);
            }}
            disabled={!address}
            className="w-full sm:w-auto font-semibold tracking-wide border-white/[0.10] hover:border-white/[0.20]"
          >
            Make Offer
          </Button>
        </div>
      );
    }

    // Beast is listed - show Buy, Cart, and Offer buttons
    return (
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          variant="outline"
          size="default"
          onClick={() => {
            handleCloseModal();
            setPurchasingListing(listing);
            setPurchaseConfirmOpen(true);
          }}
          disabled={!listing.active || !address}
          className="w-full sm:w-auto font-semibold tracking-wide bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25"
        >
          Buy Now - {formatPriceWithUsd(listing)}
        </Button>
        <Button
          variant="outline"
          size="default"
          onClick={() => {
            globalCart.togglePurchaseCart(listing);
          }}
          disabled={!listing.active || !address}
          className={`w-full sm:w-auto font-semibold tracking-wide ${
            globalCart.isInPurchaseCart(listing.listingId)
              ? "bg-accent/15 text-accent border-accent/30"
              : "border-white/[0.10] hover:border-white/[0.20]"
          }`}
        >
          {globalCart.isInPurchaseCart(listing.listingId) ? "In Cart" : "Add to Cart"}
        </Button>
        <Button
          variant="outline"
          size="default"
          onClick={() => {
            setOfferBeast(selectedBeast);
            handleCloseModal();
            setMakeOfferOpen(true);
          }}
          disabled={!address}
          className="w-full sm:w-auto font-semibold tracking-wide border-white/[0.10] hover:border-white/[0.20]"
        >
          Make Offer
        </Button>
      </div>
    );
  }, [selectedBeast, selectedBeastListing, address, globalCart, formatPriceWithUsd, handleCloseModal]);

  const topBar = <TopBar onLogoClick={handleResetFilters} />;

  const filtersControl = (
    <FiltersButton
      attributeFilters={attributeFilters}
      onClick={handleOpenFilters}
    />
  );

  return (
    <AppLayout topBar={topBar}>
      <StatsPanel
        mintedCount={beastStats?.mintedCount || 0}
        uniqueOwners={beastStats?.uniqueOwners || 0}
        mintedLoading={mintedLoading}
        mintedError={mintedError}
        highlights={highlights}
        highlightsLoading={highlightsLoading}
        highlightsError={highlightsError}
        tierStats={tierStats}
        tierStatsLoading={tierStatsLoading}
        globalError={error}
      />

      {/* Slim controls bar */}
      <div className="flex items-center gap-2 mb-3">
        {filtersControl}
        <SortDropdown value={sortOption} onChange={setSortOption} excludeOptions={HOMEPAGE_EXCLUDED_OPTIONS} />
        <div className="flex-1" />
        <Button
          onClick={() => reload()}
          disabled={loading}
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:text-white hover:bg-white/[0.06] text-xs h-7 px-2"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      <BeastGrid
        beasts={beasts}
        ownerUsernames={ownerUsernames}
        onSelect={handleSelectBeast}
        loading={loading}
        emptyMessage={config.ui.emptyMessages.beasts}
      />

      {/* Pagination at bottom */}
      <div className="flex justify-center">
        <PaginationControls
          page={page}
          totalPages={Math.ceil((total || 0) / PAGE_SIZE)}
          disablePrevious={page <= 1}
          disableNext={page >= Math.ceil((total || 0) / PAGE_SIZE)}
          loading={loading}
          onRefresh={() => reload()}
          onPrevious={() => setPage((prev) => Math.max(1, prev - 1))}
          onNext={() => setPage((prev) => prev + 1)}
        />
      </div>

      <BeastModal
        beast={selectedBeast}
        ownerUsernames={ownerUsernames}
        onClose={handleCloseModal}
        customActionSlot={beastModalActionSlot}
        listingExpiration={selectedBeastListing?.expiration}
      />

      {/* Marketplace Dialogs - lazy loaded */}
      <Suspense fallback={null}>
        <MakeOfferDialog
          open={makeOfferOpen}
          onOpenChange={(open) => {
            setMakeOfferOpen(open);
            if (!open) setOfferBeast(null);
          }}
          beast={offerBeast}
          tokenId={offerBeast?.numericId?.toString() || offerBeast?.id.split(":").pop() || ""}
          onOfferMade={() => {
            // Notify other pages that an offer was made (for refreshing offer lists)
            notifyOfferMade();
          }}
        />

        <PurchaseConfirmDialog
          open={purchaseConfirmOpen}
          onOpenChange={(open) => {
            if (!purchaseProcessing) {
              setPurchaseConfirmOpen(open);
              if (!open) setPurchasingListing(null);
            }
          }}
          listing={purchasingListing}
          priceLabel={purchasingListing ? formatPriceWithUsd(purchasingListing) : ""}
          onConfirm={() => {
            if (purchasingListing) {
              handleDirectPurchase(purchasingListing);
            }
          }}
          isProcessing={purchaseProcessing}
        />
      </Suspense>

      <FiltersDrawer
        open={filtersOpen}
        onClose={handleCloseFilters}
        availableFilters={availableFilters}
        attributeFilters={attributeFilters}
        filtersLoading={filtersLoading}
        filtersError={filtersError}
        onFilterChange={handleFilterChange}
        onMultiFilterChange={handleMultiFilterChange}
        onRankRangeChange={handleRankRangeChange}
        onHealthRangeChange={handleHealthRangeChange}
        onLevelRangeChange={handleLevelRangeChange}
        onAdventurersKilledRangeChange={handleAdventurersKilledRangeChange}
        onResetFilters={handleResetFilters}
      />
    </AppLayout>
  );
}

export default HomePage;
