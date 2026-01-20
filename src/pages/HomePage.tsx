import { useCallback, useEffect, useMemo, useState } from "react";
import SortDropdown, { type SortOption, sortOptionToBeastSortField } from "../components/sort/SortDropdown";
import { useSearchParams } from "react-router-dom";
import TopBar from "../components/header/TopBar";
import StatsPanel from "../components/stats/StatsPanel";
import BeastGrid from "../components/beast/BeastGrid";
import BeastModal from "../components/beast/BeastModal";
import PaginationControls from "../components/pagination/PaginationControls";
import { FiltersButton } from "../components/filters/FiltersButton";
import { FiltersDrawer } from "../components/filters/FiltersDrawer";
import { AppLayout } from "../components/layout/AppLayout";
import { useBeasts } from "../hooks/useBeasts";
import {
  fetchBeastAttributeFilters,
  fetchBeastStats,
  fetchBeastHighlights,
  type BeastAttributeFilters,
  type BeastStats,
  type BeastHighlights,
  type BeastHighlightsLeader,
  type Beast,
} from "../services/beast";
import { useControllerUsernames } from "../hooks/useControllerUsernames";
import { getUserFriendlyErrorMessage } from "../utils/error";
import { config } from "../config";

const HIDDEN_FILTER_TRAITS = new Set<string>([
  "adventurerkilledcount",
  "adventurer killed count",
  "adventurers killed",
  "lastkilledby",
  "last killed by",
  "lastdeathtimestamp",
  "last death timestamp"
]);
const PAGE_SIZE = config.pagination.defaultPageSize;

function HomePage() {
  const [search, setSearch] = useState("");
  const [availableFilters, setAvailableFilters] =
    useState<BeastAttributeFilters>({});
  const [attributeFilters, setAttributeFilters] =
    useState<BeastAttributeFilters>({});
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [ownerAddressFilters] = useState<string[]>([]);
  const [beastStats, setBeastStats] = useState<BeastStats | null>(null);
  const [mintedLoading, setMintedLoading] = useState(true);
  const [mintedError, setMintedError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [highlights, setHighlights] = useState<BeastHighlights | null>(null);
  const [highlightsLoading, setHighlightsLoading] = useState(true);
  const [highlightsError, setHighlightsError] = useState<string | null>(null);
  const [selectedBeast, setSelectedBeast] = useState<Beast | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchParams] = useSearchParams();

  const { beasts, loading, error, reload, total } = useBeasts({
    limit: PAGE_SIZE,
    search,
    attributeFilters,
    ownerAddresses: ownerAddressFilters,
    page,
    sort: sortOptionToBeastSortField(sortOption),
  });

  const ownerAddresses = useMemo(
    () => beasts.map((beast) => beast.owner).filter(Boolean),
    [beasts]
  );

  // Defer username lookups to allow beasts to render first
  const { usernames: ownerUsernames } = useControllerUsernames(ownerAddresses, {
    delayMs: 300,
  });

  useEffect(() => {
    const searchQuery = searchParams.get("search") ?? "";
    setSearch(searchQuery);
  }, [searchParams]);

  // Staggered data loading to avoid overwhelming the indexer
  // Filters load first (needed for UI), then stats and highlights after a delay
  useEffect(() => {
    let mounted = true;

    async function loadFilters() {
      try {
        setFiltersLoading(true);
        setFiltersError(null);
        const filters = await fetchBeastAttributeFilters();
        if (!mounted) return;
        const filteredEntries = (
          Object.entries(filters) as Array<[string, string[]]>
        ).filter(([trait]) => !HIDDEN_FILTER_TRAITS.has(trait.toLowerCase()));
        const cleanedFilters = Object.fromEntries(
          filteredEntries
        ) as BeastAttributeFilters;
        setAvailableFilters(cleanedFilters);
        setAttributeFilters((prev: BeastAttributeFilters) => {
          const nextEntries = (
            Object.entries(prev) as Array<[string, string[]]>
          ).filter(([trait]) =>
            Object.prototype.hasOwnProperty.call(cleanedFilters, trait)
          );
          return Object.fromEntries(nextEntries) as BeastAttributeFilters;
        });
      } catch (error: unknown) {
        console.error("Failed to load beast filters", error);
        if (!mounted) return;
        setFiltersError(getUserFriendlyErrorMessage(error, "Failed to load filters"));
      } finally {
        if (!mounted) return;
        setFiltersLoading(false);
      }
    }

    async function loadBeastStats() {
      try {
        setMintedLoading(true);
        setMintedError(null);
        const stats = await fetchBeastStats();
        if (!mounted) return;
        setBeastStats(stats);
      } catch (error: unknown) {
        console.error("Failed to load minted beast count", error);
        if (!mounted) return;
        setMintedError(getUserFriendlyErrorMessage(error, "Failed to load beast stats"));
      } finally {
        if (!mounted) return;
        setMintedLoading(false);
      }
    }

    async function loadHighlights() {
      try {
        setHighlightsLoading(true);
        setHighlightsError(null);
        const highlightsData = await fetchBeastHighlights();
        if (!mounted) return;
        setHighlights(highlightsData);
      } catch (error: unknown) {
        console.error("Failed to load beast highlights", error);
        if (!mounted) return;
        setHighlightsError(
          getUserFriendlyErrorMessage(error, "Failed to load beast highlights")
        );
      } finally {
        if (!mounted) return;
        setHighlightsLoading(false);
      }
    }

    // Load filters first (needed for UI interaction)
    loadFilters();

    // Stagger secondary data loading to reduce initial burst
    const statsTimer = setTimeout(() => {
      if (mounted) loadBeastStats();
    }, 500);

    const highlightsTimer = setTimeout(() => {
      if (mounted) loadHighlights();
    }, 1000);

    return () => {
      mounted = false;
      clearTimeout(statsTimer);
      clearTimeout(highlightsTimer);
    };
  }, []);

  const handleSelectBeast = useCallback((beast: Beast) => {
    setSelectedBeast(beast);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedBeast(null);
  }, []);

  const handleOpenFilters = useCallback(() => {
    setFiltersOpen(true);
  }, []);

  const handleCloseFilters = useCallback(() => {
    setFiltersOpen(false);
  }, []);

  const handleFilterChange = useCallback((trait: string, value: string) => {
    setPage(1);
    setAttributeFilters((prev) => {
      const newFilters = { ...prev };
      if (value && value.trim()) {
        newFilters[trait] = [value];
      } else {
        delete newFilters[trait];
      }
      return newFilters;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setPage(1);
    setAttributeFilters({});
  }, []);

  const formatOwner = useCallback(
    (leader: BeastHighlightsLeader) => {
      if (!leader.owner) return "Unknown";
      // Use the username from the highlights data (already looked up)
      if (leader.username) return leader.username;
      if (leader.owner.length <= 12) return leader.owner;
      return `${leader.owner.slice(0, 6)}…${leader.owner.slice(-4)}`;
    },
    []
  );

  const highlightItems = useMemo(() => {
    if (!highlights) return [];

    const items: Array<{ title: string; subtitle: string }> = [];

    if (highlights.leaders.overall.value > 0) {
      items.push({
        title: `${formatOwner(highlights.leaders.overall)} leads the hunt`,
        subtitle: `${highlights.leaders.overall.value.toLocaleString()} total beasts`,
      });
    }
    if (highlights.leaders.animatedShiny.value > 0) {
      items.push({
        title: `${formatOwner(
          highlights.leaders.animatedShiny
        )} loves animated shinies`,
        subtitle: `${highlights.leaders.animatedShiny.value.toLocaleString()} collected`,
      });
    }
    if (highlights.leaders.shiny.value > 0) {
      items.push({
        title: `${formatOwner(highlights.leaders.shiny)} is the shiny master`,
        subtitle: `${highlights.leaders.shiny.value.toLocaleString()} shinies`,
      });
    }
    if (highlights.leaders.animated.value > 0) {
      items.push({
        title: `${formatOwner(
          highlights.leaders.animated
        )} owns the animations`,
        subtitle: `${highlights.leaders.animated.value.toLocaleString()} animated beasts`,
      });
    }

    return items;
  }, [highlights, formatOwner]);

  const topBar = <TopBar onLogoClick={handleResetFilters} />;

  const filtersControl = (
    <FiltersButton
      attributeFilters={attributeFilters}
      onClick={handleOpenFilters}
    />
  );

  const filtersAndSortControls = (
    <div className="flex items-center gap-2 sm:gap-4">
      {filtersControl}
      <SortDropdown value={sortOption} onChange={setSortOption} />
    </div>
  );

  return (
    <AppLayout topBar={topBar}>
      <StatsPanel
        mintedCount={beastStats?.mintedCount || 0}
        uniqueOwners={beastStats?.uniqueOwners || 0}
        mintedLoading={mintedLoading}
        mintedError={mintedError}
        highlightItems={highlightItems}
        highlightsLoading={highlightsLoading}
        highlightsError={highlightsError}
        onRefresh={() => reload()}
        refreshing={loading}
        filtersControl={filtersAndSortControls}
        globalError={error}
      />

      <BeastGrid
        beasts={beasts}
        ownerUsernames={ownerUsernames}
        onSelect={handleSelectBeast}
        loading={loading}
        emptyMessage={config.ui.emptyMessages.beasts}
      />

      {/* Pagination at bottom */}
      <div className="flex justify-center">
        <PaginationControls
          page={page}
          totalPages={Math.ceil((total || 0) / PAGE_SIZE)}
          disablePrevious={page <= 1}
          disableNext={page >= Math.ceil((total || 0) / PAGE_SIZE)}
          loading={loading}
          onRefresh={() => reload()}
          onPrevious={() => setPage((prev) => Math.max(1, prev - 1))}
          onNext={() => setPage((prev) => prev + 1)}
        />
      </div>

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
    </AppLayout>
  );
}

export default HomePage;
