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
import AccountFiltersDropdown from "../components/filters/AccountFiltersDropdown";
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
import { getErrorMessage } from "../utils/error";
import SortDropdown, { type SortOption } from "../components/sort/SortDropdown";
import BeastCollectionTile from "../components/profile/BeastCollectionTile";
import HighlightsTile from "../components/profile/HighlightsTile";
import {
  OverviewCards,
  type OverviewCard,
} from "@/components/account/OverviewCards";
import {
  calculateKdRatio,
  calculateTotalPower,
  computeBeastCollectionStats,
  EMPTY_BEAST_COLLECTION_STATS,
} from "../utils/beastCollection";
import { normaliseStarknetAddress } from "../utils/address";

const PAGE_SIZE = 50;

function AccountPage() {
  const { identifier = "" } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [availableFilters, setAvailableFilters] =
    useState<BeastAttributeFilters>({});
  const [attributeFilters, setAttributeFilters] =
    useState<BeastAttributeFilters>({});
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedBeast, setSelectedBeast] = useState<Beast | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("default");
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

  const sortedBeasts = useMemo(() => {
    if (sortOption === "default") {
      return beasts;
    }

    return beasts.slice().sort((a, b) => {
      const traitA = a.attributes.find(
        (attribute) => attribute.trait_type?.toLowerCase() === "beast"
      );
      const traitB = b.attributes.find(
        (attribute) => attribute.trait_type?.toLowerCase() === "beast"
      );

      const valueA = traitA?.value != null ? String(traitA.value) : "";
      const valueB = traitB?.value != null ? String(traitB.value) : "";

      return valueA.localeCompare(valueB);
    });
  }, [beasts, sortOption]);

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
    setAttributeFilters({} as BeastAttributeFilters);
    setPage(1);
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
      const limit = PAGE_SIZE;
      let pageIndex = 1;
      let accumulated: Beast[] = [];
      let totalCount = 0;

      while (true) {
        const { beasts: batch, total: batchTotal } = await fetchBeasts({
          limit,
          page: pageIndex,
          ownerAddresses: [resolvedAddress],
          sort: "default",
        });

        if (summaryRequestRef.current !== requestId) {
          return;
        }

        accumulated = accumulated.concat(batch);
        totalCount = batchTotal;

        if (accumulated.length >= totalCount || batch.length < limit) {
          break;
        }

        pageIndex += 1;
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

      setCollectionStats(computeBeastCollectionStats(accumulated));
      setCollectionTotal(totalCount || accumulated.length);
      setCollectionPower(calculateTotalPower(accumulated));
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
    <AccountFiltersDropdown
      availableFilters={availableFilters}
      attributeFilters={attributeFilters}
      filtersLoading={filtersLoading}
      filtersError={filtersError}
      onFilterChange={handleFilterChange}
      onResetFilters={handleResetFilters}
    />
  );

  const handleBackToHome = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const handleRefresh = useCallback(() => {
    if (!resolvedAddress) {
      return;
    }
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
        {/* Hero Section with Action Bar */}
        <div className="bg-card/20 backdrop-blur-sm rounded-md border border-muted/40 p-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Hero Content */}
            <div className="flex flex-col items-start space-y-2">
              {mostPowerfulTitle ? (
                <div className="bg-gradient-to-r from-pink-500 via-cyan-400 to-green-400 bg-clip-text text-lg md:text-xl font-bold uppercase tracking-wider text-transparent">
                  {mostPowerfulTitle}
                </div>
              ) : null}
              <div className="space-y-1">
                <h1 className="text-xl md:text-2xl font-bold text-primary tracking-wide">
                  <span
                    className={`${displayAddressClass}`}
                    title={normalisedAccountAddress || undefined}
                  >
                    {displayAddress}
                  </span>
                </h1>
                {usernamesError ? (
                  <p className="text-xs text-destructive">{usernamesError}</p>
                ) : usernamesLoading && Object.keys(ownerUsernames).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Loading usernames...</p>
                ) : null}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                {collectionRouteIdentifier ? (
                  <Link
                    to={`/collection/${encodeURIComponent(collectionRouteIdentifier)}`}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium bg-primary/10 text-primary border border-primary/20 rounded-md hover:bg-primary/20 transition-colors"
                  >
                    View Collection
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
                ← Back to BeastDex
              </Link>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {identifierError ? (
          <div className="text-center p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm font-medium text-destructive">{identifierError}</p>
          </div>
        ) : null}

        {/* Overview Cards */}
        <OverviewCards cards={overviewCards} />

        {/* Collection Stats */}
        <div className="grid gap-6 lg:grid-cols-2">
          <BeastCollectionTile {...collectionStats} />
          <HighlightsTile {...collectionStats} />
        </div>

        {/* Summary Error */}
        {summaryError ? (
          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-xs font-medium text-destructive">❌ {summaryError}</p>
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
          beasts={sortedBeasts}
          ownerUsernames={ownerUsernames}
          onSelect={handleSelectBeast}
          loading={loading}
          emptyMessage="No beasts found for this account."
          loadingMessage="Loading account beasts..."
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
      </div>
    </AppLayout>
  );
}

export default AccountPage;
