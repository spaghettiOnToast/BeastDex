import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "@starknet-react/core";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import { Button } from "../components/ui/button";
import ListingCard from "../components/marketplace/ListingCard";
import ListDialog from "../components/marketplace/ListDialog";
import { useControllerUsernames } from "../hooks/useControllerUsernames";
import type { Listing } from "../services/marketplace/types";
import {
  getPaymentTokenByAddress,
  DEFAULT_PAYMENT_TOKEN,
  MARKETPLACE_ADDRESS,
  BEASTS_COLLECTION_ADDRESS,
  getDefaultListingExpiration,
} from "../services/marketplace/constants";
import {
  editListingFlow,
  cancelListingFlow,
} from "../services/marketplace/flows";
import {
  useListedTokensForCollection,
  useMarketplaceActions,
} from "@cartridge/marketplace";
import { hydrateOrders } from "../services/marketplace";
import type { Beast, BeastAttributeFilters } from "../services/beast";
import { fetchBeastAttributeFilters, fetchBeasts } from "../services/beast";
import FiltersButton from "../components/filters/FiltersButton";
import { FiltersDrawer } from "../components/filters/FiltersDrawer";
import SortDropdown, { type SortOption } from "../components/sort/SortDropdown";
import { cn } from "../lib/utils";

const ZERO_BIGINT = 0n;
const HIDDEN_FILTER_TRAITS = new Set([
  "adventurerkilledcount",
  "adventurer killed count",
  "adventurers killed",
  "lastkilledby",
  "last killed by",
  "lastdeathtimestamp",
  "last death timestamp",
]);

function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  const trimmed = value.trim();
  return BigInt(trimmed.startsWith("0x") ? trimmed : trimmed);
}

function getAttributeValues(beast: Beast | null | undefined, trait: string): string[] {
  if (!beast) return [];
  const target = trait.toLowerCase();
  return (beast.attributes ?? [])
    .filter((attr) => attr.trait_type?.toLowerCase() === target)
    .map((attr) => String(attr.value ?? ""));
}

function getNumericAttribute(beast: Beast | null | undefined, trait: string): number | null {
  const values = getAttributeValues(beast, trait);
  if (values.length === 0) return null;
  const numberValue = Number(values[0]);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function matchesAttributeFilters(listing: Listing, filters: BeastAttributeFilters): boolean {
  const entries = Object.entries(filters || {});
  if (entries.length === 0) {
    return true;
  }

  return entries.every(([trait, values]) => {
    if (!Array.isArray(values) || values.length === 0) {
      return true;
    }
    const listingValues = getAttributeValues(listing.beast ?? null, trait);
    if (listingValues.length === 0) {
      return false;
    }
    return values.some((value) => listingValues.includes(String(value)));
  });
}

function matchesBeastFilters(beast: Beast, filters: BeastAttributeFilters): boolean {
  const entries = Object.entries(filters || {});
  if (entries.length === 0) {
    return true;
  }

  return entries.every(([trait, values]) => {
    if (!Array.isArray(values) || values.length === 0) {
      return true;
    }

    const beastValues = getAttributeValues(beast, trait);
    if (beastValues.length === 0) {
      return false;
    }

    return values.some((value) => beastValues.includes(String(value)));
  });
}

function sortListings(listings: Listing[], option: SortOption): Listing[] {
  const copy = [...listings];

  const compareStrings = (a: string | null | undefined, b: string | null | undefined) => {
    const left = (a ?? "").toLowerCase();
    const right = (b ?? "").toLowerCase();
    return left.localeCompare(right);
  };

  switch (option) {
    case "beast":
      return copy.sort((a, b) => {
        const traitA = getAttributeValues(a.beast ?? null, "Beast")[0] ?? a.beast?.name ?? "";
        const traitB = getAttributeValues(b.beast ?? null, "Beast")[0] ?? b.beast?.name ?? "";
        return compareStrings(traitA, traitB) || a.tokenId.localeCompare(b.tokenId);
      });
    case "tier":
      return copy.sort((a, b) => {
        const tierA = getNumericAttribute(a.beast ?? null, "Tier") ?? Number.POSITIVE_INFINITY;
        const tierB = getNumericAttribute(b.beast ?? null, "Tier") ?? Number.POSITIVE_INFINITY;
        return tierA - tierB || a.tokenId.localeCompare(b.tokenId);
      });
    case "health":
      return copy.sort((a, b) => {
        const healthA = getNumericAttribute(a.beast ?? null, "Health") ?? -Infinity;
        const healthB = getNumericAttribute(b.beast ?? null, "Health") ?? -Infinity;
        if (healthA === healthB) {
          return a.tokenId.localeCompare(b.tokenId);
        }
        return healthB - healthA;
      });
    case "rank":
      return copy.sort((a, b) => {
        const rankA = getNumericAttribute(a.beast ?? null, "Rank") ?? Number.POSITIVE_INFINITY;
        const rankB = getNumericAttribute(b.beast ?? null, "Rank") ?? Number.POSITIVE_INFINITY;
        return rankA - rankB || a.tokenId.localeCompare(b.tokenId);
      });
    case "last-death":
      return copy.sort((a, b) => {
        const deathA =
          getNumericAttribute(a.beast ?? null, "Last Death Timestamp") ??
          getNumericAttribute(a.beast ?? null, "last death timestamp") ??
          0;
        const deathB =
          getNumericAttribute(b.beast ?? null, "Last Death Timestamp") ??
          getNumericAttribute(b.beast ?? null, "last death timestamp") ??
          0;
        if (deathA === deathB) {
          return a.tokenId.localeCompare(b.tokenId);
        }
        return deathB - deathA;
      });
    case "default":
    default:
      return copy.sort((a, b) => {
        const powerA = a.beast?.power ?? -Infinity;
        const powerB = b.beast?.power ?? -Infinity;
        if (powerA === powerB) {
          return a.tokenId.localeCompare(b.tokenId);
        }
        return powerB - powerA;
      });
  }
}

type MarketplaceView = "explore" | "my";

function sortBeasts(beasts: Beast[], option: SortOption): Beast[] {
  const copy = [...beasts];

  switch (option) {
    case "beast":
      return copy.sort((a, b) => {
        const traitA = getAttributeValues(a, "Beast")[0] ?? a.name ?? "";
        const traitB = getAttributeValues(b, "Beast")[0] ?? b.name ?? "";
        const compare = traitA.localeCompare(traitB);
        if (compare !== 0) {
          return compare;
        }
        return a.numericId - b.numericId;
      });
    case "tier":
      return copy.sort((a, b) => {
        const tierA = getNumericAttribute(a, "Tier") ?? Number.POSITIVE_INFINITY;
        const tierB = getNumericAttribute(b, "Tier") ?? Number.POSITIVE_INFINITY;
        if (tierA === tierB) {
          return a.numericId - b.numericId;
        }
        return tierA - tierB;
      });
    case "health":
      return copy.sort((a, b) => {
        const healthA = getNumericAttribute(a, "Health") ?? -Infinity;
        const healthB = getNumericAttribute(b, "Health") ?? -Infinity;
        if (healthA === healthB) {
          return a.numericId - b.numericId;
        }
        return healthB - healthA;
      });
    case "rank":
      return copy.sort((a, b) => {
        const rankA = getNumericAttribute(a, "Rank") ?? Number.POSITIVE_INFINITY;
        const rankB = getNumericAttribute(b, "Rank") ?? Number.POSITIVE_INFINITY;
        if (rankA === rankB) {
          return a.numericId - b.numericId;
        }
        return rankA - rankB;
      });
    case "last-death":
      return copy.sort((a, b) => {
        const deathA =
          getNumericAttribute(a, "Last Death Timestamp") ??
          getNumericAttribute(a, "last death timestamp") ??
          0;
        const deathB =
          getNumericAttribute(b, "Last Death Timestamp") ??
          getNumericAttribute(b, "last death timestamp") ??
          0;
        if (deathA === deathB) {
          return a.numericId - b.numericId;
        }
        return deathB - deathA;
      });
    case "default":
    default:
      return copy.sort((a, b) => {
        const powerA = a.power ?? -Infinity;
        const powerB = b.power ?? -Infinity;
        if (powerA === powerB) {
          return a.numericId - b.numericId;
        }
        return powerB - powerA;
      });
  }
}

function ViewToggle({
  value,
  onChange,
}: {
  value: MarketplaceView;
  onChange: (value: MarketplaceView) => void;
}) {
  const options: Array<{
    value: MarketplaceView;
    label: string;
    description: string;
  }> = [
    {
      value: "explore",
      label: "Explore Listings",
      description: "Browse every active sale on BeastDex.",
    },
    {
      value: "my",
      label: "My Activity",
      description: "Manage your beasts and live listings.",
    },
  ];

  return (
    <div className="inline-flex flex-col gap-2 rounded-full border border-gray-800 bg-[#0f0f13]/70 p-1 sm:flex-row">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "w-full rounded-full px-5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lsGold/70",
              active
                ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_25px_rgba(208,201,141,0.25)]"
                : "text-gray-400 hover:text-lsGold"
            )}
          >
            <span className="block text-sm font-semibold uppercase tracking-widest">
              {option.label}
            </span>
            <span className="mt-1 block text-xs text-gray-500">
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function MarketplacePage() {
  const { address, account } = useAccount();

  const [activeTab, setActiveTab] = useState<MarketplaceView>("explore");
  const [listings, setListings] = useState<Listing[]>([]);
  const [hydratingListings, setHydratingListings] = useState(false);
  const [selectedForListing, setSelectedForListing] = useState<Beast | null>(null);
  const [listDialogOpen, setListDialogOpen] = useState(false);

  const [availableFilters, setAvailableFilters] = useState<BeastAttributeFilters>({});
  const [attributeFilters, setAttributeFilters] = useState<BeastAttributeFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("default");

  const [userBeasts, setUserBeasts] = useState<Beast[]>([]);
  const [userBeastsLoading, setUserBeastsLoading] = useState(false);

  const {
    data: listedOrders = [],
    isLoading: ordersLoading,
    isFetching: ordersFetching,
    refetch: refetchOrders,
  } = useListedTokensForCollection(BEASTS_COLLECTION_ADDRESS);
  const { executeListing, cancel, list } = useMarketplaceActions();

  useEffect(() => {
    let cancelled = false;

    const loadFilters = async () => {
      try {
        setFiltersLoading(true);
        setFiltersError(null);
        const filters = await fetchBeastAttributeFilters();
        if (cancelled) return;
        const cleanedEntries = (Array.isArray(Object.entries(filters))
          ? (Object.entries(filters) as Array<[string, string[]]> )
          : [])
          .filter(([trait]) => !HIDDEN_FILTER_TRAITS.has(trait.toLowerCase()));
        const cleaned = Object.fromEntries(cleanedEntries) as BeastAttributeFilters;
        setAvailableFilters(cleaned);
        setAttributeFilters((prev) => {
          const nextEntries = (Object.entries(prev) as Array<[string, string[]]>).filter(([
            trait,
          ]) => Object.prototype.hasOwnProperty.call(cleaned, trait));
          return Object.fromEntries(nextEntries) as BeastAttributeFilters;
        });
      } catch (error) {
        console.error("Failed to load marketplace filters", error);
        if (!cancelled) {
          setFiltersError("Unable to load filters");
        }
      } finally {
        if (!cancelled) {
          setFiltersLoading(false);
        }
      }
    };

    loadFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      setHydratingListings(true);
      try {
        const listingsData = await hydrateOrders(listedOrders);
        if (cancelled) return;
        const activeListings = listingsData.filter((listing) => listing.active);
        setListings(activeListings);
      } catch (error) {
        console.error("Failed to hydrate marketplace listings", error);
        if (!cancelled) {
          setListings([]);
        }
      } finally {
        if (!cancelled) {
          setHydratingListings(false);
        }
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [listedOrders]);

  const fetchAllUserBeasts = useCallback(async () => {
    if (!address) {
      return [] as Beast[];
    }

    const limit = 250;
    let page = 1;
    let results: Beast[] = [];
    let total = Infinity;

    while (results.length < total) {
      const { beasts, total: totalCount } = await fetchBeasts({
        limit,
        ownerAddresses: [address],
        page,
        sort: "default",
      });
      results = results.concat(beasts);
      total = typeof totalCount === "number" ? totalCount : results.length;
      if (beasts.length < limit) {
        break;
      }
      page += 1;
    }

    return results;
  }, [address]);

  const reloadUserBeasts = useCallback(async () => {
    if (!address) {
      setUserBeasts([]);
      return;
    }
    setUserBeastsLoading(true);
    try {
      const beasts = await fetchAllUserBeasts();
      setUserBeasts(beasts);
    } catch (error) {
      console.error("Failed to load user beasts", error);
    } finally {
      setUserBeastsLoading(false);
    }
  }, [address, fetchAllUserBeasts]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!address) {
        setUserBeasts([]);
        setUserBeastsLoading(false);
        return;
      }
      setUserBeastsLoading(true);
      try {
        const beasts = await fetchAllUserBeasts();
        if (!cancelled) {
          setUserBeasts(beasts);
        }
      } catch (error) {
        console.error("Failed to fetch user beasts", error);
      } finally {
        if (!cancelled) {
          setUserBeastsLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [address, fetchAllUserBeasts]);

  useEffect(() => {
    if (activeTab === "my") {
      void reloadUserBeasts();
    }
  }, [activeTab, reloadUserBeasts]);

  const filteredListings = useMemo(
    () => listings.filter((listing) => matchesAttributeFilters(listing, attributeFilters)),
    [listings, attributeFilters]
  );

  const sortedListings = useMemo(
    () => sortListings(filteredListings, sortOption),
    [filteredListings, sortOption]
  );

  const filteredUserBeasts = useMemo(
    () => userBeasts.filter((beast) => matchesBeastFilters(beast, attributeFilters)),
    [userBeasts, attributeFilters]
  );

  const sortedUserBeasts = useMemo(
    () => sortBeasts(filteredUserBeasts, sortOption),
    [filteredUserBeasts, sortOption]
  );

  const myActiveListings = useMemo(() => {
    if (!address) return [] as Listing[];
    const lower = address.toLowerCase();
    return sortedListings.filter((listing) => listing.seller.toLowerCase() === lower);
  }, [sortedListings, address]);

  const ownerAddresses = useMemo(
    () =>
      sortedListings
        .map((listing) => listing.seller?.toLowerCase?.() ?? "")
        .filter((addr) => addr.length > 0),
    [sortedListings]
  );
  useControllerUsernames(ownerAddresses);

  const filterControls = useMemo(
    () => (
      <div className="flex items-center gap-3">
        <FiltersButton
          attributeFilters={attributeFilters}
          onClick={() => setFiltersOpen(true)}
        />
        <SortDropdown value={sortOption} onChange={setSortOption} />
      </div>
    ),
    [attributeFilters, sortOption]
  );

  const handleOpenList = (beast: Beast) => {
    setSelectedForListing(beast);
    setListDialogOpen(true);
  };

  const formatPriceLabel = useCallback((listing: Listing) => {
    const token = getPaymentTokenByAddress(listing.paymentToken ?? undefined);
    const symbol = token?.symbol ?? "";
    const displayPrice = listing.price;
    return symbol ? `${displayPrice} ${symbol}` : displayPrice;
  }, []);

  const handleListed = useCallback(async () => {
    await refetchOrders();
    await reloadUserBeasts();
  }, [refetchOrders, reloadUserBeasts]);

  const handleFilterChange = useCallback((trait: string, value: string) => {
    setAttributeFilters((prev) => {
      const next = { ...prev } as BeastAttributeFilters;
      if (value && value.trim().length > 0) {
        next[trait] = [value];
      } else {
        delete next[trait];
      }
      return next;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setAttributeFilters({});
  }, []);

  const floorListing = useMemo(() => {
    let lowest: Listing | null = null;
    let lowestPrice: bigint | null = null;
    for (const listing of sortedListings) {
      try {
        const price = toBigInt(listing.price);
        if (lowestPrice === null || price < lowestPrice) {
          lowestPrice = price;
          lowest = listing;
        }
      } catch (error) {
        continue;
      }
    }
    return lowest;
  }, [sortedListings]);

  const floorPriceLabel = useMemo(() => {
    return floorListing ? formatPriceLabel(floorListing) : "—";
  }, [floorListing, formatPriceLabel]);

  const uniqueSellers = useMemo(() => {
    return new Set(
      sortedListings
        .map((listing) => listing.seller?.toLowerCase?.() ?? "")
        .filter((seller) => seller.length > 0)
    ).size;
  }, [sortedListings]);

  const totalListingsCount = sortedListings.length;
  const heroStats = useMemo(
    () => [
      {
        label: "Active Listings",
        value: totalListingsCount.toLocaleString(),
      },
      {
        label: "Floor Price",
        value: floorPriceLabel,
      },
      {
        label: "Unique Sellers",
        value: uniqueSellers.toLocaleString(),
      },
      {
        label: "Your Listings",
        value: myActiveListings.length.toLocaleString(),
      },
    ],
    [floorPriceLabel, myActiveListings.length, totalListingsCount, uniqueSellers]
  );

  return (
    <AppLayout topBar={<TopBar />}>
      <div className="space-y-8">
        <section className="rounded-2xl border border-gray-800 bg-[#0b0b0f]/90 p-6 shadow-[0_20px_60px_-30px_rgba(208,201,141,0.45)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <h1 className="text-3xl font-semibold text-lsGold">Beast Marketplace</h1>
              <p className="text-sm text-gray-400">
                Trade beasts straight from the on-chain bestiary. Filter by traits, tiers, and manage your listings in one place.
              </p>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-4">
              {heroStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-gray-800 bg-black/50 px-4 py-3 text-left"
                >
                  <p className="text-[11px] uppercase tracking-widest text-gray-500">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <ViewToggle value={activeTab} onChange={(value) => setActiveTab(value)} />
          <div className="flex flex-wrap items-center gap-3">
            {filterControls}
            {activeTab === "my" && (
              <Button
                variant="outline"
                onClick={() => reloadUserBeasts()}
                disabled={userBeastsLoading}
              >
                {userBeastsLoading ? "Refreshing…" : "Refresh"}
              </Button>
            )}
          </div>
        </div>

        {activeTab === "explore" ? (
          <section className="space-y-5">
            {ordersLoading || ordersFetching || hydratingListings ? (
              <p className="text-sm text-gray-400">Loading listings…</p>
            ) : sortedListings.length === 0 ? (
              <p className="rounded-xl border border-gray-800 bg-black/50 px-4 py-10 text-center text-sm text-gray-400">
                No active listings match your filters yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {sortedListings.map((listing) => (
                  <ListingCard
                    key={`${listing.listingId}-${listing.tokenId}`}
                    beast={listing.beast}
                    tokenId={listing.tokenId}
                    priceLabel={formatPriceLabel(listing)}
                    onBuy={async () => {
                      if (!account) return;
                      try {
                        const tokenIdBigInt = toBigInt(listing.tokenId);
                        const priceBigInt = toBigInt(listing.price);
                        const currency = listing.paymentToken ?? DEFAULT_PAYMENT_TOKEN.address;
                        const orderId = toBigInt(listing.orderId ?? 0);
                        await executeListing(
                          account as any,
                          orderId,
                          BEASTS_COLLECTION_ADDRESS,
                          tokenIdBigInt,
                          BigInt(listing.quantity ?? 1),
                          true,
                          currency,
                          priceBigInt,
                          ZERO_BIGINT,
                          MARKETPLACE_ADDRESS
                        );
                        await refetchOrders();
                        await reloadUserBeasts();
                      } catch (error) {
                        console.error("Buy failed", error);
                      }
                    }}
                    ownedByUser={address?.toLowerCase() === listing.seller?.toLowerCase()}
                    onEdit={async () => {
                      if (!account) return;
                      const newPrice = window.prompt("New price (wei)", listing.price);
                      if (!newPrice) return;
                      try {
                        const currency =
                          listing.paymentToken ?? DEFAULT_PAYMENT_TOKEN.address;
                        const quantity = listing.quantity ?? 1;
                        const expiration = getDefaultListingExpiration();
                        await editListingFlow(
                          { cancel, list },
                          {
                            account: account as any,
                            collectionAddress: BEASTS_COLLECTION_ADDRESS,
                            tokenId: listing.tokenId,
                            orderId: listing.orderId ?? 0,
                            newPrice,
                            currencyAddress: currency,
                            quantity,
                            expiration,
                          }
                        );
                        await refetchOrders();
                        await reloadUserBeasts();
                      } catch (error) {
                        console.error("Edit failed", error);
                      }
                    }}
                    onCancel={async () => {
                      if (!account) return;
                      try {
                        await cancelListingFlow(
                          { cancel },
                          {
                            account: account as any,
                            collectionAddress: BEASTS_COLLECTION_ADDRESS,
                            tokenId: listing.tokenId,
                            orderId: listing.orderId ?? 0,
                          }
                        );
                        await refetchOrders();
                        await reloadUserBeasts();
                      } catch (error) {
                        console.error("Cancel failed", error);
                      }
                    }}
                    compact
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-10">
            <div className="space-y-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Your Beasts</h2>
                  <p className="text-xs text-gray-500">List directly from your collection.</p>
                </div>
              </div>
              {address ? (
                userBeastsLoading ? (
                  <p className="text-sm text-gray-400">Loading your beasts…</p>
                ) : userBeasts.length === 0 ? (
                  <p className="text-sm text-gray-400">No beasts found for this wallet.</p>
                ) : sortedUserBeasts.length === 0 ? (
                  <p className="text-sm text-gray-400">No beasts match your current filters.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {sortedUserBeasts.map((beast) => (
                      <ListingCard
                        key={beast.id}
                        beast={beast}
                        tokenId={beast.id}
                        ownedByUser
                        onEdit={() => handleOpenList(beast)}
                        onCancel={undefined}
                        compact
                        primaryActionLabel="List"
                      />
                    ))}
                  </div>
                )
              ) : (
                <p className="text-sm text-gray-400">Connect your wallet to see your beasts.</p>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">My Active Listings</h2>
                  <p className="text-xs text-gray-500">Edit prices or cancel live orders.</p>
                </div>
              </div>
              {ordersLoading || ordersFetching || hydratingListings ? (
                <p className="text-sm text-gray-400">Loading your listings…</p>
              ) : myActiveListings.length === 0 ? (
                <p className="text-sm text-gray-400">
                  You have no active listings that match your filters.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {myActiveListings.map((listing) => (
                    <ListingCard
                      key={`${listing.listingId}-${listing.tokenId}`}
                      beast={listing.beast}
                      tokenId={listing.tokenId}
                      priceLabel={formatPriceLabel(listing)}
                      ownedByUser
                      onEdit={async () => {
                        if (!account) return;
                        const newPrice = window.prompt("New price (wei)", listing.price);
                        if (!newPrice) return;
                        try {
                          const currency =
                            listing.paymentToken ?? DEFAULT_PAYMENT_TOKEN.address;
                          const quantity = listing.quantity ?? 1;
                          const expiration = getDefaultListingExpiration();
                          await editListingFlow(
                            { cancel, list },
                            {
                              account: account as any,
                              collectionAddress: BEASTS_COLLECTION_ADDRESS,
                              tokenId: listing.tokenId,
                              orderId: listing.orderId ?? 0,
                              newPrice,
                              currencyAddress: currency,
                              quantity,
                              expiration,
                            }
                          );
                          await refetchOrders();
                          await reloadUserBeasts();
                        } catch (error) {
                          console.error("Edit failed", error);
                        }
                      }}
                      onCancel={async () => {
                        if (!account) return;
                        try {
                          await cancelListingFlow(
                            { cancel },
                            {
                              account: account as any,
                              collectionAddress: BEASTS_COLLECTION_ADDRESS,
                              tokenId: listing.tokenId,
                              orderId: listing.orderId ?? 0,
                            }
                          );
                          await refetchOrders();
                          await reloadUserBeasts();
                        } catch (error) {
                          console.error("Cancel failed", error);
                        }
                      }}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <ListDialog
          open={listDialogOpen}
          onOpenChange={(open) => setListDialogOpen(open)}
          beast={selectedForListing}
          onListed={handleListed}
        />

        <FiltersDrawer
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          availableFilters={availableFilters}
          attributeFilters={attributeFilters}
          filtersLoading={filtersLoading}
          filtersError={filtersError}
          onFilterChange={handleFilterChange}
          onResetFilters={handleResetFilters}
        />
      </div>
    </AppLayout>
  );
}
