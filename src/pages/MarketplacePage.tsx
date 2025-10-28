import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  CLIENT_FEE_BP,
  CLIENT_FEE_RECEIVER,
} from "../services/marketplace/constants";
import {
  cancelListingFlow,
} from "../services/marketplace/flows";
import { useMarketplaceActions, useMarketplace, type OrderModel, type SaleEvent } from "@cartridge/marketplace";
import { useArcadeListedTokensForCollection, useArcadeIsTokenListed } from "../hooks/useArcadeOrders";
import { hydrateOrders } from "../services/marketplace";
import type { Beast, BeastAttributeFilters } from "../services/beast";
import { fetchBeastAttributeFilters, fetchBeasts } from "../services/beast";
import FiltersButton from "../components/filters/FiltersButton";
import { FiltersDrawer } from "../components/filters/FiltersDrawer";
import SortDropdown, { type SortOption } from "../components/sort/SortDropdown";
import { cn } from "../lib/utils";
import { formatPrice, fromWei, TOKEN_DECIMALS, formatPriceInSymbol } from "../utils/price";
import { usePriceRates } from "../services/marketplace/rates";
import { toBigIntSafe } from "../utils/bigint";
import CartListDialog from "../components/marketplace/CartListDialog";
import EditListingDialog from "../components/marketplace/EditListingDialog";
import PurchaseConfirmDialog from "../components/marketplace/PurchaseConfirmDialog";
import PurchaseCartDialog from "../components/marketplace/PurchaseCartDialog";
import MakeOfferDialog from "../components/marketplace/MakeOfferDialog";
import OffersDialog from "../components/marketplace/OffersDialog";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { checkSufficientBalance, ensureErc20Allowance } from "../services/marketplace/approvals";

const HIDDEN_FILTER_TRAITS = new Set([
  "adventurerkilledcount",
  "adventurer killed count",
  "adventurers killed",
  "lastkilledby",
  "last killed by",
  "lastdeathtimestamp",
  "last death timestamp",
]);

// Use shared safe BigInt conversion to handle scientific-notation strings
const toBigInt = toBigIntSafe;

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
    case "beast-asc":
      return copy.sort((a, b) => {
        const traitA = getAttributeValues(a.beast ?? null, "Beast")[0] ?? a.beast?.name ?? "";
        const traitB = getAttributeValues(b.beast ?? null, "Beast")[0] ?? b.beast?.name ?? "";
        return compareStrings(traitA, traitB) || a.tokenId.localeCompare(b.tokenId);
      });
    case "beast-desc":
      return copy.sort((a, b) => {
        const traitA = getAttributeValues(a.beast ?? null, "Beast")[0] ?? a.beast?.name ?? "";
        const traitB = getAttributeValues(b.beast ?? null, "Beast")[0] ?? b.beast?.name ?? "";
        return compareStrings(traitB, traitA) || a.tokenId.localeCompare(b.tokenId);
      });
    case "tier-asc":
      return copy.sort((a, b) => {
        const tierA = getNumericAttribute(a.beast ?? null, "Tier") ?? Number.POSITIVE_INFINITY;
        const tierB = getNumericAttribute(b.beast ?? null, "Tier") ?? Number.POSITIVE_INFINITY;
        return tierA - tierB || a.tokenId.localeCompare(b.tokenId);
      });
    case "tier-desc":
      return copy.sort((a, b) => {
        const tierA = getNumericAttribute(a.beast ?? null, "Tier") ?? Number.POSITIVE_INFINITY;
        const tierB = getNumericAttribute(b.beast ?? null, "Tier") ?? Number.POSITIVE_INFINITY;
        return tierB - tierA || a.tokenId.localeCompare(b.tokenId);
      });
    case "health-desc":
      return copy.sort((a, b) => {
        const healthA = getNumericAttribute(a.beast ?? null, "Health") ?? -Infinity;
        const healthB = getNumericAttribute(b.beast ?? null, "Health") ?? -Infinity;
        if (healthA === healthB) {
          return a.tokenId.localeCompare(b.tokenId);
        }
        return healthB - healthA;
      });
    case "health-asc":
      return copy.sort((a, b) => {
        const healthA = getNumericAttribute(a.beast ?? null, "Health") ?? -Infinity;
        const healthB = getNumericAttribute(b.beast ?? null, "Health") ?? -Infinity;
        if (healthA === healthB) {
          return a.tokenId.localeCompare(b.tokenId);
        }
        return healthA - healthB;
      });
    case "rank-asc":
      return copy.sort((a, b) => {
        const rankA = getNumericAttribute(a.beast ?? null, "Rank") ?? Number.POSITIVE_INFINITY;
        const rankB = getNumericAttribute(b.beast ?? null, "Rank") ?? Number.POSITIVE_INFINITY;
        return rankA - rankB || a.tokenId.localeCompare(b.tokenId);
      });
    case "rank-desc":
      return copy.sort((a, b) => {
        const rankA = getNumericAttribute(a.beast ?? null, "Rank") ?? Number.POSITIVE_INFINITY;
        const rankB = getNumericAttribute(b.beast ?? null, "Rank") ?? Number.POSITIVE_INFINITY;
        return rankB - rankA || a.tokenId.localeCompare(b.tokenId);
      });
    case "last-death-desc":
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
    case "last-death-asc":
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
        return deathA - deathB;
      });
    case "price-asc":
      return copy.sort((a, b) => {
        try {
          const priceA = BigInt(a.price);
          const priceB = BigInt(b.price);
          if (priceA === priceB) {
            return a.tokenId.localeCompare(b.tokenId);
          }
          return priceA < priceB ? -1 : 1;
        } catch {
          return a.tokenId.localeCompare(b.tokenId);
        }
      });
    case "price-desc":
      return copy.sort((a, b) => {
        try {
          const priceA = BigInt(a.price);
          const priceB = BigInt(b.price);
          if (priceA === priceB) {
            return a.tokenId.localeCompare(b.tokenId);
          }
          return priceA > priceB ? -1 : 1;
        } catch {
          return a.tokenId.localeCompare(b.tokenId);
        }
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
    case "beast-asc":
      return copy.sort((a, b) => {
        const traitA = getAttributeValues(a, "Beast")[0] ?? a.name ?? "";
        const traitB = getAttributeValues(b, "Beast")[0] ?? b.name ?? "";
        const compare = traitA.localeCompare(traitB);
        if (compare !== 0) {
          return compare;
        }
        return a.numericId - b.numericId;
      });
    case "beast-desc":
      return copy.sort((a, b) => {
        const traitA = getAttributeValues(a, "Beast")[0] ?? a.name ?? "";
        const traitB = getAttributeValues(b, "Beast")[0] ?? b.name ?? "";
        const compare = traitB.localeCompare(traitA);
        if (compare !== 0) {
          return compare;
        }
        return a.numericId - b.numericId;
      });
    case "tier-asc":
      return copy.sort((a, b) => {
        const tierA = getNumericAttribute(a, "Tier") ?? Number.POSITIVE_INFINITY;
        const tierB = getNumericAttribute(b, "Tier") ?? Number.POSITIVE_INFINITY;
        if (tierA === tierB) {
          return a.numericId - b.numericId;
        }
        return tierA - tierB;
      });
    case "tier-desc":
      return copy.sort((a, b) => {
        const tierA = getNumericAttribute(a, "Tier") ?? Number.POSITIVE_INFINITY;
        const tierB = getNumericAttribute(b, "Tier") ?? Number.POSITIVE_INFINITY;
        if (tierA === tierB) {
          return a.numericId - b.numericId;
        }
        return tierB - tierA;
      });
    case "health-desc":
      return copy.sort((a, b) => {
        const healthA = getNumericAttribute(a, "Health") ?? -Infinity;
        const healthB = getNumericAttribute(b, "Health") ?? -Infinity;
        if (healthA === healthB) {
          return a.numericId - b.numericId;
        }
        return healthB - healthA;
      });
    case "health-asc":
      return copy.sort((a, b) => {
        const healthA = getNumericAttribute(a, "Health") ?? -Infinity;
        const healthB = getNumericAttribute(b, "Health") ?? -Infinity;
        if (healthA === healthB) {
          return a.numericId - b.numericId;
        }
        return healthA - healthB;
      });
    case "rank-asc":
      return copy.sort((a, b) => {
        const rankA = getNumericAttribute(a, "Rank") ?? Number.POSITIVE_INFINITY;
        const rankB = getNumericAttribute(b, "Rank") ?? Number.POSITIVE_INFINITY;
        if (rankA === rankB) {
          return a.numericId - b.numericId;
        }
        return rankA - rankB;
      });
    case "rank-desc":
      return copy.sort((a, b) => {
        const rankA = getNumericAttribute(a, "Rank") ?? Number.POSITIVE_INFINITY;
        const rankB = getNumericAttribute(b, "Rank") ?? Number.POSITIVE_INFINITY;
        if (rankA === rankB) {
          return a.numericId - b.numericId;
        }
        return rankB - rankA;
      });
    case "last-death-desc":
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
    case "last-death-asc":
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
        return deathA - deathB;
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
    <div className="inline-flex flex-col gap-1 rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-1 sm:flex-row">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "w-full rounded-md px-4 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lsGold/70",
              active
                ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                : "text-gray-400 hover:text-lsGold"
            )}
          >
            <span className="block text-xs font-semibold uppercase tracking-wider">
              {option.label}
            </span>
            <span className="mt-0.5 block text-[10px] text-gray-500">
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
  const marketplace = useMarketplace();

  // Debug: Log marketplace provider configuration
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('=== MARKETPLACE PROVIDER CONFIG ===');
    console.log('Provider:', marketplace.provider);
    console.log('Chain ID:', marketplace.chainId);
    console.log('Manifest:', marketplace.provider?.manifest);
    console.log('Torii URL from config:', (marketplace.provider as any)?.url || 'N/A');
  }, [marketplace]);

  const [activeTab, setActiveTab] = useState<MarketplaceView>("explore");
  const [exploreSubTab, setExploreSubTab] = useState<"browse" | "recent-listed" | "recent-sold">("browse");
  const [myActivitySubTab, setMyActivitySubTab] = useState<"listings" | "beasts" | "transactions">("listings");
  const [listings, setListings] = useState<Listing[]>([]);
  const [showAllMyListings, setShowAllMyListings] = useState(false);
  const [hydratingListings, setHydratingListings] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [recentSales, setRecentSales] = useState<Array<{ sale: SaleEvent; beast: Beast | null }>>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [recentListings, setRecentListings] = useState<Listing[]>([]);
  const [loadingRecentListings, setLoadingRecentListings] = useState(false);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [purchaseConfirmOpen, setPurchaseConfirmOpen] = useState(false);
  const [purchasingListing, setPurchasingListing] = useState<Listing | null>(null);
  const [purchaseCartOpen, setPurchaseCartOpen] = useState(false);
  const [purchasingBatch, setPurchasingBatch] = useState(false);
  const [makeOfferOpen, setMakeOfferOpen] = useState(false);
  const [offerBeast, setOfferBeast] = useState<Beast | null>(null);
  const [offerTokenId, setOfferTokenId] = useState<string | undefined>(undefined);
  const [offersDialogOpen, setOffersDialogOpen] = useState(false);
  const [selectedListingForOffers, setSelectedListingForOffers] = useState<Listing | null>(null);
  const [offersForToken, setOffersForToken] = useState<OrderModel[]>([]);
  const [cartBeasts, setCartBeasts] = useState<Beast[]>([]);
  const [purchaseCart, setPurchaseCart] = useState<Listing[]>([]);
  const [visibleListingCount, setVisibleListingCount] = useState(120);

  const [availableFilters, setAvailableFilters] = useState<BeastAttributeFilters>({});
  const [attributeFilters, setAttributeFilters] = useState<BeastAttributeFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("default");

  const [userBeasts, setUserBeasts] = useState<Beast[]>([]);
  const [userBeastsLoading, setUserBeastsLoading] = useState(false);
  const [userBeastsError, setUserBeastsError] = useState<string | null>(null);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<'STRK' | 'LORDS' | 'USDC' | 'ETH' | 'SURVIVOR'>('LORDS');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'canceled' | 'sold'>('active');
  const [hideExpired, setHideExpired] = useState(false);
  const { data: priceRates } = usePriceRates();

  const [buyingListingId, setBuyingListingId] = useState<string | null>(null);
  const [cancelingListingId, setCancelingListingId] = useState<string | null>(null);
  const [acceptingOfferId, setAcceptingOfferId] = useState<string | null>(null);
  const [hiddenListingIds, setHiddenListingIds] = useState<Set<string>>(new Set());
  type TxEntry = { type: 'list'|'cancel'|'buy'|'edit'|'offer'; tokenId: string; txHash?: string; timestamp: number; note?: string };
  const [myTxs, setMyTxs] = useState<TxEntry[]>([]);
  const ACTIVITY_STORAGE_KEY = 'beastdex:my-activity';
  const VOYAGER_BASE = 'https://voyager.online';
  const HIDDEN_STORAGE_KEY = 'beastdex:hidden-listings';

  // Debug: Log price rates when they change
  useEffect(() => {
    console.log('[MarketplacePage] Price Rates:', priceRates);
    console.log('[MarketplacePage] Display Currency:', displayCurrency);
  }, [priceRates, displayCurrency]);

  // Load saved activity on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned: TxEntry[] = parsed
          .filter((e) => e && typeof e === 'object')
          .map((e) => ({
            type: e.type,
            tokenId: String(e.tokenId ?? ''),
            txHash: e.txHash ? String(e.txHash) : undefined,
            timestamp: Number(e.timestamp ?? Date.now()),
            note: e.note ? String(e.note) : undefined,
          }))
          .slice(0, 100);
        setMyTxs(cleaned);
      }
    } catch {}
  }, []);

  // Persist activity when it changes
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(myTxs));
    } catch {}
  }, [myTxs]);

  // Load hidden listings on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_STORAGE_KEY);
      if (!raw) return;
      const arr: string[] = JSON.parse(raw);
      if (Array.isArray(arr)) setHiddenListingIds(new Set(arr));
    } catch {}
  }, []);

  // Persist hidden listings when changed
  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(Array.from(hiddenListingIds)));
    } catch {}
  }, [hiddenListingIds]);

  const prevOrdersRef = useRef<string>("");

  const {
    data: listedOrders = [],
    isLoading: ordersLoading,
    isFetching: ordersFetching,
    refetch: refetchOrders,
    error: ordersError,
  } = useArcadeListedTokensForCollection(BEASTS_COLLECTION_ADDRESS) as unknown as {
    data: OrderModel[];
    isLoading: boolean;
    isFetching: boolean;
    refetch: () => Promise<any>;
    error: unknown;
  };
  const { executeListing, cancel, list, executeOffer } = useMarketplaceActions();

  // Debug: Check for errors fetching orders
  useEffect(() => {
    if (ordersError) {
      console.error('❌ ERROR fetching orders from Cartridge SDK:', ordersError);
    }
  }, [ordersError]);

  // Debug: Check direct listing status for beast 1278
  const tokenIdForDebug = '1278';
  const { data: listedCheck } = useArcadeIsTokenListed(BEASTS_COLLECTION_ADDRESS, tokenIdForDebug) as unknown as {
    data: { isListed: boolean; listing: OrderModel | null };
  };
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (listedCheck) {
      console.log('🔎 isTokenListed check for 1278:', listedCheck.isListed, listedCheck.listing);
    }
  }, [listedCheck]);

  // Debug: Try direct SQL query to arcade-main Torii to check if order exists
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const checkOrderDirectly = async () => {
      try {
        // Build the Torii SQL URL from the same config the SDK uses
        const { configs } = await import('@cartridge/marketplace');
        const { constants } = await import('starknet');
        const dojoConfig = configs[constants.StarknetChainId.SN_MAIN];
        const base = dojoConfig.toriiUrl?.replace(/\/$/, '') || 'https://api.cartridge.gg/x/arcade-main/torii';
        const sqlUrl = `${base}/sql`;

        // Helper to run a GET SQL query with ?query= to match Torii API
        const run = async (query: string) => {
          const url = `${sqlUrl}?query=${encodeURIComponent(query)}`;
          const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
          const text = await res.text();
          let json: any = null;
          try { json = JSON.parse(text); } catch {}
          return { ok: res.ok, status: res.status, bodyText: text, body: json };
        };

        console.log('🔎 Torii SQL endpoint:', sqlUrl);

        // First, discover tables so we stop guessing names
        const tables = await run('SHOW TABLES');
        if (!tables.ok) {
          console.log('❌ SHOW TABLES failed:', tables.status, tables.body || tables.bodyText);
        } else {
          console.log('📋 SHOW TABLES:', tables.body || tables.bodyText);
        }

        // Try Arcade and Marketplace model names (DuckDB-style quoting for '-')
        const queries = [
          `SELECT * FROM "ARCADE-Order" WHERE token_id = 1278 LIMIT 5`,
          `SELECT * FROM ARCADE_Order WHERE token_id = 1278 LIMIT 5`,
          `SELECT * FROM "marketplace-Order" WHERE token_id = 1278 LIMIT 5`,
          `SELECT * FROM marketplace_Order WHERE token_id = 1278 LIMIT 5`,
          `SELECT * FROM entities WHERE keys LIKE '%1278%' LIMIT 10`,
        ];

        for (const query of queries) {
          console.log('🔍 Trying SQL query:', query);
          const res = await run(query);
          if (res.ok && res.body && !res.body.error) {
            console.log('✅ SQL query succeeded:', query);
            console.log('Result:', res.body);
            break;
          }
          console.log('❌ SQL query failed:', query, res.status, res.body || res.bodyText);
        }
      } catch (error) {
        console.error('❌ Direct SQL check failed:', error);
      }
    };

    if (!ordersLoading && listedOrders.length === 0) {
      checkOrderDirectly();
    }
  }, [ordersLoading, listedOrders.length]);

  // Debug: Log orders data (only after load completes)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (ordersLoading || ordersFetching) return;

    console.log('=== RAW MARKETPLACE ORDERS ===');
    console.log('Collection:', BEASTS_COLLECTION_ADDRESS);
    console.log('Orders count:', listedOrders.length);
    console.log('Loading:', ordersLoading, 'Fetching:', ordersFetching);
    console.log('All orders:', listedOrders.map(o => ({
      id: o.id,
      identifier: o.identifier,
      tokenId: o.tokenId?.toString(),
      quantity: o.quantity,
      price: o.price,
      category: o.category?.value,
      status: o.status?.value,
      owner: o.owner,
      expiration: o.expiration,
    })));

    const order1278 = listedOrders.find(o => o.tokenId?.toString() === '1278');
    if (order1278) {
      console.log('✅ Found order for beast 1278:', {
        id: order1278.id,
        identifier: order1278.identifier,
        tokenId: order1278.tokenId?.toString(),
        quantity: order1278.quantity,
        price: order1278.price,
        category: order1278.category?.value,
        status: order1278.status?.value,
        owner: order1278.owner,
        currency: order1278.currency,
        expiration: order1278.expiration,
        expirationDate: order1278.expiration ? new Date(order1278.expiration * 1000).toLocaleString() : 'N/A',
      });
    } else if (listedOrders.length > 0) {
      console.log('❌ No order found for beast 1278 in raw data');
    }
  }, [listedOrders, ordersLoading, ordersFetching]);

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
      // Check if orders have actually changed by comparing stringified version
      const ordersString = JSON.stringify(
        listedOrders.map((o) => ({
          id: o.id,
          identifier: o.identifier,
          tokenId: o.tokenId.toString(),
        }))
      );

      if (prevOrdersRef.current === ordersString) {
        return; // Data hasn't changed, skip hydration
      }

      // Don't hydrate if we're currently loading
      if (ordersLoading || ordersFetching) return;

      prevOrdersRef.current = ordersString;
      setHydratingListings(true);
      setListingsError(null);

      // Only show skeletons if we have a reasonable number
      // Otherwise it causes performance issues
      if (listedOrders.length <= 200) {
        const skeletons = listedOrders.map(order => ({
          listingId: order.identifier,
          tokenId: order.tokenId.toString(),
          seller: order.owner,
          price: order.price.toString(),
          paymentToken: order.currency,
          active: false, // Will be updated after hydration
          status: 'active' as const,
          quantity: order.quantity,
          expiration: order.expiration,
          beast: null,
          orderId: order.id,
        }));
        setListings(skeletons);
      }

      try {
        const listingsData = await hydrateOrders(listedOrders);
        if (cancelled) return;

        // Enhanced debugging for marketplace listings
        if (import.meta.env.DEV) {
          console.log('=== MARKETPLACE LISTINGS DEBUG ===');
          console.log('Total orders from indexer:', listingsData.length);
          console.log('Status breakdown:', {
            active: listingsData.filter(l => l.status === 'active').length,
            expired: listingsData.filter(l => l.status === 'expired').length,
            canceled: listingsData.filter(l => l.status === 'canceled').length,
            sold: listingsData.filter(l => l.status === 'sold').length,
          });
        }

        // Store ALL listings (not just active ones)
        setListings(listingsData);
        setListingsError(null);
      } catch (error) {
        console.error("Failed to hydrate marketplace listings", error);
        if (!cancelled) {
          setListings([]);
          const errorMsg = error instanceof Error ? error.message : "Failed to load listings";
          if (errorMsg.includes("502") || errorMsg.includes("can't reach deployment")) {
            setListingsError("Indexer service is temporarily unavailable. Listings data cannot be displayed right now. Please try again in a few minutes.");
          } else {
            setListingsError("Failed to load marketplace listings. Please try again.");
          }
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
  }, [listedOrders, ordersLoading, ordersFetching]);

  const reloadUserBeasts = useCallback(async () => {
    if (!address) {
      setUserBeasts([]);
      setUserBeastsError(null);
      return;
    }
    setUserBeastsLoading(true);
    setUserBeastsError(null);
    try {
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

      if (import.meta.env.DEV) {
        console.log('reloadUserBeasts: Loaded', results.length, 'beasts');
      }
      setUserBeasts(results);
    } catch (error) {
      console.error("Failed to load user beasts", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to load beasts";
      if (errorMsg.includes("502") || errorMsg.includes("can't reach deployment")) {
        setUserBeastsError("Indexer service is temporarily unavailable. Your beasts are safe on-chain, but can't be displayed right now. Please try again in a few minutes.");
      } else {
        setUserBeastsError("Failed to load beasts. Please try again.");
      }
    } finally {
      setUserBeastsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!address) {
        if (import.meta.env.DEV) {
          console.log('User Beasts: No address, clearing beasts');
        }
        setUserBeasts([]);
        setUserBeastsError(null);
        setUserBeastsLoading(false);
        return;
      }
      if (import.meta.env.DEV) {
        console.log('User Beasts: Loading for address:', address);
      }
      setUserBeastsLoading(true);
      setUserBeastsError(null);
      try {
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

        if (!cancelled) {
          if (import.meta.env.DEV) {
            console.log('User Beasts: Loaded', results.length, 'beasts');
          }
          setUserBeasts(results);
          setUserBeastsError(null);
        }
      } catch (error) {
        console.error("Failed to fetch user beasts", error);
        if (!cancelled) {
          const errorMsg = error instanceof Error ? error.message : "Failed to load beasts";
          if (errorMsg.includes("502") || errorMsg.includes("can't reach deployment")) {
            setUserBeastsError("Indexer service is temporarily unavailable. Your beasts are safe on-chain, but can't be displayed right now. Please try again in a few minutes.");
          } else {
            setUserBeastsError("Failed to load beasts. Please try again.");
          }
        }
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
  }, [address]);

  useEffect(() => {
    if (activeTab === "my") {
      void reloadUserBeasts();
    }
  }, [activeTab, reloadUserBeasts]);

  useEffect(() => {
    // Reset offers when dialog closes
    if (!offersDialogOpen) {
      setOffersForToken([]);
    }
  }, [offersDialogOpen]);

  // Load recent listings when Activity tab is active
  useEffect(() => {
    let cancelled = false;

    const loadRecentListings = async () => {
      if (activeTab !== "explore" || exploreSubTab !== "recent-listed") return;

      setLoadingRecentListings(true);
      try {
        // Use the actual listings data we already have, sorted by most recently created
        // Since we don't have creation timestamps, we'll use the last 10 from the full listings
        const recent = [...listings]
          .filter((listing) => listing.active)
          .slice(0, 10); // Take first 10 from the already loaded listings

        if (!cancelled) {
          setRecentListings(recent);
        }
      } catch (error) {
        console.error("Failed to load recent listings", error);
      } finally {
        if (!cancelled) {
          setLoadingRecentListings(false);
        }
      }
    };

    loadRecentListings();
    return () => {
      cancelled = true;
    };
  }, [activeTab, exploreSubTab, listings]);

  // Load recent sales when Activity tab is active
  useEffect(() => {
    let cancelled = false;

    const loadRecentSales = async () => {
      if (activeTab !== "explore" || exploreSubTab !== "recent-sold" || !marketplace.sales) return;

      setLoadingSales(true);
      try {
        // Get last 10 sales sorted by time (most recent first)
        const sortedSales = [...marketplace.sales]
          .sort((a, b) => b.time - a.time)
          .slice(0, 10);

        // Hydrate sales with beast data
        const hydratedSales = await Promise.all(
          sortedSales.map(async (sale) => {
            try {
              const tokenId = sale.order.tokenId.toString();
              const { beasts } = await fetchBeasts({
                limit: 1,
                search: tokenId,
                page: 1,
                sort: "default",
              });
              return { sale, beast: beasts[0] || null };
            } catch (error) {
              console.error(`Failed to fetch beast for sale ${sale.id}`, error);
              return { sale, beast: null };
            }
          })
        );

        if (!cancelled) {
          setRecentSales(hydratedSales);
        }
      } catch (error) {
        console.error("Failed to load recent sales", error);
      } finally {
        if (!cancelled) {
          setLoadingSales(false);
        }
      }
    };

    loadRecentSales();
    return () => {
      cancelled = true;
    };
  }, [activeTab, exploreSubTab, marketplace.sales]);

  const filteredListings = useMemo(
    () =>
      listings
        .filter((listing) => !hiddenListingIds.has(listing.listingId))
        .filter(
          (listing): listing is Listing & { beast: Beast } =>
            listing.beast != null
        )
        .filter((listing) => {
          // Apply "Hide Expired" toggle
          if (hideExpired && listing.status === 'expired') return false;

          // Apply status filter
          if (statusFilter === 'all') return true;
          return listing.status === statusFilter;
        })
        .filter((listing) => matchesAttributeFilters(listing, attributeFilters)),
    [listings, attributeFilters, hiddenListingIds, statusFilter, hideExpired]
  );

  const sortedListings = useMemo(
    () => sortListings(filteredListings, sortOption),
    [filteredListings, sortOption]
  );

  const namedRecentListings = useMemo(
    () => recentListings.filter((listing) => listing.beast?.name && listing.beast.name.trim().length > 0),
    [recentListings]
  );

  const namedRecentSales = useMemo(
    () => recentSales.filter(({ beast }) => beast?.name && beast.name.trim().length > 0),
    [recentSales]
  );

  useEffect(() => {
    const target = sortedListings.length;
    const INITIAL = 120;
    const STEP = 60;

    if (activeTab !== "explore") {
      setVisibleListingCount(target);
      return;
    }

    setVisibleListingCount(Math.min(INITIAL, target));

    if (target <= INITIAL) {
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const schedule = () => {
      if (cancelled || typeof window === "undefined") return;
      timer = window.setTimeout(() => {
        setVisibleListingCount((prev) => {
          if (prev >= target) {
            cancelled = true;
            return prev;
          }
          return Math.min(prev + STEP, target);
        });
        if (!cancelled) {
          schedule();
        }
      }, 90);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timer !== null && typeof window !== "undefined") {
        window.clearTimeout(timer);
      }
    };
  }, [sortedListings, activeTab, statusFilter, hideExpired]);

  const filteredUserBeasts = useMemo(
    () => userBeasts.filter((beast) => matchesBeastFilters(beast, attributeFilters)),
    [userBeasts, attributeFilters]
  );

  const sortedUserBeasts = useMemo(() => {
    let beasts = sortBeasts(filteredUserBeasts, sortOption);

    if (showDuplicatesOnly) {
      // Group beasts by their beast type attribute to find duplicates
      const beastCounts = new Map<string, number>();
      beasts.forEach((beast) => {
        const beastTypeAttr = beast.attributes.find(
          (attr) => attr.trait_type?.toLowerCase() === "beast"
        );
        const key = beastTypeAttr?.value ? String(beastTypeAttr.value).trim().toLowerCase() : `unique_${beast.id}`;
        beastCounts.set(key, (beastCounts.get(key) || 0) + 1);
      });

      // Only keep beasts that have duplicates
      beasts = beasts.filter((beast) => {
        const beastTypeAttr = beast.attributes.find(
          (attr) => attr.trait_type?.toLowerCase() === "beast"
        );
        const key = beastTypeAttr?.value ? String(beastTypeAttr.value).trim().toLowerCase() : `unique_${beast.id}`;
        return (beastCounts.get(key) || 0) > 1;
      });
    }

    return beasts;
  }, [filteredUserBeasts, sortOption, showDuplicatesOnly]);

  const listingsToRender = useMemo(() => {
    if (activeTab !== "explore") {
      return sortedListings;
    }
    const count = Math.min(visibleListingCount, sortedListings.length);
    return sortedListings.slice(0, count);
  }, [activeTab, sortedListings, visibleListingCount]);

  const myActiveListings = useMemo(() => {
    if (!address) return [] as Listing[];
    const lower = address.toLowerCase();
    const base = showAllMyListings ? listings : sortedListings;
    return base
      .filter((listing) => listing.seller.toLowerCase() === lower);
  }, [sortedListings, listings, address, showAllMyListings]);

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

  const handleToggleCart = (beast: Beast) => {
    setCartBeasts((prev) => {
      // Check if already in cart
      const inCart = prev.some((b) => b.id === beast.id);
      if (inCart) {
        // Remove from cart
        return prev.filter((b) => b.id !== beast.id);
      }
      // Add to cart
      return [...prev, beast];
    });
  };

  const handleRemoveFromCart = (beastId: string) => {
    setCartBeasts((prev) => prev.filter((b) => b.id !== beastId));
  };

  const handleOpenCart = () => {
    if (cartBeasts.length > 0) {
      setListDialogOpen(true);
    }
  };

  const handleClearCart = () => {
    setCartBeasts([]);
  };

  // Purchase cart management
  const handleAddToPurchaseCart = (listing: Listing) => {
    setPurchaseCart((prev) => {
      // Check if already in cart
      const inCart = prev.some((l) => l.listingId === listing.listingId);
      if (inCart) {
        // Remove from cart
        return prev.filter((l) => l.listingId !== listing.listingId);
      }
      // Add to cart
      return [...prev, listing];
    });
  };

  const handleRemoveFromPurchaseCart = (listingId: string) => {
    setPurchaseCart((prev) => prev.filter((l) => l.listingId !== listingId));
  };

  const handleClearPurchaseCart = () => {
    setPurchaseCart([]);
  };

  const formatPriceLabel = useCallback((listing: Listing) => {
    const token = getPaymentTokenByAddress(listing.paymentToken ?? undefined);
    const fromSymbol = token?.symbol ?? "STRK";

    // Show price in user's chosen display currency if available
    if (displayCurrency && priceRates && fromSymbol.toUpperCase() !== displayCurrency.toUpperCase()) {
      const result = formatPriceInSymbol(listing.price, fromSymbol, displayCurrency, priceRates as any);
      if (import.meta.env.DEV) {
        console.log(`[formatPriceLabel] Converting ${listing.price} from ${fromSymbol} to ${displayCurrency}:`, result, 'rates:', priceRates);
      }
      return result;
    }

    // Otherwise show native listing token
    return formatPrice(listing.price, fromSymbol);
  }, [displayCurrency, priceRates]);

  const formatSubtitlePrice = useCallback((listing: Listing) => {
    const token = getPaymentTokenByAddress(listing.paymentToken ?? undefined);
    const fromSymbol = token?.symbol ?? "STRK";

    // Always show USDC equivalent as subtitle
    if (!priceRates) {
      if (import.meta.env.DEV) console.log('[formatSubtitlePrice] No priceRates');
      return undefined;
    }

    // Don't show subtitle if already displaying in USDC
    if (displayCurrency?.toUpperCase() === 'USDC') {
      if (import.meta.env.DEV) console.log('[formatSubtitlePrice] Already displaying in USDC');
      return undefined;
    }
    if (!displayCurrency && fromSymbol.toUpperCase() === 'USDC') {
      if (import.meta.env.DEV) console.log('[formatSubtitlePrice] Listing is in USDC and no displayCurrency selected');
      return undefined;
    }

    // Convert to USDC
    const result = formatPriceInSymbol(listing.price, fromSymbol, 'USDC', priceRates as any);
    if (import.meta.env.DEV) {
      console.log(`[formatSubtitlePrice] Converting ${listing.price} from ${fromSymbol} to USDC:`, result, 'rates:', priceRates);
    }
    return result;
  }, [displayCurrency, priceRates]);

  const handleListed = useCallback(async () => {
    // Poll for new listings since indexer takes time to sync
    const pollForUpdates = async (attempts = 3, delay = 2000) => {
      for (let i = 0; i < attempts; i++) {
        await new Promise(resolve => setTimeout(resolve, delay));
        await refetchOrders();
      }
    };

    await refetchOrders();
    await reloadUserBeasts();
    // Start polling in background
    void pollForUpdates();
  }, [refetchOrders, reloadUserBeasts]);

  const handlePurchase = useCallback(async (listing: Listing) => {
    if (!account) {
      toast.error("Please connect your wallet");
      return;
    }
    if (buyingListingId) return; // Prevent double-click

    const listingId = listing.listingId;
    setBuyingListingId(listingId);
    const toastId = toast.loading("Checking balance...");

    try {
      if (!listing.active) {
        toast.error("This listing is no longer available", { id: toastId });
        setBuyingListingId(null);
        return;
      }
      const tokenIdBigInt = toBigInt(listing.tokenId);
      const priceBigInt = toBigInt(listing.price);
      const currency = listing.paymentToken ?? DEFAULT_PAYMENT_TOKEN.address;
      const orderId = toBigInt(listing.orderId ?? 0);

      // Check balance
      const { sufficient, balance } = await checkSufficientBalance(
        account,
        currency,
        priceBigInt
      );

      if (!sufficient) {
        const token = getPaymentTokenByAddress(currency);
        const symbol = token?.symbol ?? "tokens";
        const decimals = TOKEN_DECIMALS[symbol] ?? 18;
        const requiredFormatted = fromWei(priceBigInt, decimals);
        const balanceFormatted = fromWei(balance, decimals);
        toast.error(
          `Insufficient balance. Required: ${requiredFormatted} ${symbol}, Available: ${balanceFormatted} ${symbol}`,
          { id: toastId }
        );
        setBuyingListingId(null);
        return;
      }

      // Close confirmation dialog and ensure approval
      setPurchaseConfirmOpen(false);
      toast.loading("Checking approval...", { id: toastId });
      await ensureErc20Allowance(account, currency, priceBigInt.toString());

      toast.loading("Processing purchase...", { id: toastId });
      const result = await executeListing(
        account as any,
        orderId,
        BEASTS_COLLECTION_ADDRESS,
        tokenIdBigInt,
        BigInt(listing.quantity ?? 1),
        true,
        currency,
        priceBigInt,
        BigInt(CLIENT_FEE_BP),
        CLIENT_FEE_RECEIVER
      );

      const extractTxHash = (res: any): string | undefined =>
        res?.transaction_hash || res?.hash || res?.txHash || res?.transactionHash;
      const txHash = extractTxHash(result);

      // Record tx in local activity
      const buyEntry: TxEntry = { type: 'buy', tokenId: listing.tokenId, txHash, timestamp: Date.now() };
      setMyTxs((prev): TxEntry[] => [buyEntry, ...prev].slice(0, 50));

      toast.success(txHash ? `Purchase successful! Tx: ${txHash.slice(0,8)}…${txHash.slice(-6)}` : "Purchase successful!", { id: toastId });
      await refetchOrders();
      await reloadUserBeasts();
    } catch (error) {
      const errorMessage = (error as Error).message || "Purchase failed";
      toast.error(errorMessage, { id: toastId });
    } finally {
      setBuyingListingId(null);
    }
  }, [account, buyingListingId, executeListing, refetchOrders, reloadUserBeasts]);

  const handlePurchaseAll = useCallback(async () => {
    if (!account || purchaseCart.length === 0 || purchasingBatch) return;

    setPurchasingBatch(true);
    const toastId = toast.loading(`Processing ${purchaseCart.length} purchases...`);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const listing of purchaseCart) {
        try {
          if (!listing.active) {
            failCount++;
            continue;
          }

          const tokenIdBigInt = toBigInt(listing.tokenId);
          const priceBigInt = toBigInt(listing.price);
          const currency = listing.paymentToken ?? DEFAULT_PAYMENT_TOKEN.address;
          const orderId = toBigInt(listing.orderId ?? 0);

          // Check balance
          const { sufficient } = await checkSufficientBalance(account, currency, priceBigInt);
          if (!sufficient) {
            failCount++;
            continue;
          }

          // Ensure approval
          await ensureErc20Allowance(account, currency, priceBigInt.toString());

          // Execute purchase
          await executeListing(
            account as any,
            orderId,
            BEASTS_COLLECTION_ADDRESS,
            tokenIdBigInt,
            BigInt(listing.quantity ?? 1),
            true,
            currency,
            priceBigInt,
            BigInt(CLIENT_FEE_BP),
            CLIENT_FEE_RECEIVER
          );

          successCount++;
          handleRemoveFromPurchaseCart(listing.listingId);
        } catch (error) {
          console.error(`Failed to purchase listing ${listing.listingId}:`, error);
          failCount++;
        }
      }

      // Show results
      if (successCount > 0) {
        toast.success(`Successfully purchased ${successCount} beast${successCount > 1 ? 's' : ''}!`, { id: toastId });
        await refetchOrders();
        await reloadUserBeasts();
      } else {
        toast.error("Failed to purchase any beasts", { id: toastId });
      }

      if (failCount > 0) {
        toast.warning(`${failCount} purchase${failCount > 1 ? 's' : ''} failed or skipped`);
      }

      // Close dialog if all successful
      if (successCount > 0 && failCount === 0) {
        setPurchaseCartOpen(false);
        handleClearPurchaseCart();
      }
    } catch (error) {
      const errorMessage = (error as Error).message || "Batch purchase failed";
      toast.error(errorMessage, { id: toastId });
    } finally {
      setPurchasingBatch(false);
    }
  }, [account, purchaseCart, purchasingBatch, executeListing, refetchOrders, reloadUserBeasts, handleRemoveFromPurchaseCart, handleClearPurchaseCart]);

  const handleAcceptOffer = useCallback(async (order: OrderModel) => {
    if (!account) {
      toast.error("Please connect your wallet");
      return;
    }
    if (acceptingOfferId) return; // Prevent double-click

    const offerId = order.id?.toString() || "";
    setAcceptingOfferId(offerId);
    const toastId = toast.loading("Accepting offer...");

    try {
      const tokenIdBigInt = toBigInt(order.tokenId);
      const priceBigInt = toBigInt(order.price);
      const currency = order.currency;
      const orderId = toBigInt(order.id);

      // Execute the offer (seller accepts buyer's offer)
      await executeOffer(
        account as any,
        orderId,
        BEASTS_COLLECTION_ADDRESS,
        tokenIdBigInt,
        BigInt(order.quantity ?? 1),
        true, // taker fulfills taker
        currency,
        priceBigInt,
        BigInt(CLIENT_FEE_BP),
        CLIENT_FEE_RECEIVER
      );

      toast.success("Offer accepted successfully!", { id: toastId });

      // Close the offers dialog and refresh data
      setOffersDialogOpen(false);
      await refetchOrders();
      await reloadUserBeasts();
    } catch (error) {
      const errorMessage = (error as Error).message || "Failed to accept offer";
      toast.error(errorMessage, { id: toastId });
    } finally {
      setAcceptingOfferId(null);
    }
  }, [account, acceptingOfferId, executeOffer, refetchOrders, reloadUserBeasts]);

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
        label: "Floor Price",
        value: floorPriceLabel,
      },
      {
        label: "Active Listings",
        value: totalListingsCount.toLocaleString(),
      },
      {
        label: "Your Listings",
        value: myActiveListings.length.toLocaleString(),
      },
      {
        label: "Unique Sellers",
        value: uniqueSellers.toLocaleString(),
      },
    ],
    [floorPriceLabel, myActiveListings.length, totalListingsCount, uniqueSellers]
  );

  return (
    <AppLayout topBar={<TopBar />}>
      <div className="space-y-4">
        <section className="rounded-xl border border-gray-800/50 bg-gradient-to-br from-[#0b0b0f] via-[#0f0f13] to-[#0b0b0f] p-4 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-1.5">
              <h1 className="text-xl font-bold text-lsGold">
                Beast Marketplace
              </h1>
              <p className="text-xs text-gray-400">
                Trade beasts straight from the on-chain bestiary. Discover, buy, sell, and make offers on unique NFTs.
              </p>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-2 xl:grid-cols-4">
              {heroStats.map((stat) => (
                <div
                  key={stat.label}
                  className="group relative overflow-hidden rounded-lg border border-gray-800/50 bg-gradient-to-br from-black/50 to-gray-900/30 p-3 backdrop-blur-sm transition-all duration-300 hover:border-lsGold/30 hover:shadow-lg hover:shadow-lsGold/10"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-lsGold/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <p className="relative text-[10px] font-medium uppercase tracking-wider text-gray-400 group-hover:text-gray-300">
                    {stat.label}
                  </p>
                  <p className="relative mt-1 text-lg font-bold text-white group-hover:text-lsGold transition-colors">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {(ordersLoading || ordersFetching) && (
          <div className="rounded-md border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
            Loading marketplace orders…
          </div>
        )}

        {hydratingListings && listings.length > 0 && (
          <div className="rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
            Loading beast metadata for {listings.length} listings…
          </div>
        )}

        {!hydratingListings && listings.length >= 450 && (
          <div className="rounded-md border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
            Showing first ~500 listings for performance. Use filters to narrow down results.
          </div>
        )}

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-300">
          {/* Status filter */}
          <div className="flex items-center gap-2">
            <span>Show:</span>
            <div className="inline-flex rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-1">
              {([
                { value: 'active', label: 'Active' },
                { value: 'expired', label: 'Expired' },
                { value: 'canceled', label: 'Canceled' },
                { value: 'sold', label: 'Sold' },
                { value: 'all', label: 'All' },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatusFilter(option.value)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wider transition",
                    statusFilter === option.value
                      ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white"
                      : "text-gray-400 hover:text-lsGold"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hide Expired toggle */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={hideExpired}
                onChange={(e) => setHideExpired(e.target.checked)}
                className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-lsGold focus:ring-lsGold focus:ring-offset-gray-900"
              />
              <span className="text-xs font-medium text-gray-400 group-hover:text-lsGold transition-colors">
                Hide Expired Listings
              </span>
            </label>
          </div>

          {/* Display currency selector */}
          <div className="flex items-center gap-2">
            <span>Display prices in:</span>
            <div className="inline-flex rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-1">
              {(['LORDS','STRK','ETH','USDC','SURVIVOR'] as const).map((sym) => (
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

          {/* Cart controls */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Button
              onClick={handleOpenCart}
              disabled={cartBeasts.length === 0}
              className={cn(
                "flex items-center gap-2",
                cartBeasts.length > 0
                  ? "bg-[#39ff14] text-black hover:bg-[#39ff14]/90 shadow-[0_0_15px_rgba(57,255,20,0.5)]"
                  : "bg-gray-800 text-gray-400"
              )}
              size="sm"
            >
              <ShoppingCart className="h-4 w-4" />
              List Cart ({cartBeasts.length})
            </Button>
            <Button
              onClick={() => setPurchaseCartOpen(true)}
              disabled={purchaseCart.length === 0}
              className={cn(
                "flex items-center gap-2",
                purchaseCart.length > 0
                  ? "bg-green-600 text-white hover:bg-green-600/90 shadow-lg shadow-green-600/20"
                  : "bg-gray-800 text-gray-400"
              )}
              size="sm"
            >
              <ShoppingCart className="h-4 w-4" />
              Buy Cart ({purchaseCart.length})
            </Button>
          </div>
        </div>

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
                {listingsError ? (
                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                    <p className="text-sm text-yellow-200">{listingsError}</p>
                    <Button
                      onClick={() => refetchOrders()}
                      variant="outline"
                      size="sm"
                      className="mt-3"
                    >
                      Retry
                    </Button>
                  </div>
                ) : ordersLoading || ordersFetching || hydratingListings ? (
                  <p className="text-xs text-gray-400">Loading listings…</p>
                ) : sortedListings.length === 0 ? (
                  <p className="rounded-lg border border-gray-800 bg-black/50 px-4 py-8 text-center text-xs text-gray-400">
                    No active listings match your filters yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {listingsToRender.map((listing) => {
                        const inPurchaseCart = purchaseCart.some((l) => l.listingId === listing.listingId);
                        return (
                          <ListingCard
                            key={`${listing.listingId}-${listing.tokenId}`}
                            beast={listing.beast}
                            tokenId={listing.tokenId}
                            priceLabel={formatPriceLabel(listing)}
                            subtitlePriceLabel={formatSubtitlePrice(listing)}
                            status={listing.status}
                            buyDisabled={!listing.active}
                            inCart={inPurchaseCart}
                            primaryActionLabel={inPurchaseCart ? "In Cart" : undefined}
                            onBuy={() => handleAddToPurchaseCart(listing)}
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
                            onCancel={listing.active ? async () => {
                              if (!account) {
                                toast.error("Please connect your wallet");
                                return;
                              }
                              if (cancelingListingId) return;

                              const listingId = listing.listingId;
                              setCancelingListingId(listingId);
                              const toastId = toast.loading("Canceling listing...");

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

                                toast.success("Listing canceled successfully!", { id: toastId });
                                await refetchOrders();
                                await reloadUserBeasts();
                              } catch (error) {
                                const errorMessage = (error as Error).message || "Failed to cancel listing";
                                toast.error(errorMessage, { id: toastId });
                              } finally {
                                setCancelingListingId(null);
                              }
                            } : undefined}
                            compact
                          />
                        );
                      })}
                    </div>
                    {listingsToRender.length < sortedListings.length && (
                      <p className="text-[10px] text-gray-500 text-center">
                        Rendering {listingsToRender.length} / {sortedListings.length} listings… refining as the browser is idle.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : exploreSubTab === "recent-listed" ? (
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-lsGold">Recently Listed</h2>
                  <p className="text-xs text-gray-400">Latest beasts added to the marketplace.</p>
                </div>
                {loadingRecentListings ? (
                  <p className="text-xs text-gray-400">Loading recent listings…</p>
                ) : namedRecentListings.length === 0 ? (
                  <p className="text-xs text-gray-400">No recent listings with custom names found.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {namedRecentListings.map((listing) => (
                      <ListingCard
                        key={`recent-${listing.listingId}-${listing.tokenId}`}
                        beast={listing.beast}
                        tokenId={listing.tokenId}
                        priceLabel={formatPriceLabel(listing)}
                        subtitlePriceLabel={formatSubtitlePrice(listing)}
                        status={listing.status}
                        buyDisabled={!listing.active}
                        onBuy={() => {
                          setPurchasingListing(listing);
                          setPurchaseConfirmOpen(true);
                        }}
                        onMakeOffer={() => {
                          setOfferBeast(listing.beast ?? null);
                          setOfferTokenId(listing.tokenId);
                          setMakeOfferOpen(true);
                        }}
                        onViewOffers={() => {
                          setSelectedListingForOffers(listing);
                          setOffersDialogOpen(true);
                        }}
                        compact
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-lsGold">Recently Sold</h2>
                  <p className="text-xs text-gray-400">Beasts that were recently purchased.</p>
                </div>
                {loadingSales ? (
                  <p className="text-xs text-gray-400">Loading recent sales…</p>
                ) : namedRecentSales.length === 0 ? (
                  <p className="text-xs text-gray-400">No recent sales with custom names found.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {namedRecentSales.map(({ sale, beast }) => {
                      const tokenId = sale.order.tokenId.toString();
                      const token = getPaymentTokenByAddress(sale.order.currency);
                      const symbol = token?.symbol ?? "STRK";
                      const priceLabel = formatPrice(sale.order.price.toString(), symbol);

                      return (
                        <div
                          key={`sale-${sale.id}-${tokenId}`}
                          className="group relative overflow-hidden rounded-lg border border-gray-800/50 bg-gradient-to-br from-black/40 to-gray-900/20 backdrop-blur-sm transition-all duration-300 hover:border-lsGold/30"
                        >
                          <div className="aspect-square relative bg-gradient-to-br from-gray-900/50 to-black/50 overflow-hidden">
                            {beast?.image ? (
                              <img
                                src={beast.image}
                                alt={beast.name || `Beast #${tokenId}`}
                                className="object-contain w-full h-full"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-gray-400 text-xs">
                                No image
                              </div>
                            )}
                            <div className="absolute bottom-2 left-2 bg-green-500/90 backdrop-blur-md border border-green-400/50 rounded px-2 py-1">
                              <p className="text-[10px] font-bold text-white">SOLD</p>
                            </div>
                          </div>
                          <div className="p-3 space-y-1">
                            <p className="text-xs font-semibold text-white truncate">
                              {beast?.name || `Beast #${tokenId}`}
                            </p>
                            <p className="text-xs text-lsGold font-bold">{priceLabel}</p>
                            <p className="text-[10px] text-gray-400">
                              {new Date(sale.time * 1000).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            {/* My Activity Sub-tabs */}
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
                My Active Listings
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
                Your Beasts
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
                Recent Transactions
              </button>
            </div>

            {myActivitySubTab === "listings" ? (
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-lsGold">
                    My Listings
                  </h2>
                  <p className="text-xs text-gray-400">
                    Edit prices or cancel live orders.
                  </p>

                  <div className="mt-2 flex items-center gap-3">
                    <label className="flex items-center gap-2 text-[11px] text-gray-400">
                      <input
                        type="checkbox"
                        checked={showAllMyListings}
                        onChange={(e) => setShowAllMyListings(e.target.checked)}
                      />
                      Show all my listings (ignore Explore filters)
                    </label>
                    {hiddenListingIds.size > 0 && (
                      <button
                        type="button"
                        className="text-[11px] rounded border border-gray-700 px-2 py-1 text-gray-300 hover:bg-gray-800"
                        onClick={() => setHiddenListingIds(new Set())}
                        title="Clear locally hidden listings"
                      >
                        Clear hidden ({hiddenListingIds.size})
                      </button>
                    )}
                  </div>
                </div>
                {ordersLoading || ordersFetching || hydratingListings ? (
                <p className="text-xs text-gray-400">Loading your listings…</p>
              ) : myActiveListings.length === 0 ? (
                <p className="text-xs text-gray-400">
                  You have no listings that match your filters.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {myActiveListings.map((listing) => (
                    <ListingCard
                      key={`${listing.listingId}-${listing.tokenId}`}
                      beast={listing.beast}
                      tokenId={listing.tokenId}
                      priceLabel={formatPriceLabel(listing)}
                      subtitlePriceLabel={formatSubtitlePrice(listing)}
                      status={listing.status}
                      pendingCancel={hiddenListingIds.has(listing.listingId)}
                      ownedByUser
                      onEdit={() => {
                        setEditingListing(listing);
                        setEditDialogOpen(true);
                      }}
                      onCancel={listing.active ? async () => {
                        if (!account) {
                          toast.error("Please connect your wallet");
                          return;
                        }
                        if (cancelingListingId) return; // Prevent double-click

                        const listingId = listing.listingId;
                        setCancelingListingId(listingId);
                        const toastId = toast.loading("Canceling listing...");

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

                          toast.success("Listing canceled successfully!", { id: toastId });
                          await refetchOrders();
                          await reloadUserBeasts();
                        } catch (error) {
                          const errorMessage = (error as Error).message || "Failed to cancel listing";
                          toast.error(errorMessage, { id: toastId });
                        } finally {
                          setCancelingListingId(null);
                        }
                      } : undefined}
                      onViewOffers={() => {
                        setSelectedListingForOffers(listing);
                        setOffersDialogOpen(true);
                      }}
                      compact
                    />
                  ))}
                </div>
                )}
              </div>
            ) : myActivitySubTab === "beasts" ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-lsGold">Your Beasts</h2>
                    <p className="text-xs text-gray-400">List directly from your collection.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                      variant="outline"
                      className={cn(
                        "flex items-center gap-2",
                        showDuplicatesOnly && "border-lsGold text-lsGold"
                      )}
                    >
                      {showDuplicatesOnly ? "Show All" : "Show Duplicates"}
                    </Button>
                  </div>
              </div>
              {address ? (
                userBeastsError ? (
                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                    <p className="text-sm text-yellow-200">{userBeastsError}</p>
                    <Button
                      onClick={() => reloadUserBeasts()}
                      variant="outline"
                      size="sm"
                      className="mt-3"
                    >
                      Retry
                    </Button>
                  </div>
                ) : userBeastsLoading ? (
                  <p className="text-xs text-gray-400">Loading your beasts…</p>
                ) : userBeasts.length === 0 ? (
                  <p className="text-xs text-gray-400">No beasts found for this wallet.</p>
                ) : sortedUserBeasts.length === 0 ? (
                  <p className="text-xs text-gray-400">No beasts match your current filters.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {sortedUserBeasts.map((beast) => {
                      const inCart = cartBeasts.some((b) => b.id === beast.id);
                      return (
                        <ListingCard
                          key={beast.id}
                          beast={beast}
                          tokenId={beast.id}
                          ownedByUser
                          onEdit={() => handleToggleCart(beast)}
                          onCancel={undefined}
                          compact
                          primaryActionLabel={inCart ? "Added ✓" : "List"}
                          inCart={inCart}
                        />
                      );
                    })}
                  </div>
                )
              ) : (
                <p className="text-xs text-gray-400">Connect your wallet to see your beasts.</p>
              )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-lsGold">Recent Transactions</h2>
                  <p className="text-xs text-gray-400">Actions you performed in this session.</p>
                </div>
                {myTxs.length === 0 ? (
                  <p className="text-xs text-gray-400">No recent actions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {myTxs.map((tx, idx) => {
                      const hash = tx.txHash;
                      const explorerHref = hash ? `${VOYAGER_BASE}/tx/${hash}` : undefined;
                      const actionLabel = tx.type.toUpperCase();
                      const description = tx.note
                        ? tx.note
                        : `Beast #${tx.tokenId}`;

                      return (
                        <div key={idx} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                          <div className="text-xs text-gray-300">
                            <div className="font-semibold text-white">{actionLabel}: {description}</div>
                            <div className="text-gray-400">{new Date(tx.timestamp).toLocaleString()}</div>
                            {hash ? (
                              <div className="mt-1 text-[11px] text-gray-400 font-mono break-all">{hash}</div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            {hash ? (
                              <>
                                <button
                                  type="button"
                                  className="text-[11px] rounded border border-gray-700 px-2 py-1 text-gray-200 hover:bg-gray-800"
                                  onClick={() => navigator.clipboard?.writeText(hash)}
                                  title="Copy transaction hash"
                                >
                                  Copy Hash
                                </button>
                                <a
                                  href={explorerHref}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] rounded border border-lsGold/50 px-2 py-1 text-lsGold hover:bg-lsGold/10"
                                >
                                  View on Voyager
                                </a>
                              </>
                            ) : (
                              <span className="text-[11px] text-gray-500">Pending hash</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <CartListDialog
          open={listDialogOpen}
          onOpenChange={(open) => setListDialogOpen(open)}
          beasts={cartBeasts}
          existingListings={listings}
          onListed={async (results) => {
            // Record listing transactions in My Activity
            const listEntries: TxEntry[] = results.map((result) => ({
              type: 'list',
              tokenId: result.tokenId,
              txHash: result.txHash,
              timestamp: Date.now(),
              note: `${result.beastName} for ${result.price} ${result.currency}`,
            }));
            setMyTxs((prev): TxEntry[] => [...listEntries, ...prev].slice(0, 100));

            handleListed();
            handleClearCart();
            try {
              await refetchOrders();
              await reloadUserBeasts();
            } catch {}
          }}
          onRemoveBeast={handleRemoveFromCart}
          onClearCart={handleClearCart}
        />

        <EditListingDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          listing={editingListing}
          account={account}
          cancel={cancel}
          list={list}
          onEdited={async () => {
            await refetchOrders();
            await reloadUserBeasts();
          }}
        />

        <PurchaseConfirmDialog
          open={purchaseConfirmOpen}
          onOpenChange={setPurchaseConfirmOpen}
          listing={purchasingListing}
          priceLabel={purchasingListing ? formatPriceLabel(purchasingListing) : ""}
          onConfirm={() => {
            if (purchasingListing) {
              handlePurchase(purchasingListing);
            }
          }}
          isProcessing={!!buyingListingId}
        />

        <MakeOfferDialog
          open={makeOfferOpen}
          onOpenChange={setMakeOfferOpen}
          beast={offerBeast}
          tokenId={offerTokenId}
          onOfferMade={() => {
            // Refresh listings to show new offer count
            refetchOrders();
          }}
        />

        <OffersDialog
          open={offersDialogOpen}
          onOpenChange={setOffersDialogOpen}
          tokenId={selectedListingForOffers?.tokenId ?? ""}
          orders={offersForToken}
          isOwner={address?.toLowerCase() === selectedListingForOffers?.seller?.toLowerCase()}
          onAcceptOffer={handleAcceptOffer}
          isAccepting={!!acceptingOfferId}
        />

        <PurchaseCartDialog
          open={purchaseCartOpen}
          onOpenChange={setPurchaseCartOpen}
          listings={purchaseCart}
          onRemove={handleRemoveFromPurchaseCart}
          onClearAll={handleClearPurchaseCart}
          onPurchaseAll={handlePurchaseAll}
          isProcessing={purchasingBatch}
          displayCurrency={displayCurrency}
          priceRates={priceRates}
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
