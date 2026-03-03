import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

// CSS injection for shimmer animation
const shimmerStyles = `
  @keyframes shimmer {
    0% { transform: translateX(-200%) skewX(12deg); }
    100% { transform: translateX(200%) skewX(12deg); }
  }
`;

// Inject styles
if (typeof document !== "undefined") {
  const styleElement =
    document.getElementById("shimmer-styles-collection") ||
    document.createElement("style");
  if (!document.getElementById("shimmer-styles-collection")) {
    styleElement.id = "shimmer-styles-collection";
    styleElement.textContent = shimmerStyles;
    document.head.appendChild(styleElement);
  }
}
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import BeastCard from "../components/beast/BeastCard";
import BeastModal from "../components/beast/BeastModal";
import { BeastTableView } from "../components/beast/BeastTableView";
import { Grid, Table } from "lucide-react";
import {
  fetchBeastAttributeFilters,
  fetchBeasts,
  fetchBeastCombinedRanks,
  fetchOwnerBeastStats,
  fetchOwnerBeastHighlights,
  type Beast,
  type BeastPowerRank,
  type BeastHealthRank,
  type OwnerBeastStats,
  type OwnerBeastHighlights,
} from "../services/beast";
import { useControllerUsernames } from "../hooks/useControllerUsernames";
import {
  computeBeastCollectionStats,
  EMPTY_BEAST_COLLECTION_STATS,
  TOTAL_BEAST_VARIETIES,
  calculateCategoryDuplicateCounts,
} from "../utils/beastCollection";
import { normaliseStarknetAddress } from "../utils/address";
import { lookupControllerAddresses } from "../services/controller";
import { getUserFriendlyErrorMessage, isSqlEndpointError } from "../utils/error";
import SortDropdown, { type SortOption, sortOptionToBeastSortField } from "../components/sort/SortDropdown";
import { Button } from "../components/ui/button";
import { getBeastTemplate } from "../data/beastTemplates";
import { runBeastSql } from "../services/beast/sqlClient";
import { mapBeastRow } from "../services/beast/helpers";
import { apiCache } from "../services/apiCache";
import { fetchOwnerSummitRankFromApi, type OwnerSummitRank } from "../services/summitApi";
import { ThreeColumnStatsLayout } from "../components/layout/ThreeColumnStatsLayout";
import type { OverviewCard } from "../components/account/OverviewCards";

const TABS = [
  { key: "all", label: "All" },
  { key: "standard", label: "Standard" },
  { key: "shiny", label: "Shiny" },
  { key: "animated", label: "Animated" },
  { key: "animatedShiny", label: "Animated Shiny" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type TypeEntry = {
  key: string;
  label: string;
};

type CatalogRecord = Record<string, Beast | undefined>;

type CategoryMaps = {
  animatedShiny: Map<string, Beast>;
  animated: Map<string, Beast>;
  shiny: Map<string, Beast>;
  standard: Map<string, Beast>;
};

const TAB_STYLES: Record<TabKey, { active: string; inactive: string }> = {
  standard: {
    active: "border-lsGold bg-white text-black",
    inactive: "border-green-400/40",
  },
  animated: {
    active: "border-lsGold bg-sky-400 text-black",
    inactive: "border-sky-400/40",
  },
  shiny: {
    active: "border-lsGold bg-yellow-300 text-black",
    inactive: "border-yellow-300/40",
  },
  animatedShiny: {
    active: "border-lsGold bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 text-black",
    inactive: "border-pink-400/40",
  },
  all: {
    active: "border-lsGold bg-lsGreen text-orange-200",
    inactive: "border-pink-400/40",
  },
};

function normaliseTypeValue(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function getBeastTypeKey(beast: Beast): string {
  const attribute = beast.attributes.find(
    (attr) => attr.trait_type?.toLowerCase() === "beast"
  );
  return normaliseTypeValue(attribute?.value);
}

function isAnimated(attrValue: unknown): boolean {
  return (
    attrValue === "1" ||
    attrValue === 1 ||
    attrValue === true ||
    attrValue === "true"
  );
}

function buildCategoryMaps(beasts: Beast[]): CategoryMaps {
  const maps: CategoryMaps = {
    animatedShiny: new Map(),
    animated: new Map(),
    shiny: new Map(),
    standard: new Map(),
  };

  beasts.forEach((beast) => {
    const typeKey = getBeastTypeKey(beast);
    if (!typeKey) return;

    const animatedAttr = beast.attributes.find(
      (attr) => attr.trait_type?.toLowerCase() === "animated"
    )?.value;
    const shinyAttr = beast.attributes.find(
      (attr) => attr.trait_type?.toLowerCase() === "shiny"
    )?.value;
    const animated = isAnimated(animatedAttr);
    const shiny = isAnimated(shinyAttr);

    if (animated && shiny) {
      if (!maps.animatedShiny.has(typeKey)) {
        maps.animatedShiny.set(typeKey, beast);
      }
      return;
    }
    if (animated) {
      if (!maps.animated.has(typeKey)) {
        maps.animated.set(typeKey, beast);
      }
      return;
    }
    if (shiny) {
      if (!maps.shiny.has(typeKey)) {
        maps.shiny.set(typeKey, beast);
      }
      return;
    }
    if (!maps.standard.has(typeKey)) {
      maps.standard.set(typeKey, beast);
    }
  });

  return maps;
}

function checkHasAllVariants(
  beastTypeKey: string,
  categoryMaps: CategoryMaps
): boolean {
  return (
    categoryMaps.standard.has(beastTypeKey) &&
    categoryMaps.shiny.has(beastTypeKey) &&
    categoryMaps.animated.has(beastTypeKey) &&
    categoryMaps.animatedShiny.has(beastTypeKey)
  );
}

function CollectionPage() {
  const { identifier = "" } = useParams<{ identifier: string }>();

  const [filtersError, setFiltersError] = useState<string | null>(null);

  const [collectionStats, setCollectionStats] = useState(
    EMPTY_BEAST_COLLECTION_STATS
  );
  const [summitRank, setSummitRank] = useState<OwnerSummitRank | null>(null);
  const [ownerStats, setOwnerStats] = useState<OwnerBeastStats | null>(null);
  const [beastHighlights, setBeastHighlights] = useState<OwnerBeastHighlights | null>(null);
  const [accountRanking, setAccountRanking] = useState<BeastPowerRank | null>(null);
  const [healthRanking, setHealthRanking] = useState<BeastHealthRank | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [resolvedAddress, setResolvedAddress] = useState<string>("");
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [resolvingIdentifier, setResolvingIdentifier] = useState(false);

  const [ownedBeasts, setOwnedBeasts] = useState<Beast[]>([]);

  const [beastTypes, setBeastTypes] = useState<TypeEntry[]>([]);
  const [catalog, setCatalog] = useState<CatalogRecord>({});
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError] = useState<string | null>(null);
  const [genesisLoading] = useState(false);
  const [genesisCache, setGenesisCache] = useState<Map<string, Beast>>(
    new Map()
  );

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const summaryRequestRef = useRef(0);

  const trimmedIdentifier = identifier.trim();

  const initialAddressCandidate = useMemo(() => {
    if (!trimmedIdentifier) return "";
    const normalised = normaliseStarknetAddress(trimmedIdentifier);
    if (normalised && normalised.startsWith("0x")) {
      return normalised;
    }
    return "";
  }, [trimmedIdentifier]);

  const identifierIsUsername = useMemo(
    () => Boolean(trimmedIdentifier) && initialAddressCandidate.length === 0,
    [initialAddressCandidate, trimmedIdentifier]
  );

  useEffect(() => {
    let cancelled = false;

    if (!trimmedIdentifier) {
      setResolvedAddress("");
      setIdentifierError("Missing account identifier.");
      setResolvingIdentifier(false);
      return () => {
        cancelled = true;
      };
    }

    if (initialAddressCandidate) {
      setResolvedAddress(initialAddressCandidate);
      setIdentifierError(null);
      setResolvingIdentifier(false);
      return () => {
        cancelled = true;
      };
    }

    const usernameKey = trimmedIdentifier.toLowerCase();
    setResolvingIdentifier(true);
    lookupControllerAddresses([trimmedIdentifier])
      .then((result) => {
        if (cancelled) return;
        const addresses = result[usernameKey] ?? [];
        if (addresses.length > 0) {
          setResolvedAddress(addresses[0]);
          setIdentifierError(null);
        } else {
          setResolvedAddress("");
          setIdentifierError(
            `No wallet address found for "${trimmedIdentifier}".`
          );
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResolvedAddress("");
        setIdentifierError(getUserFriendlyErrorMessage(err, "Failed to resolve username"));
      })
      .finally(() => {
        if (!cancelled) {
          setResolvingIdentifier(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialAddressCandidate, trimmedIdentifier]);

  const ownerLookupAddresses = useMemo(() => {
    const unique = new Set<string>();
    if (resolvedAddress) {
      unique.add(resolvedAddress);
    }
    ownedBeasts.forEach((beast) => {
      if (beast.owner) {
        unique.add(beast.owner);
      }
    });
    return Array.from(unique).filter(Boolean);
  }, [ownedBeasts, resolvedAddress]);

  // Defer username lookups to allow beasts to render first
  const { usernames: ownerUsernames } =
    useControllerUsernames(ownerLookupAddresses, { delayMs: 300 });

  const loadSummary = useCallback(async () => {
    if (resolvingIdentifier) {
      return;
    }

    if (!resolvedAddress) {
      setCollectionStats(EMPTY_BEAST_COLLECTION_STATS);
      setOwnedBeasts([]);
      setSummitRank(null);
      setOwnerStats(null);
      setBeastHighlights(null);
      setAccountRanking(null);
      setHealthRanking(null);
      setSummaryError(identifierError);
      setSummaryLoading(false);
      return;
    }

    summaryRequestRef.current += 1;
    const requestId = summaryRequestRef.current;
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      // Fetch extra stats in parallel with beast loading
      Promise.all([
        fetchOwnerSummitRankFromApi(resolvedAddress).catch(() => null),
        fetchBeastCombinedRanks(resolvedAddress).catch(() => ({ powerRank: null, healthRank: null })),
        fetchOwnerBeastStats(resolvedAddress).catch(() => null),
        fetchOwnerBeastHighlights(resolvedAddress).catch(() => null),
      ]).then(([summit, ranks, stats, highlights]) => {
        if (summaryRequestRef.current === requestId) {
          setSummitRank(summit);
          setAccountRanking(ranks.powerRank);
          setHealthRanking(ranks.healthRank);
          setOwnerStats(stats);
          setBeastHighlights(highlights);
        }
      });

      // Load ALL user's beasts efficiently (we only need their collection, not random samples)
      const limit = 300; // Larger batch for faster loading
      let allUserBeasts: Beast[] = [];
      let currentPage = 1;
      let hasMoreData = true;

      // Load user's collection in batches
      while (hasMoreData && allUserBeasts.length < 15000) {
        // Safety limit (supports large collections)
        const { beasts: batch, total } = await fetchBeasts({
          limit,
          page: currentPage,
          ownerAddresses: [resolvedAddress],
          sort: sortOptionToBeastSortField(sortOption),
        });

        if (summaryRequestRef.current !== requestId) {
          return;
        }

        allUserBeasts = [...allUserBeasts, ...batch];

        // Update UI immediately with current data
        setOwnedBeasts(allUserBeasts);
        setCollectionStats(computeBeastCollectionStats(allUserBeasts));

        // Check if we have more data
        hasMoreData = batch.length === limit && allUserBeasts.length < total;
        currentPage++;

        // Early break if we have all the data
        if (allUserBeasts.length >= total || batch.length < limit) {
          hasMoreData = false;
        }
      }
    } catch (err: unknown) {
      if (summaryRequestRef.current !== requestId) {
        return;
      }
      console.error("Failed to load collection summary", err);
      setOwnedBeasts([]);
      setCollectionStats(EMPTY_BEAST_COLLECTION_STATS);
      setSummitRank(null);
      setOwnerStats(null);
      setBeastHighlights(null);
      setAccountRanking(null);
      setHealthRanking(null);
      setSummaryError(getUserFriendlyErrorMessage(err, "Failed to load collection"));
    } finally {
      if (summaryRequestRef.current === requestId) {
        setSummaryLoading(false);
      }
    }
  }, [identifierError, resolvedAddress, resolvingIdentifier, sortOption]);

  // Removed loadMoreBeasts - we now load all user beasts upfront

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // Clean up state when address changes
  useEffect(() => {
    setOwnedBeasts([]);
    setCollectionStats(EMPTY_BEAST_COLLECTION_STATS);
  }, [resolvedAddress]);

  // Helper function to format beast ID as u256
  const formatBeastId = useCallback((id: number): string => {
    return `0x${id.toString(16).padStart(64, "0")}`;
  }, []);

  // Function to get Genesis beast type key
  const getGenesisBeastTypeKey = useCallback((beast: Beast): string => {
    const attribute = beast.attributes.find(
      (attr) => attr.trait_type?.toLowerCase() === "beast"
    );
    return String(attribute?.value ?? "")
      .trim()
      .toLowerCase();
  }, []);

  // Load all Genesis beasts with a single SQL query
  const loadAllGenesisBeasts = useCallback(async (): Promise<
    Map<string, Beast>
  > => {
    try {
      // Generate all Genesis beast IDs (1-75) as u256 format
      const genesisIds = Array.from({ length: 75 }, (_, i) =>
        formatBeastId(i + 1)
      );

      // Build a simple SQL query to fetch all Genesis beasts at once
      const escapedIds = genesisIds.map((id) => `"${id}"`).join(", ");

      const query = `SELECT * FROM tokens WHERE contract_address = "0x046da8955829adf2bda310099a0063451923f02e648cf25a1203aac6335cf0e4" AND token_id IN (${escapedIds}) LIMIT 1000;`;

      const rows = await runBeastSql(query, "loadAllGenesisBeasts");
      const beasts = (rows as any[]).map(mapBeastRow);

      const genesisMap = new Map<string, Beast>();

      beasts.forEach((beast: any) => {
        if (beast) {
          const typeKey = getGenesisBeastTypeKey(beast);
          if (typeKey && !genesisMap.has(typeKey)) {
            genesisMap.set(typeKey, beast);
          }
        }
      });

      return genesisMap;
    } catch (error) {
      console.error("Failed to load Genesis beasts:", error);
      return new Map();
    }
  }, [formatBeastId, getGenesisBeastTypeKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadFiltersAndGenesis() {
      try {
        setFiltersError(null);

        // Load both filters and Genesis beasts in parallel
        const [filters, genesisMap] = await Promise.all([
          fetchBeastAttributeFilters(),
          loadAllGenesisBeasts(),
        ]);

        if (cancelled) return;

        // Process beast types
        const beastTrait = Object.keys(filters).find(
          (trait) => trait.toLowerCase() === "beast"
        );
        const values = beastTrait ? filters[beastTrait] ?? [] : [];
        const uniqueEntries: TypeEntry[] = [];
        const seen = new Set<string>();
        values.forEach((value) => {
          const label = String(value ?? "").trim();
          const key = label.toLowerCase();
          if (!label || seen.has(key)) return;
          seen.add(key);
          uniqueEntries.push({ key, label });
        });
        uniqueEntries.sort((a, b) => a.label.localeCompare(b.label));

        // Update both states at the same time
        setBeastTypes(uniqueEntries);
        setGenesisCache(genesisMap);
      } catch (err: unknown) {
        if (cancelled) return;
        setFiltersError(getUserFriendlyErrorMessage(err, "Failed to load beast list"));
      }
    }

    void loadFiltersAndGenesis();
    return () => {
      cancelled = true;
    };
  }, [loadAllGenesisBeasts]);

  // Build catalog using Genesis beasts + fallback templates
  useEffect(() => {
    if (beastTypes.length === 0) {
      setCatalog({});
      setCatalogLoading(false);
      return;
    }

    const templateCatalog: CatalogRecord = {};

    beastTypes.forEach(({ key, label }) => {
      // Check if we have a Genesis beast cached for this type
      const cachedGenesis = genesisCache.get(key);

      if (cachedGenesis) {
        // Use cached Genesis beast
        templateCatalog[key] = {
          ...cachedGenesis,
          id: `genesis-template-${key}`,
        };
      } else {
        // Use static template as fallback
        const template = getBeastTemplate(key);
        templateCatalog[key] = {
          id: `template-${key}`,
          numericId: 0,
          name: label,
          image: template.placeholderImage,
          owner: null,
          attributes: [
            {
              trait_type: "beast",
              value: label,
            },
          ],
          metadata: { attributes: [] },
          power: null,
        };
      }
    });

    setCatalog(templateCatalog);
    setCatalogLoading(false);
  }, [beastTypes, genesisCache]); // Build catalog when beast types or Genesis cache change

  const categoryMaps = useMemo(
    () => buildCategoryMaps(ownedBeasts),
    [ownedBeasts]
  );

  const categoryDuplicateCounts = useMemo(
    () => calculateCategoryDuplicateCounts(ownedBeasts),
    [ownedBeasts]
  );

  // Build index of beasts by type and category for O(1) duplicate lookups
  const beastsByTypeAndCategory = useMemo(() => {
    const index: Record<TabKey, Map<string, Beast[]>> = {
      all: new Map(),
      standard: new Map(),
      shiny: new Map(),
      animated: new Map(),
      animatedShiny: new Map(),
    };

    ownedBeasts.forEach((beast) => {
      const typeKey = getBeastTypeKey(beast);
      if (!typeKey) return;

      // Add to "all" category
      const allList = index.all.get(typeKey) || [];
      allList.push(beast);
      index.all.set(typeKey, allList);

      // Determine specific category
      const animatedAttr = beast.attributes.find(
        (attr) => attr.trait_type?.toLowerCase() === "animated"
      )?.value;
      const shinyAttr = beast.attributes.find(
        (attr) => attr.trait_type?.toLowerCase() === "shiny"
      )?.value;
      const animated = isAnimated(animatedAttr);
      const shiny = isAnimated(shinyAttr);

      let category: TabKey;
      if (animated && shiny) {
        category = "animatedShiny";
      } else if (animated) {
        category = "animated";
      } else if (shiny) {
        category = "shiny";
      } else {
        category = "standard";
      }

      const categoryList = index[category].get(typeKey) || [];
      categoryList.push(beast);
      index[category].set(typeKey, categoryList);
    });

    return index;
  }, [ownedBeasts]);

  // Use template-based placeholders - much faster!
  const placeholderCache = useMemo(() => {
    const cache = new Map<string, Beast | null>();
    beastTypes.forEach(({ key }) => {
      cache.set(key, catalog[key] || null);
    });
    return cache;
  }, [beastTypes, catalog]);

  // Memoize the expensive tabEntries calculation
  const tabEntriesForCategory = useMemo(() => {
    // Pre-calculate commonly used values to avoid repeated work
    const precomputedData = beastTypes.map(({ key, label }) => ({
      key,
      label,
      animatedShinyOwned: categoryMaps.animatedShiny.get(key) ?? null,
      animatedOwned: categoryMaps.animated.get(key) ?? null,
      shinyOwned: categoryMaps.shiny.get(key) ?? null,
      standardOwned: categoryMaps.standard.get(key) ?? null,
      placeholder: placeholderCache.get(key) ?? null,
    }));

    return precomputedData;
  }, [beastTypes, categoryMaps, placeholderCache]);

  // Memoize the username resolver to avoid recreating it
  const resolveOwnerUsername = useCallback(
    (beast: Beast | null): string | null => {
      if (!beast?.owner) return null;
      const normalizedOwner = normaliseStarknetAddress(beast.owner);
      return normalizedOwner ? ownerUsernames[normalizedOwner] ?? null : null;
    },
    [ownerUsernames]
  );

  const tabEntries = useMemo(() => {
    const entries: Record<
      TabKey,
      Array<{
        id: string;
        label: string;
        beast: Beast | null;
        missing: boolean;
        ownerUsername: string | null;
        duplicateCount: number;
        hasAllVariants: boolean;
      }>
    > = {
      all: [],
      standard: [],
      animated: [],
      shiny: [],
      animatedShiny: [],
    };

    tabEntriesForCategory.forEach(
      ({
        key,
        label,
        animatedShinyOwned,
        animatedOwned,
        shinyOwned,
        standardOwned,
        placeholder,
      }) => {
        const hasAllVariants = checkHasAllVariants(key, categoryMaps);

        // Standard tab
        const standardPlaceholder = standardOwned ?? placeholder;
        if (!standardPlaceholder) {
          console.warn(
            `No placeholder found for beast type: ${key} in standard tab`
          );
        }
        entries.standard.push({
          id: `${key}-standard`,
          label,
          beast: standardPlaceholder,
          missing: !standardOwned,
          ownerUsername: resolveOwnerUsername(standardOwned),
          duplicateCount: categoryDuplicateCounts.standard.get(key) || 0,
          hasAllVariants,
        });

        // Shiny tab
        entries.shiny.push({
          id: `${key}-shiny`,
          label,
          beast: shinyOwned ?? placeholder,
          missing: !shinyOwned,
          ownerUsername: resolveOwnerUsername(shinyOwned),
          duplicateCount: categoryDuplicateCounts.shiny.get(key) || 0,
          hasAllVariants,
        });

        // Animated tab
        entries.animated.push({
          id: `${key}-animated`,
          label,
          beast: animatedOwned ?? placeholder,
          missing: !animatedOwned,
          ownerUsername: resolveOwnerUsername(animatedOwned),
          duplicateCount: categoryDuplicateCounts.animated.get(key) || 0,
          hasAllVariants,
        });

        // Animated Shiny tab
        entries.animatedShiny.push({
          id: `${key}-animatedShiny`,
          label,
          beast: animatedShinyOwned ?? placeholder,
          missing: !animatedShinyOwned,
          ownerUsername: resolveOwnerUsername(animatedShinyOwned),
          duplicateCount: categoryDuplicateCounts.animatedShiny.get(key) || 0,
          hasAllVariants,
        });

        // All tab → pick *one* (any rarity)
        const anyOwned =
          animatedShinyOwned ??
          animatedOwned ??
          shinyOwned ??
          standardOwned ??
          null;

        entries.all.push({
          id: `${key}-all`,
          label,
          beast: anyOwned ?? placeholder,
          missing: !anyOwned,
          ownerUsername: resolveOwnerUsername(anyOwned),
          duplicateCount: categoryDuplicateCounts.all.get(key) || 0,
          hasAllVariants,
        });
      }
    );

    // Apply sorting to entries based on sortOption
    const sortedEntries: typeof entries = {
      all: [...entries.all],
      standard: [...entries.standard],
      animated: [...entries.animated],
      shiny: [...entries.shiny],
      animatedShiny: [...entries.animatedShiny],
    };

    if (sortOption !== "default") {
      Object.keys(sortedEntries).forEach((tabKey) => {
        const tabEntries = sortedEntries[tabKey as TabKey];

        // Extract base field from sortOption (e.g., "beast-asc" -> "beast")
        const baseSortField = sortOptionToBeastSortField(sortOption);

        switch (baseSortField) {
          case "beast":
            tabEntries.sort((a, b) => a.label.localeCompare(b.label));
            break;
          case "tier":
            tabEntries.sort((a, b) => {
              const getTier = (entry: (typeof tabEntries)[0]) => {
                if (!entry.beast) return 999;
                const tierAttr = entry.beast.attributes.find(
                  (attr) => attr.trait_type?.toLowerCase() === "tier"
                );
                return tierAttr?.value ? Number(tierAttr.value) : 999;
              };
              const tierA = getTier(a);
              const tierB = getTier(b);
              // If tiers are the same, put missing beasts after owned ones
              if (tierA === tierB) {
                if (a.missing && !b.missing) return 1;
                if (!a.missing && b.missing) return -1;
                return 0;
              }
              return tierA - tierB;
            });
            break;
          case "health":
            tabEntries.sort((a, b) => {
              const getHealth = (entry: (typeof tabEntries)[0]) => {
                if (!entry.beast || entry.missing) return 0;
                const healthAttr = entry.beast.attributes.find(
                  (attr) => attr.trait_type?.toLowerCase() === "health"
                );
                return healthAttr?.value ? Number(healthAttr.value) : 0;
              };
              const healthA = getHealth(a);
              const healthB = getHealth(b);
              return healthB - healthA; // High to low
            });
            break;
          case "rank":
            tabEntries.sort((a, b) => {
              const getRank = (entry: (typeof tabEntries)[0]) => {
                if (!entry.beast || entry.missing) return 999999;
                const rankAttr = entry.beast.attributes.find(
                  (attr) => attr.trait_type?.toLowerCase() === "rank"
                );
                return rankAttr?.value ? Number(rankAttr.value) : 999999;
              };
              const rankA = getRank(a);
              const rankB = getRank(b);
              return rankA - rankB; // Low to high
            });
            break;
          case "last-death":
            tabEntries.sort((a, b) => {
              const getLastDeath = (entry: (typeof tabEntries)[0]) => {
                if (!entry.beast || entry.missing) return 0;
                const deathAttr = entry.beast.attributes.find(
                  (attr) =>
                    attr.trait_type?.toLowerCase() === "last death timestamp"
                );
                return deathAttr?.value ? Number(deathAttr.value) : 0;
              };
              const deathA = getLastDeath(a);
              const deathB = getLastDeath(b);
              return deathB - deathA; // Recent first
            });
            break;
        }
      });
    }

    if (showDuplicatesOnly) {
      Object.keys(sortedEntries).forEach((tabKey) => {
        sortedEntries[tabKey as TabKey] = sortedEntries[
          tabKey as TabKey
        ].filter((entry) => !entry.missing && entry.duplicateCount > 1);
      });
    }

    return sortedEntries;
  }, [
    tabEntriesForCategory,
    resolveOwnerUsername,
    categoryDuplicateCounts,
    categoryMaps,
    sortOption,
    showDuplicatesOnly,
  ]);

  const anyLoading =
    summaryLoading || catalogLoading || resolvingIdentifier || genesisLoading;

  const normalisedAccountAddress = useMemo(
    () =>
      resolvedAddress
        ? normaliseStarknetAddress(resolvedAddress) ?? resolvedAddress
        : "",
    [resolvedAddress]
  );

  const accountUsername = useMemo(() => {
    if (!normalisedAccountAddress) return null;
    const key = normalisedAccountAddress.toLowerCase();
    return ownerUsernames[key] ?? null;
  }, [normalisedAccountAddress, ownerUsernames]);

  const displayName = useMemo(() => {
    if (accountUsername) {
      return accountUsername;
    }
    if (identifierIsUsername && trimmedIdentifier) {
      return trimmedIdentifier;
    }
    if (!normalisedAccountAddress) {
      return trimmedIdentifier || "Unknown";
    }
    if (normalisedAccountAddress.length <= 12) {
      return normalisedAccountAddress;
    }
    return `${normalisedAccountAddress.slice(
      0,
      6
    )}…${normalisedAccountAddress.slice(-4)}`;
  }, [
    accountUsername,
    identifierIsUsername,
    normalisedAccountAddress,
    trimmedIdentifier,
  ]);

  const displayNameClass =
    accountUsername || identifierIsUsername ? "" : "font-mono";

  // Most powerful beast is the first beast (sorted by default power)
  const mostPowerfulBeast = useMemo(
    () => (ownedBeasts.length > 0 ? ownedBeasts[0] : null),
    [ownedBeasts]
  );

  const mostPowerfulTitle = useMemo(() => {
    const name = mostPowerfulBeast?.name;
    if (!name) return null;
    const trimmed = name.trim();
    const quotedMatch = trimmed.match(/"([^"]+)"/);
    if (quotedMatch?.[1]) return quotedMatch[1];
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
    if (parts.length === 1) return parts[0];
    return null;
  }, [mostPowerfulBeast]);

  const rankDisplay =
    accountRanking?.rank != null
      ? `#${accountRanking.rank.toLocaleString()}`
      : "—";
  const rankSubheading = accountRanking?.totalOwners
    ? `of ${accountRanking.totalOwners.toLocaleString()}`
    : "";

  // Display stats for ThreeColumnStatsLayout
  const displayStats = useMemo(() => ({
    animatedShinyCount: collectionStats.animatedShinyCount,
    animatedCount: collectionStats.animatedCount,
    shinyCount: collectionStats.shinyCount,
    standardCount: collectionStats.standardCount,
    uniqueBeastTypes: collectionStats.uniqueBeastTypes,
    uniqueAnimatedShinyTypes: collectionStats.uniqueAnimatedShinyTypes,
    uniqueAnimatedTypes: collectionStats.uniqueAnimatedTypes,
    uniqueShinyTypes: collectionStats.uniqueShinyTypes,
    uniqueStandardTypes: collectionStats.uniqueStandardTypes,
    mostPowerful: mostPowerfulBeast,
    mostPowerfulTitle,
    rarest: beastHighlights?.rarest ?? null,
    highestRanked: beastHighlights?.highestRanked ?? null,
    lastBeastKilled: beastHighlights?.lastCollected ?? null,
    lastBeastKilledName: beastHighlights?.lastCollectedName ?? null,
  }), [collectionStats, mostPowerfulBeast, mostPowerfulTitle, beastHighlights]);

  const overviewCards: OverviewCard[] = useMemo(
    () => [
      {
        key: "beasts",
        icon: "🐾",
        label: "Beasts Collected",
        value: (ownerStats?.totalBeasts ?? ownedBeasts.length).toLocaleString(),
      },
      {
        key: "power",
        icon: "🔮",
        label: "Combined Power",
        value: (ownerStats?.totalPower ?? 0).toLocaleString(),
      },
      {
        key: "rank",
        icon: "🏆",
        label: "Power Rank",
        value: rankDisplay,
        sub: rankSubheading || "Global leaderboard",
      },
      {
        key: "health",
        icon: "❤️",
        label: "Combined Health",
        value: (healthRanking?.totalHealth ?? 0).toLocaleString(),
      },
      ...(summitRank?.rank != null
        ? [
            {
              key: "summit",
              icon: "⛰️",
              label: "Summit Rank",
              value: `#${summitRank.rank}`,
              sub: `of ${summitRank.total_owners}`,
            },
          ]
        : []),
    ],
    [ownerStats, ownedBeasts.length, rankDisplay, rankSubheading, healthRanking, summitRank]
  );

  const [selectedBeast, setSelectedBeast] = useState<Beast | null>(null);
  const [currentDuplicateIndex, setCurrentDuplicateIndex] = useState(0);

  // Get duplicates of the same beast type based on current tab context - O(1) lookup using index
  const selectedBeastDuplicates = useMemo(() => {
    if (!selectedBeast) return [];

    const selectedBeastType = getBeastTypeKey(selectedBeast);
    if (!selectedBeastType) return [];

    // Use pre-built index for O(1) lookup instead of O(n) filtering
    return beastsByTypeAndCategory[activeTab].get(selectedBeastType) || [];
  }, [selectedBeast, activeTab, beastsByTypeAndCategory]);

  // Update the selected beast when navigating through duplicates
  const currentDisplayedBeast =
    selectedBeastDuplicates.length > 0
      ? selectedBeastDuplicates[currentDuplicateIndex] || selectedBeast
      : selectedBeast;

  // Navigation functions
  const navigateToNextDuplicate = () => {
    if (selectedBeastDuplicates.length > 1) {
      setCurrentDuplicateIndex(
        (prev) => (prev + 1) % selectedBeastDuplicates.length
      );
    }
  };

  const navigateToPreviousDuplicate = () => {
    if (selectedBeastDuplicates.length > 1) {
      setCurrentDuplicateIndex(
        (prev) =>
          (prev - 1 + selectedBeastDuplicates.length) %
          selectedBeastDuplicates.length
      );
    }
  };

  // Handle beast selection - find the index in duplicates
  const handleBeastSelect = (beast: Beast) => {
    setSelectedBeast(beast);
    setCurrentDuplicateIndex(0); // Start at first duplicate
  };

  const topBar = <TopBar />;

  if (!trimmedIdentifier) {
    return (
      <AppLayout topBar={topBar}>
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-red-400">
          Missing account identifier.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout topBar={topBar}>
      <div className="flex flex-col gap-2">
        <div className="relative pt-3 sm:pt-4">
          {summitRank?.rank != null && (
            <div className="absolute top-3 left-0 text-left">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Summit Rank</p>
              <p className="text-sm font-bold text-[#fbcb4a]">
                #{summitRank.rank}
                <span className="text-zinc-500 font-normal text-xs ml-1">of {summitRank.total_owners}</span>
              </p>
            </div>
          )}
          <div className="flex flex-col items-center text-center">
            {collectionStats.mostPowerfulTitle ? (
              <span className="bg-gradient-to-r from-[#ff7cf7] via-[#7dfbff] to-[#8bff72] bg-clip-text text-3xl font-semibold uppercase tracking-[0.35em] text-transparent">
                "{collectionStats.mostPowerfulTitle}"
              </span>
            ) : null}
            <span
              className="bg-gradient-to-r from-[#f9e08a] via-[#fbdc5e] to-[#39ff14] bg-clip-text text-4xl font-semibold uppercase tracking-[0.35em]"
              style={{ WebkitTextFillColor: "#fbeaa0" }}
            >
              <span className={`${displayNameClass} uppercase`}>
                {displayName}
              </span>
            </span>
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mt-1">
              Collection Overview
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="text-xs uppercase tracking-wide text-lsGold hover:underline"
          >
            ← Back to Home
          </Link>

          <Link
            to={`/account/${encodeURIComponent(trimmedIdentifier)}`}
            className="text-xs uppercase tracking-wide text-lsGold hover:underline"
          >
            ← Back to Account
          </Link>
        </div>

        {/* Profile Stats - Three Column Layout */}
        <ThreeColumnStatsLayout
          collectionStats={displayStats}
          overviewCards={overviewCards}
        />

        {/* Consolidate SQL errors into a single banner */}
        {(() => {
          const errors = [summaryError, catalogError, filtersError].filter(Boolean);
          if (errors.length === 0) return null;

          // Check if any error is a SQL endpoint error
          const hasSqlError = errors.some(err => err && isSqlEndpointError(err));

          if (hasSqlError) {
            // Show single clean message for SQL errors
            return (
              <div className="flex items-center gap-3 py-3 px-4 bg-red-900/20 border border-red-400/30 rounded-md">
                <span className="text-red-300 text-lg">⚠️</span>
                <div className="flex-1">
                  <p className="text-sm text-red-200 font-medium">
                    Beast data temporarily unavailable
                  </p>
                  <p className="text-xs text-red-300/80 mt-1">
                    Our indexing service is experiencing issues. Please try again in a few minutes.
                  </p>
                </div>
              </div>
            );
          }

          // Show individual errors for non-SQL errors
          return (
            <div className="flex flex-col gap-2">
              {errors.map((error, idx) => (
                <p key={idx} className="text-xs text-red-400">❌ {error}</p>
              ))}
            </div>
          );
        })()}

        <div className="flex items-center justify-center gap-2 py-2 px-4 bg-blue-900/20 border border-blue-400/30 rounded-md">
          <span className="text-blue-300 text-xs">ℹ️</span>
          <p className="text-xs text-blue-200">
            Traded a beast? It may take 1-2 minutes to appear. Click{" "}
            <strong>Refresh</strong> to check for updates.
          </p>
        </div>

        {/* Tabs - colored pills */}
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((tab) => {
              const styles = TAB_STYLES[tab.key];
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide transition ${
                    isActive
                      ? styles.active
                      : `${styles.inactive} bg-gray/40 text-gray-400 hover:border-lsGold/40`
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <SortDropdown value={sortOption} onChange={setSortOption} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
              className={`font-medium text-xs h-8 ${
                showDuplicatesOnly
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-white/[0.06] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
              }`}
            >
              {showDuplicatesOnly ? "Dupes Only" : "Duplicates"}
            </Button>
            <div className="flex items-center border border-white/[0.06] rounded-lg bg-white/[0.04]">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="rounded-r-none border-0 h-8"
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "table" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="rounded-l-none border-0 h-8"
              >
                <Table className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              apiCache.clearEndpoint("beast-query");
              apiCache.clearEndpoint("beast-by-id");
              void loadSummary();
            }}
            disabled={anyLoading || !resolvedAddress}
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-50 transition-colors"
            title="Force refresh collection data"
          >
            {anyLoading ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
            ) : null}
            <span>Refresh</span>
          </button>
        </div>

        {catalogLoading ? (
          <p className="text-xs text-zinc-400">Loading collection...</p>
        ) : viewMode === "table" ? (
          <BeastTableView
            beasts={ownedBeasts}
            onBeastSelect={handleBeastSelect}
            ownerUsernames={ownerUsernames}
          />
        ) : (
          <div className="grid gap-2 grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 sm:gap-3">
            {tabEntries[activeTab].map((entry) => (
              <BeastCard
                key={entry.id}
                beast={
                  entry.beast ?? {
                    id: entry.id,
                    numericId: 0,
                    name: entry.label,
                    image: "",
                    owner: null,
                    attributes: [],
                    metadata: { attributes: [] },
                    power: null,
                  }
                }
                owned={!entry.missing}
                ownerUsername={entry.ownerUsername ?? null}
                missing={entry.missing}
                overlayLabel="Need to hunt"
                disabled={entry.missing}
                duplicateCount={entry.duplicateCount}
                hasAllVariants={entry.hasAllVariants}
                onSelect={handleBeastSelect}
              />
            ))}
          </div>
        )}

        <BeastModal
          beast={currentDisplayedBeast}
          ownerUsernames={ownerUsernames}
          onClose={() => setSelectedBeast(null)}
          duplicates={selectedBeastDuplicates}
          currentDuplicateIndex={currentDuplicateIndex}
          onNextDuplicate={navigateToNextDuplicate}
          onPreviousDuplicate={navigateToPreviousDuplicate}
        />
      </div>
    </AppLayout>
  );
}

export default CollectionPage;
