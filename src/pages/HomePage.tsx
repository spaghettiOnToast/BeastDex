import { useCallback, useEffect, useMemo, useState } from "react";
import SortDropdown from "../components/sort/SortDropdown";
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
import { getErrorMessage } from "../utils/error";
import { config } from "../config";

const HIDDEN_FILTER_TRAITS = new Set<string>();
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
  const [sortOption, setSortOption] = useState<"default" | "beast">("default");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchParams] = useSearchParams();

  const { beasts, loading, error, reload, total } = useBeasts({
    limit: PAGE_SIZE,
    search,
    attributeFilters,
    ownerAddresses: ownerAddressFilters,
    page,
    sort: sortOption,
  });

  const ownerAddresses = useMemo(
    () => beasts.map((beast) => beast.owner).filter(Boolean),
    [beasts]
  );

  const { usernames: ownerUsernames } = useControllerUsernames(ownerAddresses);

  useEffect(() => {
    const searchQuery = searchParams.get("search") ?? "";
    setSearch(searchQuery);
  }, [searchParams]);

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
        ).filter(([trait]) => !HIDDEN_FILTER_TRAITS.has(trait));
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
        console.error("❌ Failed to load beast filters", error);
        if (!mounted) return;
        setFiltersError(getErrorMessage(error, "Failed to load filters"));
      } finally {
        if (!mounted) return;
        setFiltersLoading(false);
      }
    }

    loadFilters();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadBeastStats() {
      try {
        setMintedLoading(true);
        setMintedError(null);
        const stats = await fetchBeastStats();
        if (!mounted) return;
        setBeastStats(stats);
      } catch (error: unknown) {
        console.error("❌ Failed to load minted beast count", error);
        if (!mounted) return;
        setMintedError(getErrorMessage(error, "Failed to load beast stats"));
      } finally {
        if (!mounted) return;
        setMintedLoading(false);
      }
    }

    loadBeastStats();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadHighlights() {
      try {
        setHighlightsLoading(true);
        setHighlightsError(null);
        const highlightsData = await fetchBeastHighlights();
        if (!mounted) return;
        setHighlights(highlightsData);
      } catch (error: unknown) {
        console.error("❌ Failed to load beast highlights", error);
        if (!mounted) return;
        setHighlightsError(
          getErrorMessage(error, "Failed to load beast highlights")
        );
      } finally {
        if (!mounted) return;
        setHighlightsLoading(false);
      }
    }

    loadHighlights();
    return () => {
      mounted = false;
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
      if (value) {
        newFilters[trait] = [value];
      } else {
        delete newFilters[trait];
      }
      return newFilters;
    });
  }, []);

  const handleBooleanFilterToggle = useCallback(
    (trait: string, values: string[]) => {
      setPage(1);
      setAttributeFilters((prev) => {
        const newFilters = { ...prev };
        if (values.length > 0) {
          newFilters[trait] = values;
        } else {
          delete newFilters[trait];
        }
        return newFilters;
      });
    },
    []
  );

  const handleResetFilters = useCallback(() => {
    setPage(1);
    setAttributeFilters({});
  }, []);

  const formatOwner = useCallback(
    (leader: BeastHighlightsLeader) => {
      if (!leader.owner) return "Unknown";
      const username = ownerUsernames[leader.owner.toLowerCase()];
      if (username) return username;
      if (leader.owner.length <= 12) return leader.owner;
      return `${leader.owner.slice(0, 6)}…${leader.owner.slice(-4)}`;
    },
    [ownerUsernames]
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

  const topBar = <TopBar />;

  const filtersControl = (
    <FiltersButton
      attributeFilters={attributeFilters}
      onClick={handleOpenFilters}
    />
  );

  const filtersAndSortControls = (
    <div className="flex items-center gap-4">
      {filtersControl}
      <SortDropdown value={sortOption} onChange={setSortOption} />
    </div>
  );

  return (
    <AppLayout topBar={topBar}>
      <div className="space-y-6">
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
        />

        <BeastGrid
          beasts={beasts}
          ownerUsernames={ownerUsernames}
          onSelect={handleSelectBeast}
          loading={loading}
          emptyMessage={config.ui.emptyMessages.beasts}
        />

        {error && (
          <div className="text-center text-red-400">
            <p>❌ {error}</p>
            <button
              onClick={() => reload()}
              type="button"
              className="mt-2 text-lsGold hover:underline"
            >
              Try again
            </button>
          </div>
        )}

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
      </div>
      <FiltersDrawer
        open={filtersOpen}
        onClose={handleCloseFilters}
        availableFilters={availableFilters}
        attributeFilters={attributeFilters}
        filtersLoading={filtersLoading}
        filtersError={filtersError}
        onFilterChange={handleFilterChange}
        onBooleanFilterToggle={handleBooleanFilterToggle}
        onResetFilters={handleResetFilters}
      />
    </AppLayout>
  );
}

export default HomePage;
