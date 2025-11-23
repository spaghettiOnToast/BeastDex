import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "@starknet-react/core";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import { Button } from "../components/ui/button";
import ListingCard from "../components/marketplace/ListingCard";
import { useControllerUsernames } from "../hooks/useControllerUsernames";
import type { Listing } from "../services/marketplace/types";
import {
  getPaymentTokenByAddress,
  DEFAULT_PAYMENT_TOKEN,
  BEASTS_COLLECTION_ADDRESS,
} from "../services/marketplace/constants";
import { cancelListingFlow } from "../services/marketplace/flows";
import {
  useMarketplace,
  useMarketplaceActions,
  type OrderModel,
} from "@cartridge/marketplace";
import type { Beast } from "../services/beast";
import FiltersButton from "../components/filters/FiltersButton";
import { FiltersDrawer } from "../components/filters/FiltersDrawer";
import SortDropdown from "../components/sort/SortDropdown";
import { cn } from "../lib/utils";
import {
  formatPrice,
  formatPriceInSymbol,
} from "../utils/price";
import { usePriceRates } from "../services/marketplace/rates";
import CartListDialog from "../components/marketplace/CartListDialog";
import EditListingDialog from "../components/marketplace/EditListingDialog";
import PurchaseConfirmDialog from "../components/marketplace/PurchaseConfirmDialog";
import PurchaseCartDialog from "../components/marketplace/PurchaseCartDialog";
import MakeOfferDialog from "../components/marketplace/MakeOfferDialog";
import OffersDialog from "../components/marketplace/OffersDialog";
import UnifiedCartDialog from "../components/marketplace/UnifiedCartDialog";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";

// Import custom hooks and utilities
import { useMarketplaceData } from "./marketplace/hooks/useMarketplaceData";
import { useMarketplaceFilters } from "./marketplace/hooks/useMarketplaceFilters";
import { useMarketplaceCarts } from "./marketplace/hooks/useMarketplaceCarts";
import { useMarketplaceActions as useMarketplaceActionsHook } from "./marketplace/hooks/useMarketplaceActions";
import { ViewToggle } from "./marketplace/components/ViewToggle";
import { toBigInt } from "./marketplace/utils";
import type { DisplayCurrency, ExploreSubTab, MyActivitySubTab, TxEntry } from "./marketplace/types";

const VOYAGER_BASE = "https://voyager.online";

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
  const marketplace = useMarketplace();
  const marketplaceSDKActions = useMarketplaceActions();
  const { data: priceRates } = usePriceRates();

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
  const [offersForToken, setOffersForToken] = useState<OrderModel[]>([]);
  const [unifiedCartOpen, setUnifiedCartOpen] = useState(false);
  const [selectedPaymentToken] = useState(DEFAULT_PAYMENT_TOKEN);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("LORDS");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Data fetching hook
  const dataHook = useMarketplaceData(address, marketplace);

  // Filters hook
  const filtersHook = useMarketplaceFilters({
    listings: dataHook.listings,
    userBeasts: dataHook.userBeasts,
    recentListings: dataHook.recentListings,
    recentSales: dataHook.recentSales,
    priceRates,
    address,
    availableFilters: dataHook.availableFilters,
  });

  // Carts hook
  const cartsHook = useMarketplaceCarts({
    alreadyListedTokenIds: filtersHook.alreadyListedTokenIds,
  });

  // Actions hook
  const actionsHook = useMarketplaceActionsHook({
    account,
    refetchOrders: dataHook.refetchOrders,
    reloadUserBeasts: dataHook.reloadUserBeasts,
  });

  // Load username resolution for all sellers
  useControllerUsernames(filtersHook.ownerAddresses);

  // Reset offers when dialog closes
  useEffect(() => {
    if (!offersDialogOpen) {
      setOffersForToken([]);
    }
  }, [offersDialogOpen]);

  // Load recent listings when tab is active
  useEffect(() => {
    if (filtersHook.activeTab === "explore" && exploreSubTab === "recent-listed") {
      dataHook.loadRecentListings();
    }
  }, [filtersHook.activeTab, exploreSubTab]);

  // Load recent sales when tab is active
  useEffect(() => {
    if (filtersHook.activeTab === "explore" && exploreSubTab === "recent-sold") {
      dataHook.loadRecentSales();
    }
  }, [filtersHook.activeTab, exploreSubTab]);

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

      // Show price in user's chosen display currency if available
      if (
        displayCurrency &&
        priceRates &&
        fromSymbol.toUpperCase() !== displayCurrency.toUpperCase()
      ) {
        return formatPriceInSymbol(
          listing.price,
          fromSymbol,
          displayCurrency,
          priceRates as any
        );
      }

      // Otherwise show native listing token
      return formatPrice(listing.price, fromSymbol);
    },
    [displayCurrency, priceRates]
  );

  /**
   * Format subtitle price (always USDC equivalent)
   */
  const formatSubtitlePrice = useCallback(
    (listing: Listing) => {
      const token = getPaymentTokenByAddress(listing.paymentToken ?? undefined);
      const fromSymbol = token?.symbol ?? "STRK";

      if (!priceRates) return undefined;
      if (displayCurrency?.toUpperCase() === "USDC") return undefined;
      if (!displayCurrency && fromSymbol.toUpperCase() === "USDC") return undefined;

      return formatPriceInSymbol(
        listing.price,
        fromSymbol,
        "USDC",
        priceRates as any
      );
    },
    [displayCurrency, priceRates]
  );

  /**
   * Calculate floor price listing - only compare listings in the same currency
   * Shows floor for the most common currency
   */
  const floorListing = useMemo(() => {
    const activeListings = filtersHook.sortedListings.filter(
      (listing) => listing.active && listing.status === "active"
    );

    if (activeListings.length === 0) return null;

    // Group listings by currency
    const listingsByCurrency = new Map<string, Listing[]>();
    for (const listing of activeListings) {
      const currencyKey = listing.paymentToken?.toLowerCase() || "default";
      if (!listingsByCurrency.has(currencyKey)) {
        listingsByCurrency.set(currencyKey, []);
      }
      listingsByCurrency.get(currencyKey)!.push(listing);
    }

    // Find the currency with most listings
    let mostCommonCurrency = "";
    let maxCount = 0;
    for (const [currency, listings] of listingsByCurrency.entries()) {
      if (listings.length > maxCount) {
        maxCount = listings.length;
        mostCommonCurrency = currency;
      }
    }

    // Find floor price within that currency
    const currencyListings = listingsByCurrency.get(mostCommonCurrency) || [];
    let lowest: Listing | null = null;
    let lowestPrice: bigint | null = null;

    for (const listing of currencyListings) {
      try {
        const price = toBigInt(listing.price);
        if (lowestPrice === null || price < lowestPrice) {
          lowestPrice = price;
          lowest = listing;
        }
      } catch {
        continue;
      }
    }

    return lowest;
  }, [filtersHook.sortedListings]);

  const floorPriceLabel = useMemo(() => {
    return floorListing ? formatPriceLabel(floorListing) : "—";
  }, [floorListing, formatPriceLabel]);

  const uniqueSellers = useMemo(() => {
    return new Set(
      filtersHook.sortedListings
        .map((listing) => listing.seller?.toLowerCase?.() ?? "")
        .filter((seller) => seller.length > 0)
    ).size;
  }, [filtersHook.sortedListings]);

  const totalListingsCount = filtersHook.sortedListings.length;

  // Split floor price into value and currency for better display
  const floorPriceParts = useMemo(() => {
    if (!floorPriceLabel || floorPriceLabel === "—") {
      return { value: "—", currency: "" };
    }
    const parts = floorPriceLabel.trim().split(/\s+/);
    if (parts.length >= 2) {
      const currency = parts[parts.length - 1];
      const value = parts.slice(0, -1).join(" ");
      return { value, currency };
    }
    return { value: floorPriceLabel, currency: "" };
  }, [floorPriceLabel]);

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

      const toastId = toast.loading("Canceling listing...");

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

        toast.success("Listing canceled successfully!", { id: toastId });

        const cancelEntry: TxEntry = {
          type: "cancel",
          tokenId: listing.tokenId,
          timestamp: Date.now(),
          note: `${listing.beast?.name || `Beast #${listing.tokenId}`}`,
        };
        actionsHook.setMyTxs((prev): TxEntry[] => [cancelEntry, ...prev].slice(0, 100));

        await dataHook.refetchOrders();
        await dataHook.reloadUserBeasts();
      } catch (error) {
        const errorMessage = (error as Error).message || "Failed to cancel listing";
        toast.error(errorMessage, { id: toastId });
      }
    },
    [account, actionsHook, dataHook]
  );

  return (
    <AppLayout topBar={<TopBar />}>
      <div className="space-y-4">
        {/* Header Section with Stats */}
        <section className="relative overflow-hidden rounded-xl border border-gray-800/50 bg-gradient-to-br from-[#0b0b0f] via-[#0f0f13] to-[#0b0b0f] p-6 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-lsGold/5 via-transparent to-[#8bff72]/5 opacity-50" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(208,201,141,0.1),transparent_50%)]" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-2">
              <h1 className="bg-gradient-to-r from-[#f9e08a] via-[#fbdc5e] to-[#39ff14] bg-clip-text text-3xl font-bold uppercase tracking-wider text-transparent drop-shadow-[0_0_15px_rgba(251,234,160,0.3)]">
                Beast Marketplace
              </h1>
              <p className="text-sm text-gray-300 leading-relaxed">
                Discover, buy, sell, and make offers on unique NFTs from Loot Survivor.
              </p>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-2 xl:grid-cols-4">
              {heroStats.map((stat) => (
                <div
                  key={stat.label}
                  className={`${stat.bgGradient} ${stat.borderColor} backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-md min-h-[75px] flex flex-col relative overflow-hidden rounded-lg border p-2.5 min-w-[110px]`}
                >
                  <div className="flex flex-col items-center text-center gap-0.5 mb-1 relative z-10">
                    <span className="text-xs flex-shrink-0">{stat.icon}</span>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium truncate">
                      {stat.label}
                    </p>
                  </div>
                  <div className="flex-1 flex flex-col justify-center text-center relative z-10">
                    {stat.isFloorPrice ? (
                      <>
                        <p
                          className="text-base font-bold leading-none whitespace-nowrap overflow-hidden text-ellipsis px-1"
                          style={{ color: stat.color }}
                        >
                          {stat.value}
                        </p>
                        {stat.currency && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{stat.currency}</p>
                        )}
                      </>
                    ) : (
                      <p
                        className="text-base font-bold leading-none whitespace-nowrap overflow-hidden text-ellipsis px-1"
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

        {!dataHook.hydratingListings && dataHook.listings.length >= 450 && (
          <div className="rounded-md border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
            Showing first ~500 listings for performance. Use filters to narrow down results.
          </div>
        )}

        {/* Filters toolbar */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-300">
          <div className="flex items-center gap-2">
            <span>Display prices in:</span>
            <div className="inline-flex rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-1">
              {(["LORDS", "STRK", "ETH", "USDC", "SURVIVOR"] as const).map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setDisplayCurrency(sym)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wider transition",
                    displayCurrency === sym
                      ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white"
                      : "text-gray-400 hover:text-lsGold"
                  )}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* View toggle and controls */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <ViewToggle value={filtersHook.activeTab} onChange={filtersHook.setActiveTab} />
          <div className="flex flex-wrap items-center gap-3">
            {filterControls}
            {filtersHook.activeTab === "my" && (
              <Button
                variant="outline"
                onClick={() => dataHook.reloadUserBeasts()}
                disabled={dataHook.userBeastsLoading}
              >
                {dataHook.userBeastsLoading ? "Refreshing…" : "Refresh"}
              </Button>
            )}
          </div>
        </div>

        {/* Main content area */}
        {filtersHook.activeTab === "explore" ? (
          <section className="space-y-4">
            <div className="inline-flex rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-1">
              <button
                type="button"
                onClick={() => setExploreSubTab("browse")}
                className={cn(
                  "rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider transition",
                  exploreSubTab === "browse"
                    ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                    : "text-gray-400 hover:text-lsGold"
                )}
              >
                All Listings
              </button>
              <button
                type="button"
                onClick={() => setExploreSubTab("recent-listed")}
                className={cn(
                  "rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider transition",
                  exploreSubTab === "recent-listed"
                    ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                    : "text-gray-400 hover:text-lsGold"
                )}
              >
                Recently Listed
              </button>
              <button
                type="button"
                onClick={() => setExploreSubTab("recent-sold")}
                className={cn(
                  "rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider transition",
                  exploreSubTab === "recent-sold"
                    ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                    : "text-gray-400 hover:text-lsGold"
                )}
              >
                Recently Sold
              </button>
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
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {filtersHook.listingsToRender.map((listing) => (
                      <ListingCard
                        key={`${listing.listingId}-${listing.tokenId}`}
                        beast={listing.beast}
                        tokenId={listing.tokenId}
                        priceLabel={formatPriceLabel(listing)}
                        subtitlePriceLabel={formatSubtitlePrice(listing)}
                        status={listing.status}
                        buyDisabled={!listing.active}
                        inCart={cartsHook.isInPurchaseCart(listing.listingId)}
                        primaryActionLabel={cartsHook.isInPurchaseCart(listing.listingId) ? "In Cart" : undefined}
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
                )}
              </>
            ) : exploreSubTab === "recent-listed" ? (
              <>
                {dataHook.loadingRecentListings ? (
                  <p className="text-xs text-gray-400">Loading recent listings…</p>
                ) : filtersHook.namedRecentListings.length === 0 ? (
                  <p className="rounded-lg border border-gray-800 bg-black/50 px-4 py-8 text-center text-xs text-gray-400">
                    No recent listings available.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {filtersHook.namedRecentListings.map((listing) => (
                      <ListingCard
                        key={`recent-${listing.listingId}`}
                        beast={listing.beast}
                        tokenId={listing.tokenId}
                        priceLabel={formatPriceLabel(listing)}
                        subtitlePriceLabel={formatSubtitlePrice(listing)}
                        status={listing.status}
                        buyDisabled={!listing.active}
                        onBuyNow={() => {
                          setPurchasingListing(listing);
                          setPurchaseConfirmOpen(true);
                        }}
                        onAddToCart={() => cartsHook.handleAddToPurchaseCart(listing)}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {dataHook.loadingSales ? (
                  <p className="text-xs text-gray-400">Loading recent sales…</p>
                ) : filtersHook.namedRecentSales.length === 0 ? (
                  <p className="rounded-lg border border-gray-800 bg-black/50 px-4 py-8 text-center text-xs text-gray-400">
                    No recent sales available.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filtersHook.namedRecentSales.map(({ sale, beast }, idx) => (
                      <div
                        key={`sale-${idx}`}
                        className="rounded-lg border border-gray-800 bg-black/30 p-4 flex items-center gap-4"
                      >
                        <div className="flex-1">
                          <p className="font-semibold">{beast?.name || `Beast #${sale.order.tokenId}`}</p>
                          <p className="text-xs text-gray-400">
                            Sold for {formatPrice(sale.order.price.toString(), "STRK")}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500">
                          {new Date(sale.time * 1000).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            <div className="inline-flex rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-1">
              <button
                type="button"
                onClick={() => setMyActivitySubTab("listings")}
                className={cn(
                  "rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider transition",
                  myActivitySubTab === "listings"
                    ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                    : "text-gray-400 hover:text-lsGold"
                )}
              >
                My Listings
              </button>
              <button
                type="button"
                onClick={() => setMyActivitySubTab("beasts")}
                className={cn(
                  "rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider transition",
                  myActivitySubTab === "beasts"
                    ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                    : "text-gray-400 hover:text-lsGold"
                )}
              >
                My Beasts
              </button>
              <button
                type="button"
                onClick={() => setMyActivitySubTab("transactions")}
                className={cn(
                  "rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider transition",
                  myActivitySubTab === "transactions"
                    ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                    : "text-gray-400 hover:text-lsGold"
                )}
              >
                My Transactions
              </button>
            </div>

            {myActivitySubTab === "listings" && (
              <>
                {filtersHook.myActiveListings.length === 0 ? (
                  <p className="rounded-lg border border-gray-800 bg-black/50 px-4 py-8 text-center text-xs text-gray-400">
                    You don't have any active listings yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {filtersHook.myActiveListings.map((listing) => (
                      <ListingCard
                        key={`my-${listing.listingId}`}
                        beast={listing.beast}
                        tokenId={listing.tokenId}
                        priceLabel={formatPriceLabel(listing)}
                        subtitlePriceLabel={formatSubtitlePrice(listing)}
                        status={listing.status}
                        ownedByUser={true}
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
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {filtersHook.sortedUserBeasts.map((beast) => {
                        const tokenId = beast.id.split(":").pop() || beast.id;
                        const isListed = filtersHook.alreadyListedTokenIds.has(tokenId);
                        const inCart = cartsHook.isInCart(beast.id);

                        return (
                          <div key={beast.id} className="relative">
                            <ListingCard
                              beast={beast}
                              tokenId={tokenId}
                              inCart={inCart}
                              onAddToCart={() => cartsHook.handleToggleCart(beast)}
                            />
                            {isListed && (
                              <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] px-2 py-1 rounded">
                                Listed
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {myActivitySubTab === "transactions" && (
              <>
                {actionsHook.myTxs.length === 0 ? (
                  <p className="rounded-lg border border-gray-800 bg-black/50 px-4 py-8 text-center text-xs text-gray-400">
                    No transaction history yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {actionsHook.myTxs.map((tx, idx) => (
                      <div
                        key={`${tx.timestamp}-${idx}`}
                        className="rounded-lg border border-gray-800 bg-black/30 p-4 flex items-center gap-4"
                      >
                        <div className="flex-1">
                          <p className="text-xs font-semibold uppercase text-lsGold">{tx.type}</p>
                          <p className="text-xs text-gray-400">Beast #{tx.tokenId}</p>
                          {tx.note && <p className="text-xs text-gray-500">{tx.note}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">
                            {new Date(tx.timestamp).toLocaleDateString()}
                          </p>
                          {tx.txHash && (
                            <a
                              href={`${VOYAGER_BASE}/tx/${tx.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:underline"
                            >
                              View TX
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* Dialogs */}
        <CartListDialog
          open={listDialogOpen}
          onOpenChange={setListDialogOpen}
          beasts={cartsHook.cartBeasts}
          onRemoveBeast={cartsHook.handleRemoveFromCart}
          onListed={actionsHook.handleListed}
          onClearCart={cartsHook.handleClearCart}
          existingListings={filtersHook.sortedListings}
        />

        <EditListingDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          listing={editingListing}
          account={account}
          cancel={marketplaceSDKActions.cancel}
          list={marketplaceSDKActions.list}
          onEdited={actionsHook.handleListed}
        />

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

        <PurchaseCartDialog
          open={purchaseCartOpen}
          onOpenChange={setPurchaseCartOpen}
          listings={cartsHook.purchaseCart}
          onRemove={cartsHook.handleRemoveFromPurchaseCart}
          onClearAll={cartsHook.handleClearPurchaseCart}
          onPurchaseAll={() =>
            actionsHook.handlePurchaseAll(
              cartsHook.purchaseCart,
              cartsHook.handleRemoveFromPurchaseCart
            ).then((success) => {
              if (success) setPurchaseCartOpen(false);
            })
          }
          isProcessing={actionsHook.purchasingBatch}
          displayCurrency={displayCurrency}
          priceRates={priceRates}
        />

        <MakeOfferDialog
          open={makeOfferOpen}
          onOpenChange={setMakeOfferOpen}
          beast={offerBeast}
          tokenId={offerTokenId}
          onOfferMade={() => setMakeOfferOpen(false)}
        />

        <OffersDialog
          open={offersDialogOpen}
          onOpenChange={setOffersDialogOpen}
          tokenId={selectedListingForOffers?.tokenId || ""}
          orders={offersForToken}
          isOwner={true}
          onAcceptOffer={(order) => {
            actionsHook.handleAcceptOffer(order).then((success) => {
              if (success) setOffersDialogOpen(false);
            });
          }}
          isAccepting={!!actionsHook.acceptingOfferId}
        />

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
          onExecuteAll={() =>
            actionsHook.handleExecuteUnifiedCart(
              cartsHook.cartBeasts,
              cartsHook.purchaseCart,
              cartsHook.beastPrices
            ).then((success) => {
              if (success) setUnifiedCartOpen(false);
            })
          }
          isProcessing={actionsHook.purchasingBatch || actionsHook.listingBatch}
          displayCurrency={displayCurrency}
          priceRates={priceRates}
          selectedToken={selectedPaymentToken}
        />

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
