import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import BeastCard from "../components/BeastCard";
import BeastModal from "../components/beast/BeastModal";
import BeastCollectionTile from "../components/profile/BeastCollectionTile";
import {
  fetchBeastAttributeFilters,
  fetchBeasts,
  type Beast,
} from "../services/beast";
import { useControllerUsernames } from "../hooks/useControllerUsernames";
import {
  computeBeastCollectionStats,
  EMPTY_BEAST_COLLECTION_STATS,
} from "../utils/beastCollection";
import { normaliseStarknetAddress } from "../utils/address";
import { lookupControllerAddresses } from "../services/controller";
import { getErrorMessage } from "../utils/error";
import { config } from "../config";

const PAGE_SIZE = config.pagination.defaultPageSize;

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

function findBestPlaceholder(
  typeKey: string,
  sampleCategoryMaps: CategoryMaps,
  catalog: CatalogRecord
): Beast | null {
  const fallbackSources = [
    () => catalog[typeKey],

    () => sampleCategoryMaps.standard.get(typeKey),
    () => sampleCategoryMaps.animated.get(typeKey),
    () => sampleCategoryMaps.shiny.get(typeKey),
    () => sampleCategoryMaps.animatedShiny.get(typeKey),

    () => {
      for (const beast of Object.values(catalog)) {
        if (beast && getBeastTypeKey(beast) === typeKey) {
          return beast;
        }
      }
      return null;
    },
  ];

  for (const getSource of fallbackSources) {
    const beast = getSource();
    if (beast && beast.image) {
      return beast;
    }
  }

  // If no beast with image found, try any beast as last resort
  for (const getSource of fallbackSources) {
    const beast = getSource();
    if (beast) {
      return beast;
    }
  }

  return null;
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
  const [hasMorePages, setHasMorePages] = useState(false);
  const [remainingPages, setRemainingPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const [beastTypes, setBeastTypes] = useState<TypeEntry[]>([]);
  const [catalog, setCatalog] = useState<CatalogRecord>({});
  const [sampleCategoryMaps, setSampleCategoryMaps] = useState<CategoryMaps>({
    animatedShiny: new Map(),
    animated: new Map(),
    shiny: new Map(),
    standard: new Map(),
  });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("all");

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
      const limit = PAGE_SIZE;

      const { beasts: firstBatch, total } = await fetchBeasts({
        limit,
        page: 1,
        ownerAddresses: [resolvedAddress],
        sort: "default",
      });

      if (summaryRequestRef.current !== requestId) {
        return;
      }

      let accumulated = [...firstBatch];

      if (total > firstBatch.length) {
        const totalPages = Math.ceil(total / limit);
        const MAX_INITIAL_PAGES = 2; // Reduced from 5 to 2 for better performance
        const pagesToLoad = Math.min(totalPages, MAX_INITIAL_PAGES);

        // Load pages sequentially instead of all at once to reduce server load
        for (let p = 2; p <= pagesToLoad; p++) {
          try {
            const result = await fetchBeasts({
              limit,
              page: p,
              ownerAddresses: [resolvedAddress],
              sort: "default",
            });
            accumulated = accumulated.concat(result.beasts);
          } catch (error) {
            console.warn(`Failed to load page ${p}:`, error);
            // Continue loading other pages even if one fails
          }
        }

        if (totalPages > MAX_INITIAL_PAGES) {
          setHasMorePages(true);
          setRemainingPages(totalPages - MAX_INITIAL_PAGES);
        }
      }

      if (summaryRequestRef.current !== requestId) {
        return;
      }

      setOwnedBeasts(accumulated);
      setCollectionStats(computeBeastCollectionStats(accumulated));
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
  }, [identifierError, resolvedAddress, resolvingIdentifier]);

  const loadMoreBeasts = useCallback(async () => {
    if (loadingMore || remainingPages <= 0) return;

    setLoadingMore(true);
    try {
      const limit = 120;
      const MAX_LOAD_MORE_PAGES = 3;
      const pagesToLoad = Math.min(remainingPages, MAX_LOAD_MORE_PAGES);
      const startPage = Math.ceil(ownedBeasts.length / limit) + 1;

      const promises = [];
      for (let p = startPage; p < startPage + pagesToLoad; p++) {
        promises.push(
          fetchBeasts({
            limit,
            page: p,
            ownerAddresses: [resolvedAddress],
            sort: "default",
          })
        );
      }

      const results = await Promise.allSettled(promises);
      const newBeasts: Beast[] = [];
      results.forEach((res) => {
        if (res.status === "fulfilled") {
          newBeasts.push(...res.value.beasts);
        }
      });

      if (newBeasts.length > 0) {
        setOwnedBeasts((prev) => [...prev, ...newBeasts]);
        setRemainingPages((prev) => Math.max(0, prev - pagesToLoad));

        if (remainingPages <= pagesToLoad) {
          setHasMorePages(false);
        }
      }
    } catch (err) {
      console.error("Failed to load more beasts", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, remainingPages, ownedBeasts.length, resolvedAddress]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // Reset pagination state
  useEffect(() => {
    setHasMorePages(false);
    setRemainingPages(0);
    setLoadingMore(false);
  }, [resolvedAddress]);

  useEffect(() => {
    let cancelled = false;

    async function loadFilters() {
      try {
        setFiltersError(null);
        const filters = await fetchBeastAttributeFilters();
        if (cancelled) return;

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
        setBeastTypes(uniqueEntries);
      } catch (err: unknown) {
        if (cancelled) return;
        setFiltersError(getErrorMessage(err, "Failed to load beast list"));
      } finally {
        // no-op
      }
    }

    void loadFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      try {
        setCatalogLoading(true);
        setCatalogError(null);

        if (beastTypes.length === 0) {
          setCatalog({});
          setSampleCategoryMaps({
            animatedShiny: new Map(),
            animated: new Map(),
            shiny: new Map(),
            standard: new Map(),
          });
          setCatalogLoading(false);
          return;
        }

        const sampleRecords: CatalogRecord = {};
        const sampleBeastCollector = new Map<string, Beast>();
        const desiredCount = beastTypes.length;
        const limit = 120;

        // Add more comprehensive sampling to ensure we have all variant types
        const { beasts: firstBatch, total } = await fetchBeasts({
          limit,
          page: 1,
          sort: "default",
        });

        if (cancelled) return;

        firstBatch.forEach((sample) => {
          const typeKey = getBeastTypeKey(sample);
          if (!typeKey) return;
          if (!sampleRecords[typeKey]) sampleRecords[typeKey] = sample;
          if (!sampleBeastCollector.has(typeKey)) {
            sampleBeastCollector.set(typeKey, sample);
          }
        });

        if (
          Object.keys(sampleRecords).length < desiredCount &&
          total > firstBatch.length
        ) {
          const foundCount = Object.keys(sampleRecords).length;
          const maxPagesToLoad = Math.min(15, Math.ceil(total / limit)); // Increased to ensure we get beasts with images

          console.log(
            `Loading catalog: Found ${foundCount}/${desiredCount} beast types, loading up to ${maxPagesToLoad} pages`
          );

          const BATCH_SIZE = 3; // Increased to load more beasts with images
          let currentPage = 2;

          while (
            currentPage <= maxPagesToLoad &&
            Object.keys(sampleRecords).length < desiredCount
          ) {
            const batchEnd = Math.min(
              currentPage + BATCH_SIZE - 1,
              maxPagesToLoad
            );
            const promises = [];

            for (let p = currentPage; p <= batchEnd; p++) {
              promises.push(fetchBeasts({ limit, page: p, sort: "default" }));
            }

            const results = await Promise.allSettled(promises);
            results.forEach((res) => {
              if (res.status === "fulfilled") {
                res.value.beasts.forEach((sample) => {
                  const typeKey = getBeastTypeKey(sample);
                  if (!typeKey) return;
                  if (!sampleRecords[typeKey]) sampleRecords[typeKey] = sample;
                  if (!sampleBeastCollector.has(typeKey)) {
                    sampleBeastCollector.set(typeKey, sample);
                  }
                });
              }
            });

            currentPage = batchEnd + 1;

            console.log(
              `Loaded pages ${currentPage - BATCH_SIZE} to ${
                batchEnd - 1
              }, now have ${
                Object.keys(sampleRecords).length
              }/${desiredCount} beast types`
            );

            if (Object.keys(sampleRecords).length >= desiredCount) {
              break;
            }
          }
        }

        if (!cancelled) {
          setCatalog(sampleRecords);
          setSampleCategoryMaps(
            buildCategoryMaps(Array.from(sampleBeastCollector.values()))
          );
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setCatalogError(getErrorMessage(err, "Failed to load beast catalog"));
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [beastTypes]);

  const categoryMaps = useMemo(
    () => buildCategoryMaps(ownedBeasts),
    [ownedBeasts]
  );

  // Pre-compute placeholders for better performance
  const placeholderCache = useMemo(() => {
    const cache = new Map<string, Beast | null>();
    beastTypes.forEach(({ key }) => {
      cache.set(key, findBestPlaceholder(key, sampleCategoryMaps, catalog));
    });
    return cache;
  }, [beastTypes, sampleCategoryMaps, catalog]);

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
  }, [
    tabEntriesForCategory,
    resolveOwnerUsername,
  ]);

  const anyLoading = summaryLoading || catalogLoading || resolvingIdentifier;

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
              {collectionStats.mostPowerfulTitle}
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
            ← Back to BeastDex
          </Link>

          <div className="flex items-center gap-3 mt-2">
            <Link
              to={`/account/${encodeURIComponent(trimmedIdentifier)}`}
              className="text-xs uppercase tracking-wide text-lsGold hover:underline"
            >
              ← Back to Account
            </Link>
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

        <BeastCollectionTile {...collectionStats} />

        {summaryError ? (
          <p className="text-xs text-red-400">❌ {summaryError}</p>
        ) : null}
        {catalogError ? (
          <p className="text-xs text-red-400">❌ {catalogError}</p>
        ) : null}
        {filtersError ? (
          <p className="text-xs text-red-400">❌ {filtersError}</p>
        ) : null}

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

        {/* Load More Button */}
        {hasMorePages && !summaryLoading && (
          <div className="flex justify-center mt-6">
            <button
              onClick={loadMoreBeasts}
              disabled={loadingMore}
              className="px-6 py-3 bg-lsGold text-black font-semibold rounded-lg hover:bg-lsGold/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full"></span>
                  Loading {remainingPages > 3 ? 3 : remainingPages} more
                  pages...
                </span>
              ) : (
                <span>
                  Load More ({remainingPages} page
                  {remainingPages !== 1 ? "s" : ""} remaining)
                </span>
              )}
            </button>
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
