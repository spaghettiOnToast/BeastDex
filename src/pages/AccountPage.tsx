import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import BeastGrid from "../components/beast/BeastGrid";
import BeastModal from "../components/beast/BeastModal";
import PaginationControls from "../components/pagination/PaginationControls";
import { FiltersButton } from "../components/filters/FiltersButton";
import { FiltersDrawer } from "../components/filters/FiltersDrawer";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import { useBeasts } from "../hooks/useBeasts";
import {
  fetchBeastAttributeFilters,
  fetchBeasts,
  fetchAdventurerDeaths,
  fetchBeastPowerRank,
  type BeastAttributeFilters,
  type Beast,
  type BeastPowerRank,
} from "../services/beast";
import { useControllerUsernames } from "../hooks/useControllerUsernames";
import { lookupControllerAddresses } from "../services/controller";
import { starknetIdService } from "../services/starknetId";
import { getErrorMessage } from "../utils/error";
import SortDropdown, { type SortOption } from "../components/sort/SortDropdown";
import { ThreeColumnStatsLayout } from "../components/layout/ThreeColumnStatsLayout";
import type { OverviewCard } from "@/components/account/OverviewCards";
import {
  calculateKdRatio,
  calculateTotalPower,
  computeBeastCollectionStats,
  EMPTY_BEAST_COLLECTION_STATS,
  TOTAL_BEAST_VARIETIES,
} from "../utils/beastCollection";
import { normaliseStarknetAddress } from "../utils/address";

function isValidHexAddress(value: string): boolean {
  if (!value.startsWith("0x") || value.length < 3) {
    return false;
  }
  const hexPart = value.slice(2);
  return /^[0-9a-fA-F]+$/.test(hexPart);
}

const PAGE_SIZE = 50;

function AccountPage() {
  const { identifier = "" } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [availableFilters, setAvailableFilters] =
    useState<BeastAttributeFilters>({});
  const [attributeFilters, setAttributeFilters] =
    useState<BeastAttributeFilters>({});
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedBeast, setSelectedBeast] = useState<Beast | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [collectionStats, setCollectionStats] = useState(
    EMPTY_BEAST_COLLECTION_STATS
  );
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [collectionPower, setCollectionPower] = useState(0);
  const [accountDeaths, setAccountDeaths] = useState(0);
  const [accountRanking, setAccountRanking] = useState<BeastPowerRank | null>(
    null
  );
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const summaryRequestRef = useRef(0);
  const [resolvedAddress, setResolvedAddress] = useState<string>("");
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [resolvingIdentifier, setResolvingIdentifier] = useState(false);

  const trimmedIdentifier = identifier.trim();

  const initialAddressCandidate = useMemo(() => {
    if (!trimmedIdentifier) return "";
    const normalised = normaliseStarknetAddress(trimmedIdentifier);
    if (
      normalised &&
      normalised.startsWith("0x") &&
      isValidHexAddress(trimmedIdentifier)
    ) {
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

    if (initialAddressCandidate) {
      setResolvedAddress(initialAddressCandidate);
      setIdentifierError(null);
      setResolvingIdentifier(false);
      return () => {
        cancelled = true;
      };
    }

    if (!trimmedIdentifier) {
      setResolvedAddress("");
      setIdentifierError("Missing account identifier.");
      setResolvingIdentifier(false);
      return () => {
        cancelled = true;
      };
    }

    const usernameKey = trimmedIdentifier.toLowerCase();
    setResolvingIdentifier(true);

    // First try Cartridge username resolution
    lookupControllerAddresses([trimmedIdentifier])
      .then(async (result) => {
        if (cancelled) return;
        const addresses = result[usernameKey] ?? [];
        if (addresses.length > 0) {
          setResolvedAddress(addresses[0]);
          setIdentifierError(null);
          return;
        }

        // If no Cartridge username found, try Starknet.id
        try {
          const starknetIdAddress =
            await starknetIdService.getAddressFromStarkName(trimmedIdentifier);
          if (starknetIdAddress && !cancelled) {
            setResolvedAddress(starknetIdAddress);
            setIdentifierError(null);
            return;
          }
        } catch (starknetIdError) {
          console.warn("Failed to resolve Starknet.id:", starknetIdError);
        }

        // If neither worked
        if (!cancelled) {
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

  const ownerAddresses = useMemo(
    () => (resolvedAddress ? [resolvedAddress] : []),
    [resolvedAddress]
  );

  const { beasts, total, hasMore, loading, error, reload } = useBeasts({
    limit: PAGE_SIZE,
    search: searchParams.get("q") ?? "",
    attributeFilters,
    ownerAddresses,
    page,
    sort: sortOption,
    enabled: Boolean(resolvedAddress),
  });

  const ownerLookupAddresses = useMemo(() => {
    const unique = new Set<string>();
    if (resolvedAddress) {
      unique.add(resolvedAddress);
    }
    beasts.forEach((beast) => {
      if (beast.owner) {
        unique.add(beast.owner);
      }
    });
    return Array.from(unique).filter(Boolean);
  }, [resolvedAddress, beasts]);

  const {
    usernames: ownerUsernames,
    loading: usernamesLoading,
    error: usernamesError,
  } = useControllerUsernames(ownerLookupAddresses);

  useEffect(() => {
    let cancelled = false;

    async function loadFilters() {
      try {
        setFiltersLoading(true);
        setFiltersError(null);
        const filters = await fetchBeastAttributeFilters();
        if (cancelled) return;
        setAvailableFilters(filters);
        setAttributeFilters((prev) => {
          const nextEntries = (
            Object.entries(prev) as Array<[string, string[]]>
          ).filter(([trait]) =>
            Object.prototype.hasOwnProperty.call(filters, trait)
          );
          return Object.fromEntries(nextEntries) as BeastAttributeFilters;
        });
      } catch (error: unknown) {
        if (cancelled) return;
        setFiltersError(getErrorMessage(error, "Failed to load filters"));
      } finally {
        if (!cancelled) {
          setFiltersLoading(false);
        }
      }
    }

    loadFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFilterChange = useCallback((trait: string, value: string) => {
    setPage(1);
    setAttributeFilters((prev) => {
      if (!value) {
        const next = { ...prev } as BeastAttributeFilters;
        delete next[trait];
        return next;
      }
      return {
        ...prev,
        [trait]: [value],
      } as BeastAttributeFilters;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setPage(1);
    setAttributeFilters({});
  }, []);

  const handleOpenFilters = useCallback(() => {
    setFiltersOpen(true);
  }, []);

  const handleCloseFilters = useCallback(() => {
    setFiltersOpen(false);
  }, []);

  const handleSelectBeast = useCallback((beast: Beast) => {
    setSelectedBeast(beast);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedBeast(null);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isLastPage = !hasMore;

  const loadSummary = useCallback(async () => {
    if (resolvingIdentifier) {
      return;
    }

    if (!resolvedAddress) {
      setCollectionStats(EMPTY_BEAST_COLLECTION_STATS);
      setCollectionTotal(0);
      setCollectionPower(0);
      setAccountDeaths(0);
      setAccountRanking(null);
      setSummaryError(identifierError);
      setSummaryLoading(false);
      return;
    }

    summaryRequestRef.current += 1;
    const requestId = summaryRequestRef.current;
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      // Load ALL beasts for accurate stats calculation (like ProfilePage and CollectionPage)
      // Use batched loading to handle large collections (11,000+ beasts)
      const batchSize = 200;
      let allUserBeasts: Beast[] = [];
      let currentPage = 1;
      let hasMoreData = true;
      let totalCount = 0;

      while (hasMoreData && allUserBeasts.length < 15000) {
        const { beasts: batch, total } = await fetchBeasts({
          limit: batchSize,
          page: currentPage,
          ownerAddresses: [resolvedAddress],
          sort: "default",
        });

        if (summaryRequestRef.current !== requestId) {
          return;
        }

        allUserBeasts = [...allUserBeasts, ...batch];
        totalCount = total;

        hasMoreData = batch.length === batchSize && allUserBeasts.length < total;
        currentPage++;

        if (allUserBeasts.length >= total || batch.length < batchSize) {
          hasMoreData = false;
        }
      }

      if (summaryRequestRef.current !== requestId) {
        return;
      }

      const [deaths, ranking] = await Promise.all([
        fetchAdventurerDeaths(resolvedAddress).catch((err) => {
          console.error("Failed to fetch account deaths", err);
          return 0;
        }),
        fetchBeastPowerRank(resolvedAddress).catch((err) => {
          console.error("Failed to fetch account rank", err);
          return null;
        }),
      ]);

      if (summaryRequestRef.current !== requestId) {
        return;
      }

      // Set collection total and compute stats with ALL beasts for accuracy
      setCollectionTotal(totalCount);

      // Compute stats with complete data (like ProfilePage and CollectionPage)
      const stats = computeBeastCollectionStats(allUserBeasts);
      const power = calculateTotalPower(allUserBeasts);

      setCollectionStats(stats);
      setCollectionPower(power);
      setAccountDeaths(deaths);
      setAccountRanking(ranking);
    } catch (err: unknown) {
      if (summaryRequestRef.current !== requestId) {
        return;
      }
      console.error("Failed to load account summary", err);
      setCollectionStats(EMPTY_BEAST_COLLECTION_STATS);
      setCollectionTotal(0);
      setCollectionPower(0);
      setAccountDeaths(0);
      setAccountRanking(null);
      setSummaryError(getErrorMessage(err, "Failed to load account summary"));
    } finally {
      if (summaryRequestRef.current === requestId) {
        setSummaryLoading(false);
      }
    }
  }, [identifierError, resolvedAddress, resolvingIdentifier]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const topBar = <TopBar />;

  const filtersControl = (
    <FiltersButton
      attributeFilters={attributeFilters}
      onClick={handleOpenFilters}
    />
  );

  const handleBackToHome = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const handleRefresh = useCallback(() => {
    if (!resolvedAddress) {
      return;
    }
    // Clear existing data to show loading state immediately
    setCollectionStats(EMPTY_BEAST_COLLECTION_STATS);
    setCollectionTotal(0);
    setCollectionPower(0);

    void reload();
    void loadSummary();
  }, [loadSummary, reload, resolvedAddress]);

  const kdRatio = useMemo(
    () => calculateKdRatio(collectionTotal, accountDeaths),
    [collectionTotal, accountDeaths]
  );

  const rankDisplay =
    accountRanking?.rank != null
      ? `#${accountRanking.rank.toLocaleString()}`
      : "—";
  const rankSubheading = accountRanking?.totalOwners
    ? `of ${accountRanking.totalOwners.toLocaleString()}`
    : "";
  const anyLoading = loading || summaryLoading || resolvingIdentifier;

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

  const displayAddress = useMemo(() => {
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

  const displayAddressClass =
    accountUsername || identifierIsUsername ? "" : "font-mono";

  const collectionRouteIdentifier = useMemo(
    () =>
      identifierIsUsername
        ? trimmedIdentifier.toLowerCase()
        : trimmedIdentifier,
    [identifierIsUsername, trimmedIdentifier]
  );

  const mostPowerfulTitle = useMemo(() => {
    if (collectionStats.mostPowerfulTitle) {
      return collectionStats.mostPowerfulTitle;
    }
    const name = collectionStats.mostPowerful?.name;
    if (!name) return null;

    const trimmed = name.trim();
    const quotedMatch = trimmed.match(/"([^"]+)"/);
    if (quotedMatch?.[1]) {
      return quotedMatch[1];
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[1]}`;
    }
    if (parts.length === 1) {
      return parts[0];
    }
    return null;
  }, [collectionStats.mostPowerful]);

  const overviewCards: OverviewCard[] = useMemo(
    () => [
      {
        key: "kd",
        icon: "⚔️",
        label: "K:D Ratio",
        value: kdRatio,
        sub: `${collectionTotal.toLocaleString()} K / ${accountDeaths.toLocaleString()} D`,
      },
      {
        key: "beasts",
        icon: "🐾",
        label: "Beasts Collected",
        value: collectionTotal.toLocaleString(),
      },
      {
        key: "power",
        icon: "🔮",
        label: "Combined Power",
        value: collectionPower.toLocaleString(),
      },
      {
        key: "rank",
        icon: "🏆",
        label: "Power Rank",
        value: rankDisplay,
        sub: rankSubheading || "Global leaderboard",
      },
    ],
    [
      accountDeaths,
      collectionPower,
      collectionTotal,
      kdRatio,
      rankDisplay,
      rankSubheading,
    ]
  );

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
      <div className="space-y-4">
        <div className="bg-card/20 backdrop-blur-sm rounded-md border border-muted/40 p-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-col items-start space-y-2">
              {mostPowerfulTitle ? (
                <div className="bg-gradient-to-r from-pink-500 via-cyan-400 to-green-400 bg-clip-text text-lg md:text-xl font-bold uppercase tracking-wider text-transparent">
                  "{mostPowerfulTitle}"
                </div>
              ) : null}

              <div className="flex items-center gap-3">
                <h1 className="text-xl md:text-2xl font-bold text-primary tracking-wide">
                  <span
                    className={`${displayAddressClass}`}
                    title={normalisedAccountAddress || undefined}
                  >
                    {displayAddress}
                  </span>
                </h1>

                <div
                  className={`flex items-center gap-2 ml-4 text-sm transition-all duration-500 ${
                    collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES
                      ? "animate-pulse scale-105 drop-shadow-[0_0_15px_rgba(57,255,20,0.6)]"
                      : ""
                  }`}
                >
                  <span
                    className={`text-lg transition-all duration-300 ${
                      collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES
                        ? "animate-bounce text-2xl"
                        : ""
                    }`}
                  >
                    {collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES
                      ? "🎉"
                      : "🏆"}
                  </span>
                  <span className="uppercase tracking-wider text-muted-foreground font-medium">
                    Total
                  </span>
                  <span
                    className={`font-bold transition-all duration-300 ${
                      collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES
                        ? "text-[#39ff14] text-xl drop-shadow-[0_0_8px_rgba(57,255,20,0.8)] animate-pulse"
                        : "text-primary"
                    }`}
                  >
                    {collectionStats.uniqueBeastTypes}
                  </span>
                  <span
                    className={`transition-all duration-300 ${
                      collectionStats.uniqueBeastTypes === TOTAL_BEAST_VARIETIES
                        ? "text-[#39ff14] font-bold drop-shadow-[0_0_8px_rgba(57,255,20,0.8)] animate-pulse"
                        : "text-muted-foreground"
                    }`}
                  >
                    / {TOTAL_BEAST_VARIETIES}
                  </span>
                  {collectionStats.uniqueBeastTypes ===
                    TOTAL_BEAST_VARIETIES && (
                    <span className="text-[#39ff14] font-bold animate-pulse ml-2">
                      COMPLETE! ✨
                    </span>
                  )}
                </div>
              </div>

              {/* Username loading/error states */}
              {usernamesError ? (
                <p className="text-xs text-destructive">{usernamesError}</p>
              ) : usernamesLoading &&
                Object.keys(ownerUsernames).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Loading usernames...
                </p>
              ) : null}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-3">
                {collectionRouteIdentifier ? (
                  <Link
                    to={`/collection/${encodeURIComponent(
                      collectionRouteIdentifier
                    )}`}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium bg-primary/10 text-primary border border-primary/20 rounded-md hover:bg-primary/20 transition-colors"
                  >
                    View Beast Collection
                  </Link>
                ) : null}

                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={anyLoading || !resolvedAddress}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 disabled:opacity-50 transition-colors"
                >
                  {anyLoading ? (
                    <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                  ) : null}
                  <span>Refresh</span>
                </button>
              </div>
              <Link
                to="/"
                onClick={handleBackToHome}
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {identifierError ? (
          <div className="text-center p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm font-medium text-destructive">
              {identifierError}
            </p>
          </div>
        ) : null}

        <ThreeColumnStatsLayout
          collectionStats={collectionStats}
          overviewCards={overviewCards}
        />

        {/* Summary Error */}
        {summaryError ? (
          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-xs font-medium text-destructive">
              ❌ {summaryError}
            </p>
          </div>
        ) : null}

        {/* Beasts Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-card/10 backdrop-blur-sm rounded-md border border-muted/30">
          <h2 className="text-lg font-bold text-primary">
            {loading && total === 0
              ? "Loading…"
              : `${total.toLocaleString()} Beasts Collected`}
          </h2>
          <div className="flex items-center gap-2">
            <SortDropdown value={sortOption} onChange={setSortOption} />
            {filtersControl}
          </div>
        </div>

        {/* Error Display */}
        {error ? (
          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm font-medium text-destructive">❌ {error}</p>
          </div>
        ) : null}

        {/* Beast Grid */}
        <BeastGrid
          beasts={beasts}
          ownerUsernames={ownerUsernames}
          onSelect={handleSelectBeast}
          loading={loading}
          emptyMessage="No beasts found for this account."
        />

        {/* Pagination */}
        <div className="flex justify-center pb-4">
          <PaginationControls
            page={page}
            totalPages={totalPages}
            disablePrevious={page === 1 || loading}
            disableNext={loading || isLastPage}
            loading={loading}
            onRefresh={reload}
            onPrevious={() => setPage((prev) => Math.max(prev - 1, 1))}
            onNext={() => {
              if (!loading && hasMore) {
                setPage((prev) => prev + 1);
              }
            }}
          />
        </div>

        {/* Beast Modal */}
        <BeastModal
          beast={selectedBeast}
          ownerUsernames={ownerUsernames}
          onClose={handleCloseModal}
        />

        <FiltersDrawer
          open={filtersOpen}
          onClose={handleCloseFilters}
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

export default AccountPage;
