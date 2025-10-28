import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "@starknet-react/core";
import { Link, useLocation, useNavigate } from "react-router-dom";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import BeastGrid from "../components/beast/BeastGrid";
import BeastModal from "../components/beast/BeastModal";
import { BeastTableView } from "../components/beast/BeastTableView";
import PaginationControls from "../components/pagination/PaginationControls";
import { FiltersButton } from "../components/filters/FiltersButton";
import { FiltersDrawer } from "../components/filters/FiltersDrawer";
import SortDropdown, { type SortOption, sortOptionToBeastSortField } from "../components/sort/SortDropdown";
import { useControllerUsernames } from "../hooks/useControllerUsernames";
import { useBeasts } from "../hooks/useBeasts";
import {
  fetchBeastAttributeFilters,
  fetchBeastCombinedRanks,
  fetchBeasts,
  fetchOwnerBeastStats,
  type Beast,
  type BeastPowerRank,
  type BeastHealthRank,
  type BeastAttributeFilters,
  type OwnerBeastStats,
} from "../services/beast";
import {
  TOTAL_BEAST_VARIETIES,
} from "../utils/beastCollection";
import { normaliseStarknetAddress } from "../utils/address";
import { getErrorMessage } from "../utils/error";
import { Grid, Table } from "lucide-react";
import { Button } from "../components/ui/button";

import { ThreeColumnStatsLayout } from "../components/layout/ThreeColumnStatsLayout";
import type { OverviewCard } from "@/components/account/OverviewCards";
import { computeBeastCollectionStats } from "../utils/beastCollection";

const PAGE_SIZE = 50;

function ProfilePage() {
  const { address } = useAccount();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedBeastId, setSelectedBeastId] = useState<string | null>(null);
  const [availableFilters, setAvailableFilters] =
    useState<BeastAttributeFilters>({});
  const [attributeFilters, setAttributeFilters] =
    useState<BeastAttributeFilters>({});
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [powerRanking, setPowerRanking] = useState<BeastPowerRank | null>(null);
  const [healthRanking, setHealthRanking] = useState<BeastHealthRank | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [ownerStats, setOwnerStats] = useState<OwnerBeastStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [mostPowerfulBeast, setMostPowerfulBeast] = useState<Beast | null>(null);

  const ownerAddress = useMemo(() => address ?? "", [address]);

  const ownerAddresses = useMemo(
    () => (ownerAddress ? [ownerAddress] : []),
    [ownerAddress]
  );

  const { beasts, total, hasMore, loading, error, reload } = useBeasts({
    limit: PAGE_SIZE,
    attributeFilters,
    ownerAddresses,
    page,
    sort: sortOptionToBeastSortField(sortOption),
  });

  const loadAdditionalData = useCallback(async () => {
    if (!ownerAddress) {
      setPowerRanking(null);
      setHealthRanking(null);
      setOwnerStats(null);
      setMostPowerfulBeast(null);
      return;
    }

    try {
      setStatsLoading(true);

      // Use combined ranks query for better performance (single query instead of two)
      const [combinedRanks, stats, powerfulBeast] = await Promise.all([
        fetchBeastCombinedRanks(ownerAddress).catch((rankError) => {
          console.error("Failed to fetch beast combined ranks", rankError);
          return { powerRank: null, healthRank: null };
        }),
        fetchOwnerBeastStats(ownerAddress).catch((statsError) => {
          console.error("Failed to fetch owner beast stats", statsError);
          return null;
        }),
        // Fetch the most powerful beast (limit 1, sorted by power DESC)
        fetchBeasts({
          limit: 1,
          page: 1,
          ownerAddresses: [ownerAddress],
          sort: "default", // default sort is by power DESC
        }).then(res => res.beasts[0] || null).catch((beastError) => {
          console.error("Failed to fetch most powerful beast", beastError);
          return null;
        }),
      ]);

      setPowerRanking(combinedRanks.powerRank);
      setHealthRanking(combinedRanks.healthRank);
      setOwnerStats(stats);
      setMostPowerfulBeast(powerfulBeast);
    } catch (err: unknown) {
      console.error("Failed to load additional profile data", err);
    } finally {
      setStatsLoading(false);
    }
  }, [ownerAddress]);

  const ownerLookupAddresses = useMemo(
    () => beasts.map((beast) => beast.owner).filter(Boolean),
    [beasts]
  );

  const {
    usernames: ownerUsernames,
    loading: usernamesLoading,
    error: usernamesError,
  } = useControllerUsernames(ownerLookupAddresses);

  const selectedBeast = useMemo(
    () => beasts.find((beast) => beast.id === selectedBeastId) ?? null,
    [beasts, selectedBeastId]
  );

  // Load filters
  useEffect(() => {
    let mounted = true;
    async function loadFilters() {
      try {
        setFiltersLoading(true);
        setFiltersError(null);
        const filters = await fetchBeastAttributeFilters();
        if (!mounted) return;
        setAvailableFilters(filters);
      } catch (error) {
        if (mounted) {
          setFiltersError(getErrorMessage(error, "Failed to load filters"));
        }
      } finally {
        if (mounted) {
          setFiltersLoading(false);
        }
      }
    }
    loadFilters();
    return () => {
      mounted = false;
    };
  }, []);

  // Load additional data
  useEffect(() => {
    loadAdditionalData();
  }, [loadAdditionalData]);

  // Filter and sort handlers
  const handleFilterChange = useCallback((trait: string, value: string) => {
    setAttributeFilters((prev) => {
      const currentValues = prev[trait] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];

      if (newValues.length === 0) {
        const { [trait]: removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [trait]: newValues,
      };
    });
    setPage(1); // Reset to first page when filters change
  }, []);

  const handleResetFilters = useCallback(() => {
    setAttributeFilters({});
    setPage(1);
  }, []);

  const handleOpenFilters = useCallback(() => {
    setFiltersOpen(true);
  }, []);

  const handleCloseFilters = useCallback(() => {
    setFiltersOpen(false);
  }, []);

  const handleSortChange = useCallback((newSort: SortOption) => {
    setSortOption(newSort);
    setPage(1); // Reset to first page when sort changes
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handleBackToHome = useCallback(() => {
    navigate("/");
  }, [navigate]);

  // Load all beasts for accurate collection stats (rarity counts, etc.)
  const [allBeasts, setAllBeasts] = useState<Beast[]>([]);

  useEffect(() => {
    // Load all beasts for collection stats
    if (!ownerAddress) {
      setAllBeasts([]);
      return;
    }

    let mounted = true;
    async function loadAllBeasts() {
      try {
        const batchSize = 200;
        let allUserBeasts: Beast[] = [];
        let currentPage = 1;
        let hasMoreData = true;

        while (hasMoreData && allUserBeasts.length < 15000) {
          const { beasts: batch, total } = await fetchBeasts({
            limit: batchSize,
            page: currentPage,
            ownerAddresses: [ownerAddress],
            sort: "default",
          });

          if (!mounted) return;

          allUserBeasts = [...allUserBeasts, ...batch];

          hasMoreData = batch.length === batchSize && allUserBeasts.length < total;
          currentPage++;

          if (allUserBeasts.length >= total || batch.length < batchSize) {
            hasMoreData = false;
          }
        }

        if (mounted) {
          setAllBeasts(allUserBeasts);
        }
      } catch (error) {
        console.error("Failed to load all beasts for collection stats:", error);
      }
    }

    loadAllBeasts();
    return () => {
      mounted = false;
    };
  }, [ownerAddress]);

  const topBar = <TopBar />;

  const rankDisplay =
    powerRanking?.rank != null ? `#${powerRanking.rank.toLocaleString()}` : "—";
  const rankSubheading = powerRanking?.totalOwners
    ? `of ${powerRanking.totalOwners.toLocaleString()}`
    : "";

  // Use SQL stats for overview cards (much faster than loading all beasts)
  const overviewCards: OverviewCard[] = useMemo(
    () => [
      {
        key: "beasts",
        icon: "🐾",
        label: "Beasts Collected",
        value: statsLoading ? "—" : (ownerStats?.totalBeasts ?? 0).toLocaleString(),
      },
      {
        key: "power",
        icon: "🔮",
        label: "Combined Power",
        value: statsLoading ? "—" : (ownerStats?.totalPower ?? 0).toLocaleString(),
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
        value: statsLoading ? "—" : (healthRanking?.totalHealth ?? 0).toLocaleString(),
      },
    ],
    [rankDisplay, rankSubheading, healthRanking, ownerStats, statsLoading]
  );

  const normalisedAccountAddress = useMemo(
    () => (address ? normaliseStarknetAddress(address) ?? address : ""),
    [address]
  );

  const profileUsername = useMemo(() => {
    if (!normalisedAccountAddress) return null;
    const key = normalisedAccountAddress.toLowerCase();
    return ownerUsernames[key] ?? null;
  }, [normalisedAccountAddress, ownerUsernames]);

  const displayName = useMemo(() => {
    if (profileUsername) return profileUsername;
    if (!normalisedAccountAddress) return "Unknown";
    if (normalisedAccountAddress.length <= 12) return normalisedAccountAddress;
    return `${normalisedAccountAddress.slice(
      0,
      6
    )}…${normalisedAccountAddress.slice(-4)}`;
  }, [normalisedAccountAddress, profileUsername]);

  const displayNameClass = profileUsername ? "" : "font-mono";

  const collectionIdentifier = useMemo(() => {
    if (profileUsername) {
      return profileUsername.trim().toLowerCase();
    }
    return normalisedAccountAddress;
  }, [normalisedAccountAddress, profileUsername]);

  // Extract display title from the most powerful beast's name
  const displayTitle = useMemo(() => {
    if (!mostPowerfulBeast?.name) return null;
    const name = mostPowerfulBeast.name.trim();
    if (!name) return null;

    // Try to extract text within quotes
    const quotedMatch = name.match(/"([^"]+)"/);
    if (quotedMatch?.[1]) return quotedMatch[1];

    // Otherwise take first two words
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
    if (parts.length === 1) return parts[0];

    return null;
  }, [mostPowerfulBeast]);

  // Compute collection stats from all beasts for accurate rarity counts
  const stats = useMemo(
    () => computeBeastCollectionStats(allBeasts),
    [allBeasts]
  );

  if (!address) {
    return (
      <AppLayout topBar={topBar}>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-gray-400">
          <p>Please connect your wallet to view your profile.</p>
          <button
            type="button"
            onClick={() =>
              navigate("/", { state: { from: location.pathname } })
            }
            className="rounded-md bg-lsGreen px-4 py-2 text-xs font-semibold uppercase tracking-wide text-black hover:opacity-80"
          >
            Go to Homepage
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout topBar={topBar}>
      <div className="flex flex-col gap-6">
        {/* Title */}
        <div className="flex flex-col items-center text-center text-xs text-gray-400">
          {displayTitle ? (
            <p className="bg-gradient-to-r from-[#ff7cf7] via-[#7dfbff] to-[#8bff72] bg-clip-text text-3xl font-semibold uppercase tracking-[0.35em] text-transparent">
              "{displayTitle}"
            </p>
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
            Explore your BeastDex journey
          </p>
        </div>

        {/* Buttons row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {collectionIdentifier ? (
              <Link
                to={`/collection/${encodeURIComponent(collectionIdentifier)}`}
                className="inline-flex items-center rounded-md border border-lsGold/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-lsGold hover:bg-gray-900"
              >
                View Beast Collection
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => {
                reload();
                loadAdditionalData();
              }}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md border border-lsGold px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-lsGold hover:bg-gray-900 disabled:opacity-50"
            >
              {loading ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-lsGold border-t-transparent" />
              ) : null}
              <span>Refresh</span>
            </button>
          </div>
          <Link
            to="/"
            onClick={handleBackToHome}
            className="text-xs uppercase tracking-wide text-lsGold hover:underline"
          >
            ← Back to Home
          </Link>
        </div>

        {/* Unique Beasts Total Display */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2 bg-card/20 backdrop-blur-sm rounded-lg border border-muted/40 px-3 py-2">
            <span
              className={`text-sm transition-all duration-300 ${
                (ownerStats?.uniqueBeastTypes ?? 0) === TOTAL_BEAST_VARIETIES
                  ? "animate-bounce text-base"
                  : ""
              }`}
            >
              {(ownerStats?.uniqueBeastTypes ?? 0) === TOTAL_BEAST_VARIETIES
                ? "🎉"
                : "🏆"}
            </span>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Total Unique Beasts
            </span>
            <span
              className={`font-bold transition-all duration-300 ${
                (ownerStats?.uniqueBeastTypes ?? 0) === TOTAL_BEAST_VARIETIES
                  ? "text-[#39ff14] text-lg drop-shadow-[0_0_8px_rgba(57,255,20,0.8)] animate-pulse"
                  : "text-primary"
              }`}
            >
              {statsLoading ? "—" : (ownerStats?.uniqueBeastTypes ?? 0)}
            </span>
            <span
              className={`transition-all duration-300 ${
                (ownerStats?.uniqueBeastTypes ?? 0) === TOTAL_BEAST_VARIETIES
                  ? "text-[#39ff14] font-bold drop-shadow-[0_0_8px_rgba(57,255,20,0.8)] animate-pulse"
                  : "text-muted-foreground"
              }`}
            >
              / {TOTAL_BEAST_VARIETIES}
            </span>
            {(ownerStats?.uniqueBeastTypes ?? 0) === TOTAL_BEAST_VARIETIES && (
              <span className="text-[#39ff14] font-bold animate-pulse ml-1 text-xs">
                COMPLETE! ✨
              </span>
            )}
          </div>
        </div>

        {/* Three Column Stats Layout */}
        <ThreeColumnStatsLayout
          collectionStats={stats}
          overviewCards={overviewCards}
        />

        {/* Status + errors */}
        {usernamesLoading ? (
          <p className="text-[11px] text-gray-400">Loading usernames...</p>
        ) : usernamesError ? (
          <p className="text-[11px] text-red-400">{usernamesError}</p>
        ) : null}
        {error ? <p className="text-xs text-red-400">❌ {error}</p> : null}
        {filtersError ? (
          <p className="text-xs text-red-400">❌ {filtersError}</p>
        ) : null}

        {/* Filters and Sort Controls */}
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">
            {loading ? "Loading..." : `${total.toLocaleString()} beasts`}
          </div>
          <div className="flex items-center gap-3">
            <FiltersButton
              attributeFilters={attributeFilters}
              onClick={handleOpenFilters}
            />

            {/* View Mode Toggle */}
            <div className="flex items-center border border-border/50 rounded-md bg-card/90 backdrop-blur-sm">
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

            <SortDropdown value={sortOption} onChange={handleSortChange} />
          </div>
        </div>

        {/* Grid / Table View */}
        {viewMode === "table" ? (
          <BeastTableView
            beasts={allBeasts}
            onBeastSelect={(beast) => setSelectedBeastId(beast.id)}
            ownerUsernames={ownerUsernames}
          />
        ) : (
          <BeastGrid
            beasts={beasts}
            ownerUsernames={ownerUsernames}
            onSelect={(beast) => setSelectedBeastId(beast.id)}
            loading={loading}
            emptyMessage="No beasts found with current filters."
          />
        )}

        {/* Pagination - only show for grid view */}
        {viewMode === "grid" && !loading && total > PAGE_SIZE && (
          <PaginationControls
            page={page}
            totalPages={Math.ceil(total / PAGE_SIZE)}
            disablePrevious={page <= 1}
            disableNext={!hasMore}
            loading={loading}
            onRefresh={() => {
              reload();
              loadAdditionalData();
            }}
            onPrevious={() => handlePageChange(page - 1)}
            onNext={() => handlePageChange(page + 1)}
          />
        )}

        {/* Filters Drawer */}
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

        {/* Modal */}
        <BeastModal
          beast={selectedBeast}
          ownerUsernames={ownerUsernames}
          onClose={() => setSelectedBeastId(null)}
        />
      </div>
    </AppLayout>
  );
}

export default ProfilePage;
