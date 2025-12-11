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
import BeastCard from "../components/BeastCard";
import BeastModal from "../components/beast/BeastModal";
import {
  fetchBeastAttributeFilters,
  fetchBeasts,
  type Beast,
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
import { getErrorMessage } from "../utils/error";
import SortDropdown, { type SortOption, sortOptionToBeastSortField } from "../components/sort/SortDropdown";
import { Button } from "../components/ui/button";
import { getBeastTemplate } from "../data/beastTemplates";
import { runBeastSql } from "../services/beast/sqlClient";
import { mapBeastRow } from "../services/beast/helpers";
import { apiCache } from "../services/apiCache";

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
    inactive: "border-green/400/40",
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
    active:
      "border-lsGold bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 text-black",
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
        setIdentifierError(getErrorMessage(err, "Failed to resolve username"));
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

  const { usernames: ownerUsernames } =
    useControllerUsernames(ownerLookupAddresses);

  const loadSummary = useCallback(async () => {
    if (resolvingIdentifier) {
      return;
    }

    if (!resolvedAddress) {
      setCollectionStats(EMPTY_BEAST_COLLECTION_STATS);
      setOwnedBeasts([]);
      setSummaryError(identifierError);
      setSummaryLoading(false);
      return;
    }

    summaryRequestRef.current += 1;
    const requestId = summaryRequestRef.current;
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      // Load ALL user's beasts efficiently (we only need their collection, not random samples)
      const limit = 150; // Larger batch since we're only getting user's beasts
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

        // Add small delay between requests to prevent overwhelming the server
        if (hasMoreData) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    } catch (err: unknown) {
      if (summaryRequestRef.current !== requestId) {
        return;
      }
      console.error("Failed to load collection summary", err);
      setOwnedBeasts([]);
      setCollectionStats(EMPTY_BEAST_COLLECTION_STATS);
      setSummaryError(getErrorMessage(err, "Failed to load collection"));
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
        setFiltersError(getErrorMessage(err, "Failed to load beast list"));
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

  const [selectedBeast, setSelectedBeast] = useState<Beast | null>(null);
  const [currentDuplicateIndex, setCurrentDuplicateIndex] = useState(0);

  // Get duplicates of the same beast type based on current tab context
  const selectedBeastDuplicates = useMemo(() => {
    if (!selectedBeast) return [];

    const selectedBeastType = getBeastTypeKey(selectedBeast);
    if (!selectedBeastType) return [];

    return ownedBeasts.filter((beast) => {
      const beastType = getBeastTypeKey(beast);
      if (beastType !== selectedBeastType) return false;

      // If we're on the "all" tab, show all duplicates regardless of category
      if (activeTab === "all") {
        return true;
      }

      // For specific tabs, filter by the category
      const beastShiny = beast.attributes.some(
        (attr) =>
          attr.trait_type?.toLowerCase() === "shiny" && attr.value === "1"
      );
      const beastAnimated = beast.attributes.some(
        (attr) =>
          attr.trait_type?.toLowerCase() === "animated" && attr.value === "1"
      );

      // Match the current tab's category
      switch (activeTab) {
        case "standard":
          return !beastShiny && !beastAnimated;
        case "shiny":
          return beastShiny && !beastAnimated;
        case "animated":
          return !beastShiny && beastAnimated;
        case "animatedShiny":
          return beastShiny && beastAnimated;
        default:
          return true;
      }
    });
  }, [selectedBeast, ownedBeasts, activeTab]);

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
        <div className="flex flex-col items-center text-center text-xs text-gray-400 pt-3 sm:pt-4">
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
          <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
            Collection Overview
          </p>
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

        <div className="flex flex-wrap gap-4 justify-center">
          {[
            {
              key: "total",
              label: "Total Collected",
              count: ownedBeasts.length,
              mainValue: `${ownedBeasts.length}`,
              subValue: `All Beasts`,
              color: "rgb(59, 130, 246)",
              bgGradient: "bg-gradient-to-br from-blue-500/15 to-blue-500/5",
              borderColor: "border-blue-400/30",
              icon: "📦",
              glisten: "",
            },
            {
              key: "collected",
              label: "Unique Beasts",
              count: collectionStats.uniqueBeastTypes,
              total: TOTAL_BEAST_VARIETIES,
              mainValue: `${collectionStats.uniqueBeastTypes}`,
              subValue: `${TOTAL_BEAST_VARIETIES} Unique Beasts`,
              color:
                collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES
                  ? "rgb(57, 255, 20)"
                  : "hsl(var(--primary))",
              bgGradient:
                collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES
                  ? "bg-gradient-to-br from-[#39ff14]/25 via-[#8bff72]/15 to-[#39ff14]/10 animate-pulse shadow-[0_0_30px_rgba(57,255,20,0.3)]"
                  : "bg-gradient-to-br from-primary/15 to-primary/5",
              borderColor:
                collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES
                  ? "border-[#39ff14]/50 shadow-[0_0_20px_rgba(57,255,20,0.2)]"
                  : "border-primary/30",
              icon:
                collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES
                  ? "🎉"
                  : "🏆",
              glisten:
                collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES
                  ? "animate-[shimmer_2s_ease-in-out_infinite]"
                  : "",
            },
            {
              key: "animatedShiny",
              label: "Animated Shiny",
              count: collectionStats.animatedShinyCount,
              unique: collectionStats.uniqueAnimatedShinyTypes,
              mainValue: `${collectionStats.animatedShinyCount}`,
              subValue: `${collectionStats.uniqueAnimatedShinyTypes} Unique Beasts`,
              color: "rgb(236, 72, 153)",
              bgGradient:
                "bg-gradient-to-br from-pink-500/15 via-purple-500/10 to-blue-500/5 animate-pulse",
              borderColor: "border-pink-400/30",
              icon: "✨",
              glisten:
                "before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent before:translate-x-[-200%] before:animate-[shimmer_3s_ease-in-out_infinite] before:skew-x-12",
            },
            {
              key: "animated",
              label: "Animated",
              count: collectionStats.animatedCount,
              unique: collectionStats.uniqueAnimatedTypes,
              mainValue: `${collectionStats.animatedCount}`,
              subValue: `${collectionStats.uniqueAnimatedTypes} Unique Beasts`,
              color: "rgb(125, 211, 252)",
              bgGradient: "bg-gradient-to-br from-sky-500/15 to-sky-500/5",
              borderColor: "border-sky-400/30",
              icon: "⚡",
              glisten:
                "before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-cyan-400/20 before:to-transparent before:translate-x-[-200%] before:animate-[shimmer_2.5s_ease-in-out_infinite_1s] before:skew-x-12",
            },
            {
              key: "shiny",
              label: "Shiny",
              count: collectionStats.shinyCount,
              unique: collectionStats.uniqueShinyTypes,
              mainValue: `${collectionStats.shinyCount}`,
              subValue: `${collectionStats.uniqueShinyTypes} Unique Beasts`,
              color: "rgb(253, 224, 71)",
              bgGradient:
                "bg-gradient-to-br from-yellow-500/15 to-yellow-500/5",
              borderColor: "border-yellow-400/30",
              icon: "⭐",
              glisten:
                "before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-yellow-300/30 before:to-transparent before:translate-x-[-200%] before:animate-[shimmer_2s_ease-in-out_infinite_0.5s] before:skew-x-12",
            },
            {
              key: "standard",
              label: "Standard",
              count: collectionStats.standardCount,
              unique: collectionStats.uniqueStandardTypes,
              mainValue: `${collectionStats.standardCount}`,
              subValue: `${collectionStats.uniqueStandardTypes} Unique Beasts`,
              color: "rgb(34, 197, 94)",
              bgGradient: "bg-gradient-to-br from-green-500/15 to-green-500/5",
              borderColor: "border-green-400/30",
              icon: "🐾",
              glisten: "",
            },
          ].map((card) => (
            <div
              key={card.key}
              className={`${card.bgGradient} ${card.borderColor} ${card.glisten} backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-md min-h-[120px] flex flex-col relative overflow-hidden rounded-lg border p-4 min-w-[160px]`}
            >
              <div className="flex flex-col items-center text-center gap-1.5 mb-2 min-h-[20px] relative z-10">
                <span className="text-sm flex-shrink-0">{card.icon}</span>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium truncate">
                  {card.label}
                </p>
              </div>
              <div className="flex-1 flex flex-col justify-center text-center space-y-1 relative z-10">
                <p
                  className="text-lg font-bold leading-none"
                  style={{ color: card.color }}
                >
                  {card.mainValue}
                </p>
                <p className="text-xs text-muted-foreground leading-none">
                  {card.subValue}
                </p>
              </div>
            </div>
          ))}
        </div>

        {summaryError ? (
          <p className="text-xs text-red-400">❌ {summaryError}</p>
        ) : null}
        {catalogError ? (
          <p className="text-xs text-red-400">❌ {catalogError}</p>
        ) : null}
        {filtersError ? (
          <p className="text-xs text-red-400">❌ {filtersError}</p>
        ) : null}

        <div className="flex items-center justify-center gap-2 py-2 px-4 bg-blue-900/20 border border-blue-400/30 rounded-md">
          <span className="text-blue-300 text-xs">ℹ️</span>
          <p className="text-xs text-blue-200">
            Traded a beast? It may take 1-2 minutes to appear. Click{" "}
            <strong>Refresh</strong> to check for updates.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 my-6">
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

          <div className="flex items-center gap-3">
            <SortDropdown value={sortOption} onChange={setSortOption} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
              className={`font-medium bg-card/90 backdrop-blur-sm hover:bg-card ${
                showDuplicatesOnly
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/50"
              }`}
            >
              <span className="text-muted-foreground mr-1.5">Show:</span>
              {showDuplicatesOnly ? "All Beasts" : "Duplicates Only"}
            </Button>
            <button
              type="button"
              onClick={() => {
                // Clear the beast query cache to force fresh data
                apiCache.clearEndpoint("beast-query");
                apiCache.clearEndpoint("beast-by-id");
                void loadSummary();
              }}
              disabled={anyLoading || !resolvedAddress}
              className="inline-flex items-center gap-2 rounded-md border border-lsGold px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-lsGold hover:bg-gray-900 disabled:opacity-50"
              title="Force refresh collection data. Note: New purchases may take 1-2 minutes to sync from the blockchain."
            >
              {anyLoading ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-lsGold border-t-transparent" />
              ) : null}
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {catalogLoading ? (
          <p className="text-xs text-gray-400">Loading collection…</p>
        ) : (
          <div className="grid gap-2 grid-cols-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-3">
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
