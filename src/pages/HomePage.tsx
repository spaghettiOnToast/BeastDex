import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from "react";
import SortDropdown, { type SortOption, sortOptionToBeastSortField } from "../components/sort/SortDropdown";
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
import { useBeasts } from "../hooks/useBeasts";
import {
  fetchBeastAttributeFilters,
  fetchBeastStats,
  fetchBeastHighlights,
  fetchTopBeasts,
  type BeastAttributeFilters,
  type BeastStats,
  type BeastHighlights,
  type BeastHighlightsLeader,
  type Beast,
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
import { executePurchaseWithApproval } from "../services/marketplace/approvals";
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
  const beasts = fullBeasts.length > 0 ? fullBeasts : initialBeasts;
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

    return () => {
      mounted = false;
      clearTimeout(filtersTimer);
      clearTimeout(statsTimer);
      clearTimeout(highlightsTimer);
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
      const newFilters = { ...prev };
      if (values && values.length > 0) {
        newFilters[trait] = values;
      } else {
        delete newFilters[trait];
      }
      return newFilters;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setPage(1);
    setAttributeFilters({});
  }, []);

  const formatOwner = useCallback(
    (leader: BeastHighlightsLeader) => {
      if (!leader.owner) return "Unknown";
      // Use the username from the highlights data (already looked up)
      if (leader.username) return leader.username;
      if (leader.owner.length <= 12) return leader.owner;
      return `${leader.owner.slice(0, 6)}…${leader.owner.slice(-4)}`;
    },
    []
  );

  const highlightItems = useMemo(() => {
    if (!highlights) return [];

    const items: Array<{ title: string; subtitle: string }> = [];

    if (highlights.leaders.overall.value > 0) {
      items.push({
        title: `${formatOwner(highlights.leaders.overall)} leads the hunt`,
        subtitle: `${highlights.leaders.overall.value.toLocaleString()} total beasts`,
      });
    }
    if (highlights.leaders.animatedShiny.value > 0) {
      items.push({
        title: `${formatOwner(
          highlights.leaders.animatedShiny
        )} loves animated shinies`,
        subtitle: `${highlights.leaders.animatedShiny.value.toLocaleString()} collected`,
      });
    }
    if (highlights.leaders.shiny.value > 0) {
      items.push({
        title: `${formatOwner(highlights.leaders.shiny)} is the shiny master`,
        subtitle: `${highlights.leaders.shiny.value.toLocaleString()} shinies`,
      });
    }
    if (highlights.leaders.animated.value > 0) {
      items.push({
        title: `${formatOwner(
          highlights.leaders.animated
        )} owns the animations`,
        subtitle: `${highlights.leaders.animated.value.toLocaleString()} animated beasts`,
      });
    }

    return items;
  }, [highlights, formatOwner]);

  // Find listing for selected beast (if any) - uses lightweight lookup (no beast hydration)
  const selectedBeastListing = useMemo(() => {
    if (!selectedBeast) return null;
    // Get the token ID from the beast
    const beastTokenId = selectedBeast.numericId?.toString() || selectedBeast.id.split(":").pop() || "";
    // Look up listing for this beast (O(1) lookup from cached Arcade data)
    return getListingForToken(beastTokenId);
  }, [selectedBeast, getListingForToken]);

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
              handleCloseModal();
              setMakeOfferOpen(true);
            }}
            disabled={!address}
            className="w-full sm:w-auto font-semibold tracking-wide border-gray-600 hover:border-gray-500"
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
          className="w-full sm:w-auto font-semibold tracking-wide bg-lsGold/20 text-lsGold border border-lsGold hover:bg-lsGold/30"
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
              ? "bg-[#39ff14]/20 text-[#39ff14] border-[#39ff14]"
              : "border-gray-600 hover:border-gray-500"
          }`}
        >
          {globalCart.isInPurchaseCart(listing.listingId) ? "In Cart" : "Add to Cart"}
        </Button>
        <Button
          variant="outline"
          size="default"
          onClick={() => {
            handleCloseModal();
            setMakeOfferOpen(true);
          }}
          disabled={!address}
          className="w-full sm:w-auto font-semibold tracking-wide border-gray-600 hover:border-gray-500"
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

  const filtersAndSortControls = (
    <div className="flex items-center gap-2 sm:gap-4">
      {filtersControl}
      <SortDropdown value={sortOption} onChange={setSortOption} />
    </div>
  );

  return (
    <AppLayout topBar={topBar}>
      <StatsPanel
        mintedCount={beastStats?.mintedCount || 0}
        uniqueOwners={beastStats?.uniqueOwners || 0}
        mintedLoading={mintedLoading}
        mintedError={mintedError}
        highlightItems={highlightItems}
        highlightsLoading={highlightsLoading}
        highlightsError={highlightsError}
        onRefresh={() => reload()}
        refreshing={loading}
        filtersControl={filtersAndSortControls}
        globalError={error}
      />

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
          onOpenChange={setMakeOfferOpen}
          beast={selectedBeast}
          tokenId={selectedBeast?.numericId?.toString() || selectedBeast?.id.split(":").pop() || ""}
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
        onResetFilters={handleResetFilters}
      />
    </AppLayout>
  );
}

export default HomePage;
