import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useAccount } from "@starknet-react/core";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import { Button } from "../components/ui/button";
import ListingCard from "../components/marketplace/ListingCard";
import { useControllerUsernames } from "../hooks/useControllerUsernames";
import { useOffersForToken, useOffersReceivedForListings, useUserOffers } from "../hooks/useArcadeOrders";
import type { Listing } from "../services/marketplace/types";
import {
  getPaymentTokenByAddress,
  DEFAULT_PAYMENT_TOKEN,
  BEASTS_COLLECTION_ADDRESS,
} from "../services/marketplace/constants";
import { cancelListingFlow } from "../services/marketplace/flows";
import {
  type OrderModel,
  CategoryType,
  StatusType,
} from "@cartridge/arcade";
import type { Beast } from "../services/beast";
import FiltersButton from "../components/filters/FiltersButton";
import { FiltersDrawer } from "../components/filters/FiltersDrawer";
import SortDropdown from "../components/sort/SortDropdown";
import { cn } from "../lib/utils";
import {
  formatPrice,
} from "../utils/price";
import Pagination from "../components/marketplace/Pagination";

// Lazy load dialog components to reduce initial bundle size
const CartListDialog = lazy(() => import("../components/marketplace/CartListDialog"));
const EditListingDialog = lazy(() => import("../components/marketplace/EditListingDialog"));
const PurchaseConfirmDialog = lazy(() => import("../components/marketplace/PurchaseConfirmDialog"));
const PurchaseCartDialog = lazy(() => import("../components/marketplace/PurchaseCartDialog"));
const MakeOfferDialog = lazy(() => import("../components/marketplace/MakeOfferDialog"));
const OffersDialog = lazy(() => import("../components/marketplace/OffersDialog"));
const UnifiedCartDialog = lazy(() => import("../components/marketplace/UnifiedCartDialog"));
const BeastModal = lazy(() => import("../components/beast/BeastModal"));
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { ShoppingCart, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";
import { isUserRejection } from "../utils/transaction";

// Import custom hooks and utilities
import { useMarketplaceData } from "./marketplace/hooks/useMarketplaceData";
import { useMarketplaceFilters } from "./marketplace/hooks/useMarketplaceFilters";
import { useMarketplaceCarts } from "./marketplace/hooks/useMarketplaceCarts";
import { useMarketplaceActions as useMarketplaceActionsHook } from "./marketplace/hooks/useMarketplaceActions";
import { useUserTransactions } from "./marketplace/hooks/useUserTransactions";
import { useRecentSales } from "./marketplace/hooks/useRecentSales";
import { useTokenMap, tokenAmountToUsd } from "../hooks/useEkuboTokens";
import { ViewToggle } from "./marketplace/components/ViewToggle";
import type { ExploreSubTab, MyActivitySubTab } from "./marketplace/types";

// Storage key for hidden offers
const HIDDEN_OFFERS_KEY = "beastdex-hidden-offers";

/**
 * Format a timestamp to relative time (e.g., "24 minutes ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 0) return "just now"; // Future dates (shouldn't happen but handle gracefully)
  if (diff < 60) return "just now";
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins}m ago`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
  }
  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return `${days}d ago`;
  }
  const weeks = Math.floor(diff / 604800);
  return `${weeks}w ago`;
}


/**
 * Main Marketplace Page Component - Refactored for maintainability
 *
 * This component orchestrates the marketplace functionality using custom hooks:
 * - useMarketplaceData: Handles all data fetching (listings, beasts, filters)
 * - useMarketplaceFilters: Manages filtering, sorting, and computed listings
 * - useMarketplaceCarts: Manages listing and purchase carts
 * - useMarketplaceActions: Handles buy/sell/offer actions
 */
export default function MarketplacePage() {
  const { address, account } = useAccount();
  const { getToken } = useTokenMap();

  // Dialog states
  const [exploreSubTab, setExploreSubTab] = useState<ExploreSubTab>("browse");
  const [myActivitySubTab, setMyActivitySubTab] = useState<MyActivitySubTab>("listings");
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [purchaseConfirmOpen, setPurchaseConfirmOpen] = useState(false);
  const [purchasingListing, setPurchasingListing] = useState<Listing | null>(null);
  const [purchaseCartOpen, setPurchaseCartOpen] = useState(false);
  const [makeOfferOpen, setMakeOfferOpen] = useState(false);
  const [offerBeast, setOfferBeast] = useState<Beast | null>(null);
  const [offerTokenId, setOfferTokenId] = useState<string | undefined>(undefined);
  const [offersDialogOpen, setOffersDialogOpen] = useState(false);
  const [selectedListingForOffers, setSelectedListingForOffers] = useState<Listing | null>(null);
  const [unifiedCartOpen, setUnifiedCartOpen] = useState(false);
  const [acceptOfferConfirmOpen, setAcceptOfferConfirmOpen] = useState(false);
  const [offerToAccept, setOfferToAccept] = useState<{
    offer: OrderModel;
    beastName: string;
    priceFormatted: string;
    buyerAddress: string;
  } | null>(null);
  const [selectedPaymentToken] = useState(DEFAULT_PAYMENT_TOKEN);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailModalListing, setDetailModalListing] = useState<Listing | null>(null);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<string | null>(null);
  const [recentViewMode, setRecentViewMode] = useState<"cards" | "table">("cards");

  // Hidden offers state (persisted to localStorage)
  const [hiddenOfferIds, setHiddenOfferIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(HIDDEN_OFFERS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [showHiddenOffers, setShowHiddenOffers] = useState(false);

  // Persist hidden offers to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_OFFERS_KEY, JSON.stringify([...hiddenOfferIds]));
    } catch {
      // Ignore localStorage errors
    }
  }, [hiddenOfferIds]);

  // Toggle hide/unhide offer
  const handleToggleHideOffer = useCallback((offerId: string) => {
    setHiddenOfferIds(prev => {
      const next = new Set(prev);
      if (next.has(offerId)) {
        next.delete(offerId);
      } else {
        next.add(offerId);
      }
      return next;
    });
  }, []);

  // Data fetching hook
  const dataHook = useMarketplaceData(address);

  // Filters hook
  const filtersHook = useMarketplaceFilters({
    listings: dataHook.listings,
    userBeasts: dataHook.userBeasts,
    recentListings: dataHook.recentListings,
    address,
    availableFilters: dataHook.availableFilters,
  });

  // Carts hook
  const cartsHook = useMarketplaceCarts({
    alreadyListedTokenIds: filtersHook.alreadyListedTokenIds,
  });

  // User transactions hook (from indexer instead of localStorage)
  const { transactions: userTransactions, refetchOffers, invalidateSales } = useUserTransactions({
    address,
    listings: dataHook.listings,
  });

  // Recent sales hook (from indexer)
  const { namedRecentSales, invalidateAndRefetch: invalidateRecentSales } = useRecentSales({
    listings: dataHook.listings,
    limit: 20,
  });

  // Combined invalidation function for all sales data
  const invalidateAllSales = useCallback(async () => {
    await Promise.all([
      invalidateSales(),
      invalidateRecentSales(),
    ]);
  }, [invalidateSales, invalidateRecentSales]);

  // Actions hook
  const actionsHook = useMarketplaceActionsHook({
    account,
    refetchOrders: dataHook.refetchOrders,
    reloadUserBeasts: dataHook.reloadUserBeasts,
    invalidateSales: invalidateAllSales,
    markListingAsSold: dataHook.markListingAsSold,
  });

  // Defer username lookups to allow listings to render first
  const { usernames: ownerUsernames } = useControllerUsernames(filtersHook.ownerAddresses, { delayMs: 300 });

  // Fetch offers for selected token when offers dialog is open
  const { data: arcadeOffers, isLoading: offersLoading } = useOffersForToken(
    BEASTS_COLLECTION_ADDRESS,
    selectedListingForOffers?.tokenId,
    offersDialogOpen
  );

  // Convert ArcadeOrderModelCompat to OrderModel format for OffersDialog
  const offersForToken = useMemo((): OrderModel[] => {
    if (!arcadeOffers || arcadeOffers.length === 0) return [];

    return arcadeOffers.map((offer) => ({
      id: offer.id,
      identifier: offer.identifier,
      category: { value: CategoryType.Buy, into: () => 1 },
      status: { value: StatusType.Placed, into: () => 1 },
      expiration: offer.expiration,
      collection: offer.collection,
      tokenId: BigInt(offer.tokenId),
      quantity: offer.quantity,
      price: BigInt(offer.price),
      currency: offer.currency,
      owner: offer.owner,
    })) as unknown as OrderModel[];
  }, [arcadeOffers]);

  // Get all user's owned token IDs for offers received query
  // Offers can be made on any beast the user owns, not just listed ones
  const userOwnedTokenIds = useMemo(() => {
    const tokenIds = new Set<string>();

    // Add token IDs from owned beasts
    for (const beast of dataHook.userBeasts) {
      const rawTokenId = beast.id.split(":").pop() || beast.id;
      // Convert hex to decimal if needed
      const tokenId = rawTokenId.startsWith("0x")
        ? BigInt(rawTokenId).toString()
        : rawTokenId;
      tokenIds.add(tokenId);
    }

    // Also add from active listings (in case of any edge cases)
    for (const listing of filtersHook.myActiveListings) {
      tokenIds.add(listing.tokenId);
    }

    return Array.from(tokenIds);
  }, [dataHook.userBeasts, filtersHook.myActiveListings]);

  // Fetch offers received on user's owned beasts (not just listed ones)
  // Always enabled when user has tokens - this allows the badge to show count regardless of active tab
  const { data: offersReceived, isLoading: offersReceivedLoading, refetch: refetchOffersReceived } = useOffersReceivedForListings(
    BEASTS_COLLECTION_ADDRESS,
    userOwnedTokenIds,
    !!address && userOwnedTokenIds.length > 0
  );

  // Fetch user's made offers for display in Offers tab
  const { data: userMadeOffers, isLoading: userMadeOffersLoading, refetch: refetchUserMadeOffers } = useUserOffers(
    address,
    BEASTS_COLLECTION_ADDRESS
  );

  // Enrich offers with beast names from listings or owned beasts, and hidden state
  // Also filter out offers made by the current user (you can't accept your own offers)
  const enrichedOffersReceived = useMemo(() => {
    if (!offersReceived || offersReceived.length === 0) return [];

    // Filter out offers made by the current user
    const filteredOffers = address
      ? offersReceived.filter(offer => offer.owner.toLowerCase() !== address.toLowerCase())
      : offersReceived;

    return filteredOffers.map(offer => {
      const tokenId = String(offer.tokenId);

      // First try to find beast name from active listings
      const matchingListing = filtersHook.myActiveListings.find(l => l.tokenId === tokenId);
      let beastName = matchingListing?.beast?.name;

      // If not found in listings, try to find from owned beasts
      if (!beastName) {
        const matchingBeast = dataHook.userBeasts.find(beast => {
          const rawTokenId = beast.id.split(":").pop() || beast.id;
          const beastTokenId = rawTokenId.startsWith("0x")
            ? BigInt(rawTokenId).toString()
            : rawTokenId;
          return beastTokenId === tokenId;
        });
        beastName = matchingBeast?.name;
      }

      return {
        ...offer,
        beastName,
        isHidden: hiddenOfferIds.has(offer.id.toString()),
      };
    });
  }, [offersReceived, filtersHook.myActiveListings, dataHook.userBeasts, hiddenOfferIds, address]);

  // Filter offers based on visibility
  const visibleOffersReceived = useMemo(() => {
    if (showHiddenOffers) {
      return enrichedOffersReceived;
    }
    return enrichedOffersReceived.filter(offer => !offer.isHidden);
  }, [enrichedOffersReceived, showHiddenOffers]);

  // Count hidden offers for badge
  const hiddenOffersCount = useMemo(() => {
    return enrichedOffersReceived.filter(offer => offer.isHidden).length;
  }, [enrichedOffersReceived]);

  // Recent listings now auto-update when main listings change (no manual load needed)
  // Recent sales are loaded automatically from useRecentSales hook

  // Reload user beasts when My Activity tab is opened
  useEffect(() => {
    if (filtersHook.activeTab === "my") {
      void dataHook.reloadUserBeasts();
    }
  }, [filtersHook.activeTab]);

  /**
   * Format price label with currency conversion
   */
  const formatPriceLabel = useCallback(
    (listing: Listing) => {
      const token = getPaymentTokenByAddress(listing.paymentToken ?? undefined);
      const fromSymbol = token?.symbol ?? "STRK";

      // Always show native listing token
      return formatPrice(listing.price, fromSymbol);
    },
    []
  );

  /**
   * Format subtitle price (USD equivalent using Ekubo prices)
   */
  const formatSubtitlePrice = useCallback(
    (listing: Listing) => {
      const tokenAddress = listing.paymentToken;
      if (!tokenAddress) return undefined;

      const token = getToken(tokenAddress);
      if (!token?.usdPrice) return undefined;

      const usdValue = tokenAmountToUsd(
        listing.price,
        token.decimals,
        token.usdPrice
      );

      // Format with 2 decimal places and thousands separator
      return usdValue.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },
    [getToken]
  );

  /**
   * Get token logo URL from Ekubo data
   */
  const getTokenLogoUrl = useCallback(
    (listing: Listing) => {
      const tokenAddress = listing.paymentToken;
      if (!tokenAddress) return undefined;
      return getToken(tokenAddress)?.logoUrl;
    },
    [getToken]
  );

  /**
   * Handle clicking on a listing card to open detail modal
   */
  const handleCardClick = useCallback((listing: Listing) => {
    setDetailModalListing(listing);
  }, []);

  /**
   * Handle clicking on a beast in My Beasts to open detail modal
   */
  const handleBeastClick = useCallback((beast: Beast) => {
    setDetailModalListing({
      listingId: beast.id,
      tokenId: beast.id.split(':').pop() || beast.id,
      seller: address || '',
      price: '0',
      beast: beast,
      status: 'active' as const,
      active: false,
      paymentToken: null,
      orderId: 0,
    });
  }, [address]);

  /**
   * Handle closing the detail modal
   */
  const handleCloseDetailModal = useCallback(() => {
    setDetailModalListing(null);
  }, []);

  /**
   * Create beast object for detail modal with seller as owner
   */
  const detailModalBeast = useMemo(() => {
    if (!detailModalListing?.beast) return null;
    return {
      ...detailModalListing.beast,
      owner: detailModalListing.seller,
    };
  }, [detailModalListing]);

  /**
   * Calculate floor price in USD - finds the absolute lowest price across all currencies
   */
  const floorPriceUsd = useMemo(() => {
    const activeListings = filtersHook.sortedListings.filter(
      (listing) => listing.active && listing.status === "active"
    );

    if (activeListings.length === 0) return null;

    let lowestUsd: number | null = null;
    let lowestListing: Listing | null = null;

    for (const listing of activeListings) {
      if (!listing.paymentToken) continue;

      const token = getToken(listing.paymentToken);
      if (!token?.usdPrice) continue;

      try {
        const usdValue = tokenAmountToUsd(
          listing.price,
          token.decimals,
          token.usdPrice
        );

        if (lowestUsd === null || usdValue < lowestUsd) {
          lowestUsd = usdValue;
          lowestListing = listing;
        }
      } catch {
        continue;
      }
    }

    if (lowestUsd === null) return null;

    return {
      usdValue: lowestUsd,
      listing: lowestListing,
    };
  }, [filtersHook.sortedListings, getToken]);

  const uniqueSellers = useMemo(() => {
    return new Set(
      filtersHook.sortedListings
        .map((listing) => listing.seller?.toLowerCase?.() ?? "")
        .filter((seller) => seller.length > 0)
    ).size;
  }, [filtersHook.sortedListings]);

  const totalListingsCount = filtersHook.sortedListings.length;

  // Format floor price for display - just show USD
  const floorPriceParts = useMemo(() => {
    if (!floorPriceUsd) {
      return { value: "—", currency: "", usdValue: null };
    }

    const formattedUsd = floorPriceUsd.usdValue.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return {
      value: `$${formattedUsd}`,
      currency: "",
      usdValue: null, // Already showing USD as main value
    };
  }, [floorPriceUsd]);

  /**
   * Hero stats for the header
   */
  const heroStats = useMemo(
    () => [
      {
        label: "Floor Price",
        value: floorPriceParts.value,
        currency: floorPriceParts.currency,
        icon: "💰",
        color: "rgb(253, 224, 71)",
        bgGradient: "bg-gradient-to-br from-yellow-500/15 to-yellow-500/5",
        borderColor: "border-yellow-400/30",
        isFloorPrice: true,
      },
      {
        label: "Active Listings",
        value: totalListingsCount.toLocaleString(),
        currency: "",
        icon: "🏪",
        color: "rgb(59, 130, 246)",
        bgGradient: "bg-gradient-to-br from-blue-500/15 to-blue-500/5",
        borderColor: "border-blue-400/30",
        isFloorPrice: false,
      },
      {
        label: "Your Listings",
        value: filtersHook.myActiveListings.length.toLocaleString(),
        currency: "",
        icon: "📋",
        color: "rgb(34, 197, 94)",
        bgGradient: "bg-gradient-to-br from-green-500/15 to-green-500/5",
        borderColor: "border-green-400/30",
        isFloorPrice: false,
      },
      {
        label: "Unique Sellers",
        value: uniqueSellers.toLocaleString(),
        currency: "",
        icon: "👥",
        color: "rgb(168, 85, 247)",
        bgGradient: "bg-gradient-to-br from-purple-500/15 to-purple-500/5",
        borderColor: "border-purple-400/30",
        isFloorPrice: false,
      },
    ],
    [floorPriceParts, filtersHook.myActiveListings.length, totalListingsCount, uniqueSellers]
  );

  /**
   * Filter controls for toolbar
   */
  const filterControls = useMemo(
    () => (
      <div className="flex items-center gap-3">
        <FiltersButton
          attributeFilters={filtersHook.attributeFilters}
          onClick={() => setFiltersOpen(true)}
        />
        <SortDropdown value={filtersHook.sortOption} onChange={filtersHook.setSortOption} />
      </div>
    ),
    [filtersHook.attributeFilters, filtersHook.sortOption]
  );

  /**
   * Handle cancel listing
   */
  const handleCancelListing = useCallback(
    async (listing: Listing) => {
      if (!account) return;

      const toastId = toast.loading("Cancelling listing...");

      try {
        await cancelListingFlow(
          { cancel: actionsHook.cancel },
          {
            account: account as any,
            collectionAddress: BEASTS_COLLECTION_ADDRESS,
            tokenId: listing.tokenId,
            orderId: listing.orderId ?? 0,
          }
        );

        toast.success("Listing cancelled successfully!", { id: toastId });

        // Optimistically remove listing from UI before indexer catches up
        dataHook.markListingAsSold(listing.listingId);

        // Transaction is tracked automatically by the indexer
        await dataHook.refetchOrders();
        await dataHook.reloadUserBeasts();
      } catch (error) {
        if (isUserRejection(error)) {
          toast.info("Listing cancellation cancelled", { id: toastId });
        } else {
          const errorMessage = (error as Error).message || "Failed to cancel listing";
          toast.error(errorMessage, { id: toastId });
        }
      }
    },
    [account, actionsHook, dataHook]
  );

  /**
   * Marketplace-specific action buttons for detail modal
   */
  const detailModalActionSlot = useMemo(() => {
    if (!detailModalListing) return null;

    const isOwner = address?.toLowerCase() === detailModalListing.seller?.toLowerCase();
    const listing = detailModalListing;

    if (isOwner) {
      // Owner view: Edit and Cancel buttons
      return (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="default"
            size="default"
            onClick={() => {
              handleCloseDetailModal();
              setEditingListing(listing);
              setEditDialogOpen(true);
            }}
            className="w-full sm:w-auto font-semibold tracking-wide cursor-pointer"
          >
            Edit Listing
          </Button>
          {listing.active && (
            <Button
              variant="destructive"
              size="default"
              onClick={() => {
                handleCloseDetailModal();
                handleCancelListing(listing);
              }}
              className="w-full sm:w-auto font-semibold tracking-wide cursor-pointer"
            >
              Cancel Listing
            </Button>
          )}
        </div>
      );
    }

    // Non-owner view: Buy Now, Add to Cart, Make Offer
    return (
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          variant="default"
          size="default"
          onClick={() => {
            handleCloseDetailModal();
            setPurchasingListing(listing);
            setPurchaseConfirmOpen(true);
          }}
          disabled={!listing.active}
          className="w-full sm:w-auto font-semibold tracking-wide bg-lsGold/20 text-lsGold border border-lsGold hover:bg-lsGold/30 cursor-pointer"
        >
          Buy Now - {formatPriceLabel(listing)}
        </Button>
        <Button
          variant="outline"
          size="default"
          onClick={() => {
            handleCloseDetailModal();
            cartsHook.handleAddToPurchaseCart(listing);
          }}
          disabled={!listing.active}
          className="w-full sm:w-auto font-semibold tracking-wide cursor-pointer"
        >
          {cartsHook.isInPurchaseCart(listing.listingId) ? "In Cart" : "Add to Cart"}
        </Button>
        <Button
          variant="outline"
          size="default"
          onClick={() => {
            handleCloseDetailModal();
            setOfferBeast(listing.beast ?? null);
            setOfferTokenId(listing.tokenId);
            setMakeOfferOpen(true);
          }}
          className="w-full sm:w-auto font-semibold tracking-wide cursor-pointer"
        >
          Make Offer
        </Button>
      </div>
    );
  }, [detailModalListing, address, formatPriceLabel, cartsHook, handleCloseDetailModal, handleCancelListing]);

  return (
    <AppLayout topBar={<TopBar />}>
      <div className="space-y-4">
        {/* Header Section with Stats */}
        <section className="relative overflow-hidden rounded-xl border border-gray-800/50 bg-gradient-to-br from-[#0b0b0f] via-[#0f0f13] to-[#0b0b0f] p-3 sm:p-6 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-lsGold/5 via-transparent to-[#8bff72]/5 opacity-50" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(208,201,141,0.1),transparent_50%)]" />

          <div className="relative flex flex-col gap-3 sm:gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-1 sm:space-y-2">
              <h1 className="bg-gradient-to-r from-[#f9e08a] via-[#fbdc5e] to-[#39ff14] bg-clip-text text-xl sm:text-3xl font-bold uppercase tracking-wider text-transparent drop-shadow-[0_0_15px_rgba(251,234,160,0.3)]">
                Beast Marketplace
              </h1>
              <p className="text-xs sm:text-sm text-gray-300 leading-relaxed hidden xs:block">
                Discover, buy, sell, and make offers on unique NFTs from Loot Survivor.
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:gap-3 lg:w-auto lg:grid-cols-2 xl:grid-cols-4">
              {heroStats.map((stat) => (
                <div
                  key={stat.label}
                  className={`${stat.bgGradient} ${stat.borderColor} backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-md min-h-[55px] sm:min-h-[75px] flex flex-col relative overflow-hidden rounded-lg border p-1.5 sm:p-2.5 min-w-0 sm:min-w-[110px]`}
                >
                  <div className="flex flex-col items-center text-center gap-0 sm:gap-0.5 mb-0.5 sm:mb-1 relative z-10">
                    <span className="text-[10px] sm:text-xs flex-shrink-0">{stat.icon}</span>
                    <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-muted-foreground font-medium truncate">
                      {stat.label}
                    </p>
                  </div>
                  <div className="flex-1 flex flex-col justify-center text-center relative z-10">
                    {stat.isFloorPrice ? (
                      <>
                        <p
                          className="text-sm sm:text-base font-bold leading-none whitespace-nowrap overflow-hidden text-ellipsis px-0.5 sm:px-1"
                          style={{ color: stat.color }}
                        >
                          {stat.value}
                        </p>
                        {stat.currency && (
                          <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">{stat.currency}</p>
                        )}
                      </>
                    ) : (
                      <p
                        className="text-sm sm:text-base font-bold leading-none whitespace-nowrap overflow-hidden text-ellipsis px-0.5 sm:px-1"
                        style={{ color: stat.color }}
                      >
                        {stat.value}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Loading indicators */}
        {(dataHook.ordersLoading || dataHook.ordersFetching) && (
          <div className="rounded-md border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
            Loading marketplace orders…
          </div>
        )}

        {dataHook.hydratingListings && dataHook.listings.length > 0 && (
          <div className="rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
            Loading beast metadata for listings…
          </div>
        )}


        {/* Filters toolbar */}

        {/* View toggle and controls */}
        <div className="flex flex-col gap-2 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
          <ViewToggle value={filtersHook.activeTab} onChange={filtersHook.setActiveTab} />
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {filterControls}
            {filtersHook.activeTab === "my" && (
              <Button
                variant="outline"
                size="sm"
                className="text-[10px] sm:text-xs h-7 sm:h-9 px-2 sm:px-4"
                onClick={async () => {
                  dataHook.reloadUserBeasts();
                  refetchOffers();
                  refetchOffersReceived();
                  refetchUserMadeOffers();
                  // Use invalidation to force refetch even if data is "fresh"
                  await invalidateSales();
                }}
                disabled={dataHook.userBeastsLoading}
              >
                {dataHook.userBeastsLoading ? "…" : "Refresh"}
              </Button>
            )}
            {filtersHook.activeTab === "explore" && exploreSubTab === "recent-sold" && (
              <Button
                variant="outline"
                size="sm"
                className="text-[10px] sm:text-xs h-7 sm:h-9 px-2 sm:px-4"
                onClick={async () => {
                  await invalidateRecentSales();
                }}
              >
                Refresh
              </Button>
            )}
          </div>
        </div>

        {/* Main content area */}
        {filtersHook.activeTab === "explore" ? (
          <section className="space-y-4">
            <div className="overflow-x-auto -mx-2 px-2 scrollbar-hide">
              <div className="inline-flex rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-1 min-w-max">
                <button
                  type="button"
                  onClick={() => setExploreSubTab("browse")}
                  className={cn(
                    "rounded-md px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition whitespace-nowrap",
                    exploreSubTab === "browse"
                      ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                      : "text-gray-400 hover:text-lsGold"
                  )}
                >
                  Listings
                </button>
                <button
                  type="button"
                  onClick={() => setExploreSubTab("recent-listed")}
                  className={cn(
                    "rounded-md px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition whitespace-nowrap",
                    exploreSubTab === "recent-listed"
                      ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                      : "text-gray-400 hover:text-lsGold"
                  )}
                >
                  Recent
                </button>
                <button
                  type="button"
                  onClick={() => setExploreSubTab("recent-sold")}
                  className={cn(
                    "rounded-md px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition whitespace-nowrap",
                    exploreSubTab === "recent-sold"
                      ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                      : "text-gray-400 hover:text-lsGold"
                  )}
                >
                  Sold
                </button>
                <button
                  type="button"
                  onClick={() => setExploreSubTab("activity")}
                  className={cn(
                    "rounded-md px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition whitespace-nowrap",
                    exploreSubTab === "activity"
                      ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                      : "text-gray-400 hover:text-lsGold"
                  )}
                >
                  Activity
                </button>
              </div>
            </div>

            {exploreSubTab === "browse" ? (
              <>
                {dataHook.listingsError ? (
                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                    <p className="text-sm text-yellow-200">{dataHook.listingsError}</p>
                    <Button
                      onClick={() => dataHook.refetchOrders()}
                      variant="outline"
                      size="sm"
                      className="mt-3"
                    >
                      Retry
                    </Button>
                  </div>
                ) : dataHook.ordersLoading || dataHook.ordersFetching || dataHook.hydratingListings ? (
                  <p className="text-xs text-gray-400">Loading listings…</p>
                ) : filtersHook.sortedListings.length === 0 ? (
                  <p className="rounded-lg border border-gray-800 bg-black/50 px-4 py-8 text-center text-xs text-gray-400">
                    No active listings match your filters yet.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-1.5 xs:gap-2 sm:gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {filtersHook.listingsToRender.map((listing) => (
                        <ListingCard
                          key={`${listing.listingId}-${listing.tokenId}`}
                          beast={listing.beast}
                          tokenId={listing.tokenId}
                          priceLabel={formatPriceLabel(listing)}
                          subtitlePriceLabel={formatSubtitlePrice(listing)}
                          tokenLogoUrl={getTokenLogoUrl(listing)}
                          status={listing.status}
                          buyDisabled={!listing.active || !address}
                          inCart={cartsHook.isInPurchaseCart(listing.listingId)}
                          primaryActionLabel={cartsHook.isInPurchaseCart(listing.listingId) ? "In Cart" : undefined}
                          onCardClick={() => handleCardClick(listing)}
                          onBuyNow={() => {
                            setPurchasingListing(listing);
                            setPurchaseConfirmOpen(true);
                          }}
                          onAddToCart={() => cartsHook.handleAddToPurchaseCart(listing)}
                          onMakeOffer={() => {
                            setOfferBeast(listing.beast ?? null);
                            setOfferTokenId(listing.tokenId);
                            setMakeOfferOpen(true);
                          }}
                          onViewOffers={() => {
                            setSelectedListingForOffers(listing);
                            setOffersDialogOpen(true);
                          }}
                          ownedByUser={address?.toLowerCase() === listing.seller?.toLowerCase()}
                          onEdit={() => {
                            setEditingListing(listing);
                            setEditDialogOpen(true);
                          }}
                          onCancel={listing.active ? () => handleCancelListing(listing) : undefined}
                        />
                      ))}
                    </div>
                    <Pagination
                      currentPage={filtersHook.currentPage}
                      totalPages={filtersHook.totalPages}
                      totalItems={filtersHook.sortedListings.length}
                      itemsPerPage={filtersHook.itemsPerPage}
                      onPageChange={filtersHook.setCurrentPage}
                    />
                  </>
                )}
              </>
            ) : exploreSubTab === "recent-listed" ? (
              <>
                {filtersHook.namedRecentListings.length === 0 ? (
                  <p className="rounded-lg border border-gray-800 bg-black/50 px-4 py-8 text-center text-xs text-gray-400">
                    No recent listings available.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {/* View Mode Toggle */}
                    <div className="flex justify-end">
                      <div className="inline-flex rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-0.5">
                        <button
                          type="button"
                          onClick={() => setRecentViewMode("cards")}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition",
                            recentViewMode === "cards"
                              ? "bg-lsGold/20 text-lsGold"
                              : "text-gray-400 hover:text-lsGold"
                          )}
                        >
                          <LayoutGrid className="h-3.5 w-3.5" />
                          Cards
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecentViewMode("table")}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition",
                            recentViewMode === "table"
                              ? "bg-lsGold/20 text-lsGold"
                              : "text-gray-400 hover:text-lsGold"
                          )}
                        >
                          <List className="h-3.5 w-3.5" />
                          Table
                        </button>
                      </div>
                    </div>

                    {recentViewMode === "cards" ? (
                      <div className="grid grid-cols-3 gap-1.5 xs:gap-2 sm:gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {filtersHook.namedRecentListings.map((listing) => (
                          <ListingCard
                            key={`recent-${listing.listingId}`}
                            beast={listing.beast}
                            tokenId={listing.tokenId}
                            priceLabel={formatPriceLabel(listing)}
                            subtitlePriceLabel={formatSubtitlePrice(listing)}
                            tokenLogoUrl={getTokenLogoUrl(listing)}
                            status={listing.status}
                            buyDisabled={!listing.active || !address}
                            inCart={cartsHook.isInPurchaseCart(listing.listingId)}
                            primaryActionLabel={cartsHook.isInPurchaseCart(listing.listingId) ? "In Cart" : undefined}
                            onCardClick={() => handleCardClick(listing)}
                            onBuyNow={() => {
                              setPurchasingListing(listing);
                              setPurchaseConfirmOpen(true);
                            }}
                            onAddToCart={() => cartsHook.handleAddToPurchaseCart(listing)}
                            onMakeOffer={() => {
                              setOfferBeast(listing.beast ?? null);
                              setOfferTokenId(listing.tokenId);
                              setMakeOfferOpen(true);
                            }}
                            onViewOffers={() => {
                              setSelectedListingForOffers(listing);
                              setOffersDialogOpen(true);
                            }}
                            ownedByUser={address?.toLowerCase() === listing.seller?.toLowerCase()}
                            onEdit={() => {
                              setEditingListing(listing);
                              setEditDialogOpen(true);
                            }}
                            onCancel={listing.active ? () => handleCancelListing(listing) : undefined}
                          />
                        ))}
                      </div>
                    ) : (
                      /* Table View */
                      <div className="rounded-lg border border-gray-800 bg-black/30 overflow-hidden overflow-x-auto">
                        <table className="w-full text-xs min-w-[600px]">
                          <thead className="bg-gray-900/50 border-b border-gray-800">
                            <tr>
                              <th className="px-3 py-2.5 text-left font-semibold text-gray-300">Listed</th>
                              <th className="px-3 py-2.5 text-left font-semibold text-gray-300">Beast</th>
                              <th className="px-3 py-2.5 text-left font-semibold text-gray-300">Price</th>
                              <th className="px-3 py-2.5 text-left font-semibold text-gray-300">Seller</th>
                              <th className="px-3 py-2.5 text-right font-semibold text-gray-300">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtersHook.namedRecentListings.map((listing) => {
                              const isOwner = address?.toLowerCase() === listing.seller?.toLowerCase();
                              const usdPrice = formatSubtitlePrice(listing);
                              return (
                                <tr
                                  key={`recent-table-${listing.listingId}`}
                                  className="border-b border-gray-800/50 hover:bg-gray-900/30 transition-colors"
                                >
                                  <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">
                                    {listing.createdAt ? formatRelativeTime(listing.createdAt) : "—"}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <button
                                      type="button"
                                      onClick={() => handleCardClick(listing)}
                                      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                                    >
                                      <div className="w-8 h-8 rounded overflow-hidden bg-gray-800 flex-shrink-0">
                                        {listing.beast?.image ? (
                                          <img
                                            src={listing.beast.image}
                                            alt={listing.beast.name || "Beast"}
                                            className="w-full h-full object-contain"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-gray-600 text-[8px]">
                                            ?
                                          </div>
                                        )}
                                      </div>
                                      <span className="text-white font-medium truncate max-w-[120px]">
                                        {listing.beast?.name || `Beast #${listing.tokenId}`}
                                      </span>
                                    </button>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex flex-col">
                                      <span className="text-lsGold font-semibold">
                                        {formatPriceLabel(listing)}
                                      </span>
                                      {usdPrice && (
                                        <span className="text-gray-500 text-[10px]">
                                          ${usdPrice}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-gray-400">
                                    {ownerUsernames[listing.seller?.toLowerCase()] ||
                                      `${listing.seller?.slice(0, 6)}...${listing.seller?.slice(-4)}`}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {isOwner ? (
                                        <>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2.5 text-[10px] font-semibold"
                                            onClick={() => {
                                              setEditingListing(listing);
                                              setEditDialogOpen(true);
                                            }}
                                          >
                                            Edit
                                          </Button>
                                          {listing.active && (
                                            <Button
                                              variant="destructive"
                                              size="sm"
                                              className="h-7 px-2.5 text-[10px] font-semibold"
                                              onClick={() => handleCancelListing(listing)}
                                            >
                                              Cancel
                                            </Button>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2.5 text-[10px] font-semibold bg-lsGold/10 text-lsGold border-lsGold/50 hover:bg-lsGold/20"
                                            onClick={() => {
                                              setPurchasingListing(listing);
                                              setPurchaseConfirmOpen(true);
                                            }}
                                            disabled={!listing.active}
                                          >
                                            Buy
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2.5 text-[10px] font-semibold"
                                            onClick={() => {
                                              setOfferBeast(listing.beast ?? null);
                                              setOfferTokenId(listing.tokenId);
                                              setMakeOfferOpen(true);
                                            }}
                                          >
                                            Offer
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : exploreSubTab === "recent-sold" ? (
              <>
                {namedRecentSales.length === 0 ? (
                  <p className="rounded-lg border border-gray-800 bg-black/50 px-4 py-8 text-center text-xs text-gray-400">
                    No recent sales available.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {namedRecentSales.map(({ sale, beast, tokenId, price, from, to, time }, idx) => {
                      const token = sale.order?.currency ? getPaymentTokenByAddress(sale.order.currency) : null;
                      const symbol = token?.symbol ?? 'STRK';
                      return (
                        <div
                          key={`sale-${idx}`}
                          className="rounded-lg border border-gray-800 bg-gradient-to-r from-black/40 to-gray-900/20 p-3 flex items-center gap-4 hover:border-gray-700 transition-colors"
                        >
                          {/* Beast Image */}
                          <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-gray-900/50 to-black/50 border border-gray-800">
                            {beast?.image ? (
                              <img
                                src={beast.image}
                                alt={beast.name || `Beast #${tokenId}`}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                                No img
                              </div>
                            )}
                          </div>
                          {/* Sale Details */}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white truncate">{beast?.name || `Beast #${tokenId}`}</p>
                            <p className="text-sm text-lsGold font-medium">
                              {formatPrice(price, symbol)}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {from.slice(0, 6)}...{from.slice(-4)} → {to.slice(0, 6)}...{to.slice(-4)}
                            </p>
                          </div>
                          {/* Date */}
                          <div className="flex-shrink-0 text-right">
                            <p className="text-xs text-gray-500">
                              {new Date(time * 1000).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              /* Activity Tab - Combined listings and sales table */
              <div className="rounded-lg border border-gray-800 bg-black/30 overflow-hidden overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                  <thead className="bg-gray-900/50 border-b border-gray-800">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-300">Type</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-300">Time</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-300">Beast</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-300">Price</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-300">From / Seller</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Combine listings and sales, sorted by time */}
                    {(() => {
                      // Build combined activity entries
                      type ActivityEntry = {
                        type: "listing" | "sale";
                        timestamp: number;
                        beast: typeof filtersHook.namedRecentListings[0]["beast"] | null;
                        tokenId: string;
                        price: string;
                        symbol: string;
                        usdPrice?: string;
                        from: string;
                        to?: string;
                        listing?: typeof filtersHook.namedRecentListings[0];
                        sale?: typeof namedRecentSales[0];
                      };

                      const activities: ActivityEntry[] = [];

                      // Add listings
                      for (const listing of filtersHook.namedRecentListings) {
                        const token = listing.paymentToken ? getPaymentTokenByAddress(listing.paymentToken) : null;
                        activities.push({
                          type: "listing",
                          timestamp: listing.createdAt || 0,
                          beast: listing.beast,
                          tokenId: listing.tokenId,
                          price: formatPriceLabel(listing),
                          symbol: token?.symbol ?? "STRK",
                          usdPrice: formatSubtitlePrice(listing),
                          from: listing.seller,
                          listing,
                        });
                      }

                      // Add sales
                      for (const saleData of namedRecentSales) {
                        const token = saleData.sale.order?.currency ? getPaymentTokenByAddress(saleData.sale.order.currency) : null;
                        activities.push({
                          type: "sale",
                          timestamp: saleData.time,
                          beast: saleData.beast,
                          tokenId: saleData.tokenId,
                          price: formatPrice(saleData.price, token?.symbol ?? "STRK"),
                          symbol: token?.symbol ?? "STRK",
                          from: saleData.from,
                          to: saleData.to,
                          sale: saleData,
                        });
                      }

                      // Sort by timestamp descending
                      activities.sort((a, b) => b.timestamp - a.timestamp);

                      // Take top 100
                      const topActivities = activities.slice(0, 100);

                      if (topActivities.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                              No recent activity available.
                            </td>
                          </tr>
                        );
                      }

                      return topActivities.map((activity, idx) => (
                        <tr
                          key={`activity-${activity.type}-${activity.tokenId}-${idx}`}
                          className="border-b border-gray-800/50 hover:bg-gray-900/30 transition-colors"
                        >
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold",
                                activity.type === "listing"
                                  ? "bg-blue-500/20 text-blue-300"
                                  : "bg-green-500/20 text-green-300"
                              )}
                            >
                              {activity.type === "listing" ? "Listed" : "Sold"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">
                            {activity.timestamp ? formatRelativeTime(activity.timestamp) : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (activity.listing) {
                                  handleCardClick(activity.listing);
                                }
                              }}
                              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                              disabled={!activity.listing}
                            >
                              <div className="w-8 h-8 rounded overflow-hidden bg-gray-800 flex-shrink-0">
                                {activity.beast?.image ? (
                                  <img
                                    src={activity.beast.image}
                                    alt={activity.beast.name || "Beast"}
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-[8px]">
                                    ?
                                  </div>
                                )}
                              </div>
                              <span className="text-white font-medium truncate max-w-[120px]">
                                {activity.beast?.name || `Beast #${activity.tokenId}`}
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col">
                              <span className="text-lsGold font-semibold">{activity.price}</span>
                              {activity.usdPrice && (
                                <span className="text-gray-500 text-[10px]">${activity.usdPrice}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-400">
                            <div className="flex flex-col">
                              <span>
                                {ownerUsernames[activity.from?.toLowerCase()] ||
                                  `${activity.from?.slice(0, 6)}...${activity.from?.slice(-4)}`}
                              </span>
                              {activity.to && (
                                <span className="text-[10px] text-gray-500">
                                  → {ownerUsernames[activity.to?.toLowerCase()] ||
                                    `${activity.to?.slice(0, 6)}...${activity.to?.slice(-4)}`}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {activity.type === "listing" && activity.listing ? (
                                address?.toLowerCase() === activity.listing.seller?.toLowerCase() ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2.5 text-[10px] font-semibold"
                                      onClick={() => {
                                        setEditingListing(activity.listing!);
                                        setEditDialogOpen(true);
                                      }}
                                    >
                                      Edit
                                    </Button>
                                    {activity.listing.active && (
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        className="h-7 px-2.5 text-[10px] font-semibold"
                                        onClick={() => handleCancelListing(activity.listing!)}
                                      >
                                        Cancel
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2.5 text-[10px] font-semibold bg-lsGold/10 text-lsGold border-lsGold/50 hover:bg-lsGold/20"
                                      onClick={() => {
                                        setPurchasingListing(activity.listing!);
                                        setPurchaseConfirmOpen(true);
                                      }}
                                      disabled={!activity.listing.active}
                                    >
                                      Buy
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2.5 text-[10px] font-semibold"
                                      onClick={() => {
                                        setOfferBeast(activity.listing!.beast ?? null);
                                        setOfferTokenId(activity.listing!.tokenId);
                                        setMakeOfferOpen(true);
                                      }}
                                    >
                                      Offer
                                    </Button>
                                  </>
                                )
                              ) : (
                                <span className="text-gray-500 text-[10px]">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            <div className="overflow-x-auto -mx-2 px-2 scrollbar-hide">
              <div className="inline-flex rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-1 min-w-max">
                <button
                  type="button"
                  onClick={() => setMyActivitySubTab("listings")}
                  className={cn(
                    "rounded-md px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition whitespace-nowrap",
                    myActivitySubTab === "listings"
                      ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                      : "text-gray-400 hover:text-lsGold"
                  )}
                >
                  Listings
                </button>
                <button
                  type="button"
                  onClick={() => setMyActivitySubTab("beasts")}
                  className={cn(
                    "rounded-md px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition whitespace-nowrap",
                    myActivitySubTab === "beasts"
                      ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                      : "text-gray-400 hover:text-lsGold"
                  )}
                >
                  Beasts
                </button>
                <button
                  type="button"
                  onClick={() => setMyActivitySubTab("offers")}
                  className={cn(
                    "rounded-md px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition whitespace-nowrap",
                    myActivitySubTab === "offers"
                      ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                      : "text-gray-400 hover:text-lsGold"
                  )}
                >
                  Offers
                  {visibleOffersReceived.length > 0 && (
                    <span className="ml-1 sm:ml-1.5 bg-purple-500/30 text-purple-300 text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full">
                      {visibleOffersReceived.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setMyActivitySubTab("transactions")}
                  className={cn(
                    "rounded-md px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition whitespace-nowrap",
                    myActivitySubTab === "transactions"
                      ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                      : "text-gray-400 hover:text-lsGold"
                  )}
                >
                  History
                </button>
              </div>
            </div>

            {myActivitySubTab === "listings" && (
              <>
                {filtersHook.myActiveListings.length === 0 ? (
                  <p className="rounded-lg border border-gray-800 bg-black/50 px-4 py-8 text-center text-xs text-gray-400">
                    You don't have any active listings yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 xs:gap-2 sm:gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {filtersHook.myActiveListings.map((listing) => (
                      <ListingCard
                        key={`my-${listing.listingId}`}
                        beast={listing.beast}
                        tokenId={listing.tokenId}
                        priceLabel={formatPriceLabel(listing)}
                        subtitlePriceLabel={formatSubtitlePrice(listing)}
                        tokenLogoUrl={getTokenLogoUrl(listing)}
                        status={listing.status}
                        ownedByUser={true}
                        onCardClick={() => handleCardClick(listing)}
                        onEdit={() => {
                          setEditingListing(listing);
                          setEditDialogOpen(true);
                        }}
                        onCancel={listing.active ? () => handleCancelListing(listing) : undefined}
                        onViewOffers={() => {
                          setSelectedListingForOffers(listing);
                          setOffersDialogOpen(true);
                        }}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {myActivitySubTab === "beasts" && (
              <>
                {dataHook.userBeastsLoading ? (
                  <p className="text-xs text-gray-400">Loading your beasts…</p>
                ) : dataHook.userBeastsError ? (
                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                    <p className="text-sm text-yellow-200">{dataHook.userBeastsError}</p>
                  </div>
                ) : filtersHook.sortedUserBeasts.length === 0 ? (
                  <p className="rounded-lg border border-gray-800 bg-black/50 px-4 py-8 text-center text-xs text-gray-400">
                    You don't own any beasts yet.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={filtersHook.showDuplicatesOnly}
                          onChange={(e) => filtersHook.setShowDuplicatesOnly(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-lsGold focus:ring-lsGold focus:ring-offset-gray-900"
                        />
                        <span className="text-xs font-medium text-gray-400 group-hover:text-lsGold transition-colors">
                          Show Duplicates Only
                        </span>
                      </label>
                      {cartsHook.cartBeasts.length > 0 && (
                        <Button
                          variant="outline"
                          onClick={() => setListDialogOpen(true)}
                          className="ml-auto"
                        >
                          List {cartsHook.cartBeasts.length} Beast{cartsHook.cartBeasts.length > 1 ? "s" : ""}
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 xs:gap-2 sm:gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {filtersHook.sortedUserBeasts.map((beast) => {
                        const rawTokenId = beast.id.split(":").pop() || beast.id;
                        // Convert hex tokenId to decimal string for comparison with listing tokenIds
                        const tokenId = rawTokenId.startsWith("0x")
                          ? BigInt(rawTokenId).toString()
                          : rawTokenId;
                        const isListed = filtersHook.alreadyListedTokenIds.has(tokenId);
                        const inCart = cartsHook.isInCart(beast.id);

                        return (
                          <ListingCard
                            key={beast.id}
                            beast={beast}
                            tokenId={tokenId}
                            inCart={inCart}
                            isAlreadyListed={isListed}
                            onCardClick={() => handleBeastClick(beast)}
                            onAddToCart={() => cartsHook.handleToggleCart(beast)}
                          />
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {myActivitySubTab === "offers" && (
              <>
                {(offersReceivedLoading || userMadeOffersLoading) ? (
                  <p className="text-xs text-gray-400">Loading offers...</p>
                ) : (enrichedOffersReceived.length === 0 && (!userMadeOffers || userMadeOffers.length === 0)) ? (
                  <p className="rounded-lg border border-gray-800 bg-black/50 px-4 py-8 text-center text-xs text-gray-400">
                    No offers yet. Make an offer on a beast or wait for offers on your beasts.
                  </p>
                ) : (
                  <div className="space-y-6">
                    {/* Offers Received Section */}
                    {enrichedOffersReceived.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                            Offers Received
                            <span className="bg-green-500/20 text-green-400 text-[10px] px-2 py-0.5 rounded-full">
                              {visibleOffersReceived.length}
                            </span>
                          </h3>
                          {hiddenOffersCount > 0 && (
                            <label className="flex items-center gap-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={showHiddenOffers}
                                onChange={(e) => setShowHiddenOffers(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-lsGold focus:ring-lsGold focus:ring-offset-gray-900"
                              />
                              <span className="text-xs font-medium text-gray-400 group-hover:text-lsGold transition-colors">
                                Show Hidden ({hiddenOffersCount})
                              </span>
                            </label>
                          )}
                        </div>
                        {visibleOffersReceived.length === 0 ? (
                          <p className="rounded-lg border border-gray-800 bg-black/50 px-4 py-4 text-center text-xs text-gray-400">
                            All offers are hidden. Check "Show Hidden" to view them.
                          </p>
                        ) : visibleOffersReceived.map((offer, idx) => {
                          const token = getPaymentTokenByAddress(offer.currency);
                          const symbol = token?.symbol ?? 'LORDS';
                          const priceFormatted = formatPrice(String(offer.price), symbol);
                          const expirationDate = new Date(offer.expiration * 1000);
                          const now = new Date();
                          const hoursRemaining = Math.floor((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60));
                          const daysRemaining = Math.floor(hoursRemaining / 24);
                          const beastName = offer.beastName || `Beast #${offer.tokenId}`;

                          return (
                            <div
                              key={`offer-received-${offer.id}-${idx}`}
                              className={cn(
                                "rounded-lg border p-4 transition-all",
                                offer.isHidden
                                  ? "border-gray-700/50 bg-gray-900/30 opacity-60"
                                  : "border-green-500/30 bg-green-500/5"
                              )}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="flex-shrink-0 text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded font-semibold">
                                      Offer Received
                                    </span>
                                    <p className="font-semibold text-white truncate">
                                      {beastName}
                                    </p>
                                    {idx === 0 && !offer.isHidden && (
                                      <span className="flex-shrink-0 text-[10px] bg-lsGold/20 text-lsGold px-2 py-0.5 rounded">
                                        Highest
                                      </span>
                                    )}
                                    {offer.isHidden && (
                                      <span className="flex-shrink-0 text-[10px] bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded">
                                        Hidden
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xl font-bold text-lsGold mb-2">
                                    {priceFormatted}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                                    <span>From: {offer.owner.slice(0, 6)}...{offer.owner.slice(-4)}</span>
                                    <span className="text-gray-600">•</span>
                                    <span>
                                      {daysRemaining > 1
                                        ? `Expires in ${daysRemaining} days`
                                        : hoursRemaining > 1
                                        ? `Expires in ${hoursRemaining} hours`
                                        : `Expires ${expirationDate.toLocaleString()}`}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex-shrink-0 flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleHideOffer(offer.id.toString())}
                                    className="text-gray-400 hover:text-white text-xs px-3"
                                  >
                                    {offer.isHidden ? "Unhide" : "Hide"}
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      // Convert to OrderModel format and open confirmation dialog
                                      const orderModel = {
                                        id: offer.id,
                                        identifier: offer.identifier,
                                        category: { value: CategoryType.Buy, into: () => 1 },
                                        status: { value: StatusType.Placed, into: () => 1 },
                                        expiration: offer.expiration,
                                        collection: offer.collection,
                                        tokenId: BigInt(offer.tokenId),
                                        quantity: offer.quantity,
                                        price: BigInt(offer.price),
                                        currency: offer.currency,
                                        owner: offer.owner,
                                      } as unknown as OrderModel;
                                      setOfferToAccept({
                                        offer: orderModel,
                                        beastName,
                                        priceFormatted,
                                        buyerAddress: offer.owner,
                                      });
                                      setAcceptOfferConfirmOpen(true);
                                    }}
                                    disabled={!!actionsHook.acceptingOfferId}
                                    className="bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-2"
                                  >
                                    Accept Offer
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Offers Made Section */}
                    {userMadeOffers && userMadeOffers.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                          Offers Made
                          <span className="bg-purple-500/20 text-purple-400 text-[10px] px-2 py-0.5 rounded-full">
                            {userMadeOffers.length}
                          </span>
                        </h3>
                        {userMadeOffers.map((offer, idx) => {
                          const token = getPaymentTokenByAddress(offer.currency);
                          const symbol = token?.symbol ?? 'LORDS';
                          const priceFormatted = formatPrice(String(offer.price), symbol);
                          const expirationDate = new Date(offer.expiration * 1000);
                          const now = new Date();
                          const hoursRemaining = Math.floor((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60));
                          const daysRemaining = Math.floor(hoursRemaining / 24);
                          const isExpired = expirationDate < now;

                          // Try to find beast name from listings
                          const matchingListing = dataHook.listings.find(l => l.tokenId === String(offer.tokenId));
                          const beastName = matchingListing?.beast?.name || `Beast #${offer.tokenId}`;

                          return (
                            <div
                              key={`offer-made-${offer.id}-${idx}`}
                              className={cn(
                                "rounded-lg border p-4 transition-all",
                                isExpired
                                  ? "border-gray-700/50 bg-gray-900/30 opacity-60"
                                  : "border-purple-500/30 bg-purple-500/5"
                              )}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="flex-shrink-0 text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded font-semibold">
                                      Offer Made
                                    </span>
                                    <p className="font-semibold text-white truncate">
                                      {beastName}
                                    </p>
                                    {isExpired && (
                                      <span className="flex-shrink-0 text-[10px] bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded">
                                        Expired
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xl font-bold text-lsGold mb-2">
                                    {priceFormatted}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                                    <span>Token #{offer.tokenId}</span>
                                    <span className="text-gray-600">•</span>
                                    <span>
                                      {isExpired
                                        ? `Expired ${expirationDate.toLocaleDateString()}`
                                        : daysRemaining > 1
                                        ? `Expires in ${daysRemaining} days`
                                        : hoursRemaining > 1
                                        ? `Expires in ${hoursRemaining} hours`
                                        : `Expires ${expirationDate.toLocaleString()}`}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex-shrink-0">
                                  <span className={cn(
                                    "text-xs px-3 py-1.5 rounded-md font-medium",
                                    isExpired ? "bg-gray-700/50 text-gray-400" : "bg-purple-500/20 text-purple-300"
                                  )}>
                                    {isExpired ? "Expired" : "Pending"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {myActivitySubTab === "transactions" && (
              <>
                {userTransactions.length === 0 ? (
                  <p className="rounded-lg border border-gray-800 bg-black/50 px-4 py-8 text-center text-xs text-gray-400">
                    No transaction history yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {/* Transaction Type Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-400 mr-1">Filter:</span>
                      <button
                        type="button"
                        onClick={() => setTransactionTypeFilter(null)}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer",
                          transactionTypeFilter === null
                            ? "bg-lsGold/20 text-lsGold border border-lsGold/50"
                            : "bg-gray-800/50 text-gray-400 border border-gray-700 hover:border-gray-600 hover:text-gray-300"
                        )}
                      >
                        All
                      </button>
                      {[
                        { type: "buy", label: "Buy", class: "bg-green-500/20 text-green-400 border-green-500/50", activeRing: "ring-2 ring-green-400/50" },
                        { type: "list", label: "List", class: "bg-blue-500/20 text-blue-400 border-blue-500/50", activeRing: "ring-2 ring-blue-400/50" },
                        { type: "sold", label: "Sold", class: "bg-green-500/20 text-green-400 border-green-500/50", activeRing: "ring-2 ring-green-400/50" },
                        { type: "offer-accepted", label: "Accepted Offer", class: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50", activeRing: "ring-2 ring-emerald-400/50" },
                        { type: "offer", label: "Offer", class: "bg-purple-500/20 text-purple-400 border-purple-500/50", activeRing: "ring-2 ring-purple-400/50" },
                        { type: "cancel", label: "Cancel", class: "bg-red-500/20 text-red-400 border-red-500/50", activeRing: "ring-2 ring-red-400/50" },
                      ].map(({ type, label, class: colorClass, activeRing }) => {
                        const count = userTransactions.filter(tx => tx.type === type).length;
                        if (count === 0) return null;
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setTransactionTypeFilter(transactionTypeFilter === type ? null : type)}
                            className={cn(
                              "px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer border",
                              colorClass,
                              transactionTypeFilter === type && activeRing
                            )}
                          >
                            {label} ({count})
                          </button>
                        );
                      })}
                    </div>
                    {/* Transactions Table */}
                    <div className="rounded-lg border border-gray-800 bg-black/30 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-900/50 border-b border-gray-800">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-300">Type</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-300">Beast</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-300">Price</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-300">Status</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-300">Tx</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-300">Expires</th>
                          </tr>
                        </thead>
                        <tbody>
                          {userTransactions
                            .filter(tx => transactionTypeFilter === null || tx.type === transactionTypeFilter)
                            .map((tx, idx) => {
                          const token = tx.paymentToken ? getPaymentTokenByAddress(tx.paymentToken) : null;
                          const symbol = token?.symbol ?? 'LORDS';

                          // Calculate USD value for price
                          let usdPriceStr: string | null = null;
                          if (tx.price && tx.paymentToken) {
                            const tokenInfo = getToken(tx.paymentToken);
                            if (tokenInfo?.usdPrice) {
                              const usdValue = tokenAmountToUsd(tx.price, tokenInfo.decimals, tokenInfo.usdPrice);
                              usdPriceStr = usdValue.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              });
                            }
                          }

                          // Determine type badge styling and label
                          const typeConfig: Record<string, { class: string; label: string }> = {
                            offer: { class: "bg-purple-500/20 text-purple-400", label: "Offer" },
                            list: { class: "bg-blue-500/20 text-blue-400", label: "List" },
                            buy: { class: "bg-green-500/20 text-green-400", label: "Buy" },
                            sell: { class: "bg-green-500/20 text-green-400", label: "Sell" },
                            sold: { class: "bg-green-500/20 text-green-400", label: "Sold" },
                            "offer-accepted": { class: "bg-emerald-500/20 text-emerald-400", label: "Accepted Offer" },
                            cancel: { class: "bg-red-500/20 text-red-400", label: "Cancel" },
                            edit: { class: "bg-yellow-500/20 text-yellow-400", label: "Edit" },
                          };
                          const typeBadgeClass = typeConfig[tx.type]?.class ?? "bg-lsGold/10 text-lsGold";
                          const typeLabel = typeConfig[tx.type]?.label ?? tx.type;

                          // Determine status badge styling
                          const statusBadgeClass = tx.status === "active"
                            ? "bg-green-500/20 text-green-400"
                            : tx.status === "expired"
                            ? "bg-gray-500/20 text-gray-400"
                            : tx.status === "completed"
                            ? "bg-blue-500/20 text-blue-400"
                            : tx.status === "cancelled"
                            ? "bg-red-500/20 text-red-400"
                            : "";

                          return (
                            <tr
                              key={`${tx.timestamp}-${tx.type}-${tx.tokenId}-${idx}`}
                              className="border-b border-gray-800 hover:bg-gray-900/30 transition-colors"
                            >
                              <td className="px-4 py-3">
                                <span className={cn("inline-block px-2 py-1 rounded text-[10px] font-semibold", typeBadgeClass)}>
                                  {typeLabel}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-300">
                                {tx.beastName || `Beast #${tx.tokenId}`}
                              </td>
                              <td className="px-4 py-3">
                                {tx.price ? (
                                  <div>
                                    <span className="text-gray-300">{formatPrice(tx.price, symbol)}</span>
                                    {usdPriceStr && (
                                      <span className="text-gray-500 text-[10px] ml-1">(${usdPriceStr})</span>
                                    )}
                                  </div>
                                ) : '-'}
                              </td>
                              <td className="px-4 py-3">
                                {tx.status ? (
                                  <span className={cn("inline-block px-2 py-1 rounded text-[10px] font-semibold uppercase", statusBadgeClass)}>
                                    {tx.status}
                                  </span>
                                ) : (
                                  <span className="text-gray-500">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {tx.txHash ? (
                                  <a
                                    href={`https://voyager.online/tx/${tx.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-lsGold hover:text-lsGold/80 hover:underline font-mono text-[10px]"
                                  >
                                    {tx.txHash.slice(0, 6)}…{tx.txHash.slice(-4)}
                                  </a>
                                ) : (
                                  <span className="text-gray-500">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-400">
                                {tx.expiration
                                  ? new Date(tx.expiration * 1000).toLocaleDateString()
                                  : '-'}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* Dialogs - Lazy loaded for better initial performance */}
        <Suspense fallback={null}>
          {listDialogOpen && (
            <CartListDialog
              open={listDialogOpen}
              onOpenChange={setListDialogOpen}
              beasts={cartsHook.cartBeasts}
              onRemoveBeast={cartsHook.handleRemoveFromCart}
              onListed={actionsHook.handleListed}
              onClearCart={cartsHook.handleClearCart}
              existingListings={filtersHook.sortedListings}
            />
          )}

          {editDialogOpen && (
            <EditListingDialog
              open={editDialogOpen}
              onOpenChange={setEditDialogOpen}
              listing={editingListing}
              account={account}
              editListing={actionsHook.editListing}
              onEdited={actionsHook.handleListed}
            />
          )}

          {purchaseConfirmOpen && (
            <PurchaseConfirmDialog
              open={purchaseConfirmOpen}
              onOpenChange={setPurchaseConfirmOpen}
              listing={purchasingListing}
              priceLabel={
                purchasingListing
                  ? formatPrice(
                      purchasingListing.price,
                      getPaymentTokenByAddress(purchasingListing.paymentToken)?.symbol || "STRK"
                    )
                  : ""
              }
              isProcessing={!!actionsHook.buyingListingId}
              onConfirm={() => {
                if (purchasingListing) {
                  actionsHook.handlePurchase(purchasingListing);
                }
                setPurchaseConfirmOpen(false);
              }}
            />
          )}

          {purchaseCartOpen && (
            <PurchaseCartDialog
              open={purchaseCartOpen}
              onOpenChange={setPurchaseCartOpen}
              listings={cartsHook.purchaseCart}
              onRemove={cartsHook.handleRemoveFromPurchaseCart}
              onClearAll={cartsHook.handleClearPurchaseCart}
              onPurchaseAll={(validListings) =>
                actionsHook.handlePurchaseAll(
                  validListings ?? cartsHook.purchaseCart,
                  cartsHook.handleRemoveFromPurchaseCart
                ).then((success) => {
                  if (success) setPurchaseCartOpen(false);
                })
              }
              isProcessing={actionsHook.purchasingBatch}
            />
          )}

          {makeOfferOpen && (
            <MakeOfferDialog
              open={makeOfferOpen}
              onOpenChange={setMakeOfferOpen}
              beast={offerBeast}
              tokenId={offerTokenId}
              onOfferMade={() => setMakeOfferOpen(false)}
            />
          )}

          {offersDialogOpen && (
            <OffersDialog
              open={offersDialogOpen}
              onOpenChange={setOffersDialogOpen}
              tokenId={selectedListingForOffers?.tokenId || ""}
              orders={offersForToken}
              isOwner={
                !!address &&
                !!selectedListingForOffers?.seller &&
                address.toLowerCase() === selectedListingForOffers.seller.toLowerCase()
              }
              isLoading={offersLoading}
              onAcceptOffer={(order) => {
                actionsHook.handleAcceptOffer(order).then((success) => {
                  if (success) setOffersDialogOpen(false);
                });
              }}
              isAccepting={!!actionsHook.acceptingOfferId}
            />
          )}
        </Suspense>

        {/* Accept Offer Confirmation Dialog */}
        <Dialog open={acceptOfferConfirmOpen} onOpenChange={setAcceptOfferConfirmOpen}>
          <DialogContent className="bg-[#0b0b0f] border-gray-800 max-w-md">
            <DialogHeader>
              <DialogTitle>Accept Offer</DialogTitle>
              <DialogDescription>
                Are you sure you want to accept this offer?
              </DialogDescription>
            </DialogHeader>
            {offerToAccept && (
              <div className="space-y-4">
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Beast</p>
                    <p className="text-white font-semibold">{offerToAccept.beastName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Offer Amount</p>
                    <p className="text-xl font-bold text-green-400">{offerToAccept.priceFormatted}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Buyer</p>
                    <p className="text-sm text-gray-300 font-mono">
                      {offerToAccept.buyerAddress.slice(0, 10)}...{offerToAccept.buyerAddress.slice(-8)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  By accepting this offer, your beast will be transferred to the buyer and you will receive the payment.
                </p>
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAcceptOfferConfirmOpen(false);
                      setOfferToAccept(null);
                    }}
                    disabled={!!actionsHook.acceptingOfferId}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (offerToAccept) {
                        actionsHook.handleAcceptOffer(offerToAccept.offer).then((success) => {
                          if (success) {
                            setAcceptOfferConfirmOpen(false);
                            setOfferToAccept(null);
                          }
                        });
                      }
                    }}
                    disabled={!!actionsHook.acceptingOfferId}
                    className="bg-green-600 hover:bg-green-500 text-white"
                  >
                    {actionsHook.acceptingOfferId ? "Accepting..." : "Confirm & Accept"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Beast Detail Modal */}
        <Suspense fallback={null}>
          {detailModalBeast && (
            <BeastModal
              beast={detailModalBeast}
              ownerUsernames={ownerUsernames}
              onClose={handleCloseDetailModal}
              customActionSlot={detailModalActionSlot}
              listingExpiration={detailModalListing?.expiration}
            />
          )}
        </Suspense>

        <FiltersDrawer
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          attributeFilters={filtersHook.attributeFilters}
          availableFilters={dataHook.availableFilters}
          filtersLoading={dataHook.filtersLoading}
          filtersError={dataHook.filtersError}
          onFilterChange={filtersHook.handleFilterChange}
          onResetFilters={filtersHook.handleResetFilters}
        />

        <Suspense fallback={null}>
          {unifiedCartOpen && (
            <UnifiedCartDialog
              open={unifiedCartOpen}
              onOpenChange={setUnifiedCartOpen}
              buyItems={cartsHook.purchaseCart}
              listBeasts={cartsHook.cartBeasts}
              beastPrices={cartsHook.beastPrices}
              onRemoveBuyItem={cartsHook.handleRemoveFromPurchaseCart}
              onRemoveListBeast={cartsHook.handleRemoveFromCart}
              onUpdateBeastPrice={cartsHook.handleUpdateBeastPrice}
              onClearAll={() => {
                cartsHook.setCartBeasts([]);
                cartsHook.setPurchaseCart([]);
                cartsHook.setBeastPrices(new Map());
              }}
              onExecuteAll={(validBuyItems) =>
                actionsHook.handleExecuteUnifiedCart(
                  cartsHook.cartBeasts,
                  cartsHook.purchaseCart,
                  cartsHook.beastPrices,
                  validBuyItems
                ).then((success) => {
                  if (success) setUnifiedCartOpen(false);
                })
              }
              isProcessing={actionsHook.purchasingBatch || actionsHook.listingBatch}
              selectedToken={selectedPaymentToken}
            />
          )}
        </Suspense>

        {/* Floating Cart Button */}
        {(cartsHook.cartBeasts.length > 0 || cartsHook.purchaseCart.length > 0) && (
          <button
            onClick={() => {
              // Smart cart button - opens the appropriate dialog based on cart contents
              const hasListings = cartsHook.cartBeasts.length > 0;
              const hasPurchases = cartsHook.purchaseCart.length > 0;

              if (hasListings && !hasPurchases) {
                // Only beasts to list - open List dialog
                setListDialogOpen(true);
              } else if (hasPurchases && !hasListings) {
                // Only purchases - open Purchase Cart dialog
                setPurchaseCartOpen(true);
              } else {
                // Both - this is not supported yet, show message
                toast.error("Please complete listings and purchases separately. Use the 'List X Beasts' button for listings.");
              }
            }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-amber-600 text-white rounded-full shadow-2xl hover:shadow-3xl hover:scale-110 transition-all duration-300 font-semibold text-sm group animate-bounce"
            style={{
              animationDuration: "2s",
              animationIterationCount: "3",
            }}
          >
            <ShoppingCart className="h-5 w-5 group-hover:rotate-12 transition-transform" />
            <span className="flex items-center gap-1.5">
              Cart
              <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">
                {cartsHook.cartBeasts.length + cartsHook.purchaseCart.length}
              </span>
            </span>
          </button>
        )}
      </div>
    </AppLayout>
  );
}
