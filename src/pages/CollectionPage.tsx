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
} from "../utils/beastCollection";
import { normaliseStarknetAddress } from "../utils/address";
import { lookupControllerAddresses } from "../services/controller";
import { getErrorMessage } from "../utils/error";
import SortDropdown, { type SortOption } from "../components/sort/SortDropdown";
import { getBeastTemplate } from "../data/beastTemplates";
import { runBeastSql } from "../services/beast/sqlClient";
import { mapBeastRow } from "../services/beast/helpers";

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
      console.log("Loading user collection for address:", resolvedAddress);

      // Load ALL user's beasts efficiently (we only need their collection, not random samples)
      const limit = 150; // Larger batch since we're only getting user's beasts
      let allUserBeasts: Beast[] = [];
      let currentPage = 1;
      let hasMoreData = true;

      // Load user's collection in batches
      while (hasMoreData && allUserBeasts.length < 1000) {
        // Safety limit
        const { beasts: batch, total } = await fetchBeasts({
          limit,
          page: currentPage,
          ownerAddresses: [resolvedAddress],
          sort: sortOption,
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

        console.log(
          `Loaded page ${currentPage - 1}: ${
            batch.length
          } beasts from API, total accumulated: ${
            allUserBeasts.length
          }/${total}`
        );

        // Early break if we have all the data
        if (allUserBeasts.length >= total || batch.length < limit) {
          hasMoreData = false;
        }

        // Add small delay between requests to prevent overwhelming the server
        if (hasMoreData) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      console.log(
        `Collection loading complete: ${allUserBeasts.length} beasts loaded`
      );
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
      console.log("Loading all Genesis beasts with single SQL query...");

      // Generate all Genesis beast IDs (1-75) as u256 format
      const genesisIds = Array.from({ length: 75 }, (_, i) =>
        formatBeastId(i + 1)
      );

      // Build a simple SQL query to fetch all Genesis beasts at once
      const escapedIds = genesisIds.map((id) => `"${id}"`).join(", ");

      const query = `SELECT * FROM tokens WHERE contract_address = "0x46da8955829adf2bda310099a0063451923f02e648cf25a1203aac6335cf0e4" AND token_id IN (${escapedIds}) LIMIT 1000;`;

      const rows = await runBeastSql(query, "loadAllGenesisBeasts");
      const beasts = (rows as any[]).map(mapBeastRow);

      console.log(`Fetched ${beasts.length} Genesis beasts with single query`);

      const genesisMap = new Map<string, Beast>();

      beasts.forEach((beast: any) => {
        if (beast) {
          const typeKey = getGenesisBeastTypeKey(beast);
          if (typeKey && !genesisMap.has(typeKey)) {
            genesisMap.set(typeKey, beast);
            console.log(
              `Found Genesis ${beast.name} (ID: ${beast.id}) for type: ${typeKey}`
            );
          }
        }
      });

      console.log(
        `Loaded ${genesisMap.size} Genesis beasts with single SQL query`
      );
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

        console.log(
          `Loaded ${uniqueEntries.length} beast types and ${genesisMap.size} Genesis beasts together`
        );
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

    const genesisCount = Object.values(templateCatalog).filter((beast) =>
      beast?.id?.startsWith("genesis-template-")
    ).length;

    console.log(
      `Catalog ready with ${
        beastTypes.length
      } beast types (${genesisCount} from Genesis, ${
        beastTypes.length - genesisCount
      } from templates)`
    );
    console.log(
      "Template catalog sample:",
      Object.fromEntries(
        Object.entries(templateCatalog)
          .slice(0, 3)
          .map(([k, v]) => [
            k,
            { name: v?.name, image: v?.image ? "YES" : "NO" },
          ])
      )
    );
  }, [beastTypes, genesisCache]); // Build catalog when beast types or Genesis cache change

  const categoryMaps = useMemo(
    () => buildCategoryMaps(ownedBeasts),
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
      const ownerKey = beast.owner.toLowerCase();
      return ownerUsernames[ownerKey] ?? null;
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
        });

        // Shiny tab
        entries.shiny.push({
          id: `${key}-shiny`,
          label,
          beast: shinyOwned ?? placeholder,
          missing: !shinyOwned,
          ownerUsername: resolveOwnerUsername(shinyOwned),
        });

        // Animated tab
        entries.animated.push({
          id: `${key}-animated`,
          label,
          beast: animatedOwned ?? placeholder,
          missing: !animatedOwned,
          ownerUsername: resolveOwnerUsername(animatedOwned),
        });

        // Animated Shiny tab
        entries.animatedShiny.push({
          id: `${key}-animatedShiny`,
          label,
          beast: animatedShinyOwned ?? placeholder,
          missing: !animatedShinyOwned,
          ownerUsername: resolveOwnerUsername(animatedShinyOwned),
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
        });
      }
    );

    return entries;
  }, [tabEntriesForCategory, resolveOwnerUsername]);

  console.log(genesisCache);

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
        <div className="flex flex-col items-center text-center text-xs text-gray-400">
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
              color: collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES ? "rgb(57, 255, 20)" : "hsl(var(--primary))",
              bgGradient: collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES
                ? "bg-gradient-to-br from-[#39ff14]/25 via-[#8bff72]/15 to-[#39ff14]/10 animate-pulse shadow-[0_0_30px_rgba(57,255,20,0.3)]"
                : "bg-gradient-to-br from-primary/15 to-primary/5",
              borderColor: collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES
                ? "border-[#39ff14]/50 shadow-[0_0_20px_rgba(57,255,20,0.2)]"
                : "border-primary/30",
              icon: collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES ? "🎉" : "🏆",
              glisten: collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES
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
            <button
              type="button"
              onClick={() => void loadSummary()}
              disabled={anyLoading || !resolvedAddress}
              className="inline-flex items-center gap-2 rounded-md border border-lsGold px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-lsGold hover:bg-gray-900 disabled:opacity-50"
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
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
                onSelect={(beast) => setSelectedBeast(beast)}
              />
            ))}
          </div>
        )}

        <BeastModal
          beast={selectedBeast}
          ownerUsernames={ownerUsernames}
          onClose={() => setSelectedBeast(null)}
        />
      </div>
    </AppLayout>
  );
}

export default CollectionPage;
