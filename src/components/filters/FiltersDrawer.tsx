import { useEffect, useMemo, useState } from "react";
import type { BeastAttributeFilters } from "../../services/beast";

type FiltersDrawerProps = {
  open: boolean;
  onClose: () => void;
  availableFilters: BeastAttributeFilters;
  attributeFilters: BeastAttributeFilters;
  filtersLoading: boolean;
  filtersError: string | null;
  onFilterChange: (trait: string, value: string) => void;
  onMultiFilterChange?: (trait: string, values: string[]) => void;
  onRankRangeChange?: (ranges: string[]) => void;
  onHealthRangeChange?: (min: number, max: number) => void;
  onLevelRangeChange?: (min: number, max: number) => void;
  onAdventurersKilledRangeChange?: (min: number, max: number) => void;
  unclaimedSkullsFilter?: boolean;
  onUnclaimedSkullsChange?: (value: boolean) => void;
  skullsLoading?: boolean;
  onResetFilters: () => void;
};

// Health range constants (static - max is always 1023)
const HEALTH_MIN = 1;
const HEALTH_MAX = 1023;

// Level range constants (dynamic max from data, fallback to 255)
const LEVEL_MIN = 1;
const LEVEL_MAX_DEFAULT = 255;

// Adventurers Killed range constants (dynamic max from data, fallback to 50)
const ADVENTURERS_KILLED_MIN = 0;
const ADVENTURERS_KILLED_MAX_DEFAULT = 50;

/**
 * Helper to compute max value from available filter values
 */
function getMaxFromFilterValues(values: string[] | undefined, fallback: number): number {
  if (!values || values.length === 0) return fallback;
  const nums = values.map(Number).filter((n) => !isNaN(n));
  return nums.length > 0 ? Math.max(...nums) : fallback;
}

// Traits that support multi-select (checkboxes)
const MULTI_SELECT_TRAITS = new Set([
  "tier",
  "type",
  "beast",
  "prefix",
  "suffix",
]);

// Traits rendered as boolean toggles (Yes/No/Any)
const BOOLEAN_FILTER_TRAITS = new Set(["shiny", "animated"]);

// Traits rendered as free-text search
const SEARCH_FIELD_TRAITS = new Set([
  "beast id", "beastid",
  "token id", "tokenid",
  "last killed by", "lastkilledby",
]);

// Traits rendered as generic range sliders
const RANGE_SLIDER_TRAITS = new Set(["health", "level", "power"]);

// Traits that are either invalid or rendered via dedicated sections
const REMOVED_TRAITS = new Set([
  "last death timestamp", "lastdeathtimestamp",
  "adventurerkilledcount", "adventurer killed count",
  "lastkilledby", "last killed by",
  "tier", "type",
  "health", "level", "adventurers killed",
  "genesis",
]);

// Sort priority for filter sections
const FILTER_SORT_ORDER = [
  "shiny",
  "animated",
  "beast",
  "prefix",
  "suffix",
  "tier",
  "type",
  "rank",
  "health",
  "level",
  "beast id",
  "token id",
  "power",
];

// Rank range options (max rank is 1243)
const RANK_RANGES = [
  { label: "1-10", min: 1, max: 10 },
  { label: "11-25", min: 11, max: 25 },
  { label: "26-50", min: 26, max: 50 },
  { label: "51-100", min: 51, max: 100 },
  { label: "101-150", min: 101, max: 150 },
  { label: "151-200", min: 151, max: 200 },
  { label: "201+", min: 201, max: 1243 },
];

export function FiltersDrawer({
  open,
  onClose,
  availableFilters,
  attributeFilters,
  filtersLoading,
  filtersError,
  onFilterChange,
  onMultiFilterChange,
  onRankRangeChange,
  onHealthRangeChange,
  onLevelRangeChange,
  onAdventurersKilledRangeChange,
  unclaimedSkullsFilter = false,
  onUnclaimedSkullsChange,
  skullsLoading = false,
  onResetFilters,
}: FiltersDrawerProps) {
  // Compute dynamic max values from available filters (Level and Adventurers Killed only)
  const dynamicLevelMax = useMemo(
    () => getMaxFromFilterValues(availableFilters?.["Level"], LEVEL_MAX_DEFAULT),
    [availableFilters]
  );
  const dynamicAdventurersKilledMax = useMemo(
    () => getMaxFromFilterValues(availableFilters?.["Adventurers Killed"], ADVENTURERS_KILLED_MAX_DEFAULT),
    [availableFilters]
  );

  // Get current rank range selections
  const selectedRankRanges = useMemo(() => {
    const rankValues = attributeFilters["Rank"] || attributeFilters["rank"] || [];
    // Convert individual rank values back to range labels for display
    const ranges = new Set<string>();
    for (const value of rankValues) {
      const num = Number(value);
      if (!isNaN(num)) {
        for (const range of RANK_RANGES) {
          if (num >= range.min && num <= range.max) {
            ranges.add(range.label);
            break;
          }
        }
      }
    }
    return ranges;
  }, [attributeFilters]);

  // Health range state (static max)
  const [healthMin, setHealthMin] = useState(HEALTH_MIN);
  const [healthMax, setHealthMax] = useState(HEALTH_MAX);
  const healthFilterActive = attributeFilters["Health"]?.length > 0;

  // Level range state (dynamic max)
  const [levelMin, setLevelMin] = useState(LEVEL_MIN);
  const [levelMax, setLevelMax] = useState(dynamicLevelMax);
  const levelFilterActive = attributeFilters["Level"]?.length > 0;

  // Adventurers Killed range state (dynamic max)
  const [adventurersKilledMin, setAdventurersKilledMin] = useState(ADVENTURERS_KILLED_MIN);
  const [adventurersKilledMax, setAdventurersKilledMax] = useState(dynamicAdventurersKilledMax);
  const adventurersKilledFilterActive = attributeFilters["Adventurers Killed"]?.length > 0;

  // Update dynamic max values when filters load
  useEffect(() => {
    if (!levelFilterActive) {
      setLevelMax(dynamicLevelMax);
    }
  }, [dynamicLevelMax, levelFilterActive]);

  useEffect(() => {
    if (!adventurersKilledFilterActive) {
      setAdventurersKilledMax(dynamicAdventurersKilledMax);
    }
  }, [dynamicAdventurersKilledMax, adventurersKilledFilterActive]);

  // Reset sliders when filters are reset
  useEffect(() => {
    if (!healthFilterActive) {
      setHealthMin(HEALTH_MIN);
      setHealthMax(HEALTH_MAX);
    }
    if (!levelFilterActive) {
      setLevelMin(LEVEL_MIN);
      setLevelMax(dynamicLevelMax);
    }
    if (!adventurersKilledFilterActive) {
      setAdventurersKilledMin(ADVENTURERS_KILLED_MIN);
      setAdventurersKilledMax(dynamicAdventurersKilledMax);
    }
  }, [healthFilterActive, levelFilterActive, adventurersKilledFilterActive, dynamicLevelMax, dynamicAdventurersKilledMax]);

  const hasFiltersApplied = useMemo(
    () => Object.keys(attributeFilters || {}).length > 0 || unclaimedSkullsFilter,
    [attributeFilters, unclaimedSkullsFilter]
  );

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close filters"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative ml-auto flex h-full w-full max-w-[100vw] sm:max-w-md flex-col overflow-hidden border-l border-gray-800 bg-[#0b0b0f] shadow-[0_0_30px_rgba(57,255,20,0.15)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-lsGold">Filters</h2>
            <p className="text-xs text-gray-400">
              {hasFiltersApplied
                ? `${Object.keys(attributeFilters || {}).length + (unclaimedSkullsFilter ? 1 : 0)} active`
                : "No filters applied"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onResetFilters}
              disabled={!hasFiltersApplied}
              className="text-xs uppercase tracking-wide px-3 py-1 rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-md hover:bg-gray-900 text-gray-300"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {filtersError ? (
            <p className="text-xs text-red-400">{filtersError}</p>
          ) : null}

          {filtersLoading ? (
            <p className="text-xs text-gray-400">Loading filters...</p>
          ) : (
            <div className="space-y-3">
              {/* Tier Filter - Priority position */}
              {onMultiFilterChange && availableFilters["Tier"] && (
                <div className="flex flex-col gap-2 text-xs text-gray-300">
                  <span className="font-semibold text-gray-200">Tier</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(availableFilters["Tier"] || [])
                      .slice()
                      .sort((a, b) => Number(a) - Number(b))
                      .map((value) => {
                        const currentValues = attributeFilters["Tier"] || [];
                        const isSelected = currentValues.includes(value);
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              const newValues = isSelected
                                ? currentValues.filter((v) => v !== value)
                                : [...currentValues, value];
                              onMultiFilterChange("Tier", newValues);
                            }}
                            className={`px-2 py-1 text-xs rounded-md border transition-all ${
                              isSelected
                                ? "bg-lsGreen/20 border-lsGreen text-lsGreen"
                                : "bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500"
                            }`}
                          >
                            {value}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Type Filter - Priority position */}
              {onMultiFilterChange && availableFilters["Type"] && (
                <div className="flex flex-col gap-2 text-xs text-gray-300">
                  <span className="font-semibold text-gray-200">Type</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(availableFilters["Type"] || [])
                      .slice()
                      .sort((a, b) => String(a).localeCompare(String(b)))
                      .map((value) => {
                        const currentValues = attributeFilters["Type"] || [];
                        const isSelected = currentValues.includes(value);
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              const newValues = isSelected
                                ? currentValues.filter((v) => v !== value)
                                : [...currentValues, value];
                              onMultiFilterChange("Type", newValues);
                            }}
                            className={`px-2 py-1 text-xs rounded-md border transition-all ${
                              isSelected
                                ? "bg-lsGreen/20 border-lsGreen text-lsGreen"
                                : "bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500"
                            }`}
                          >
                            {value}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Rank Range Filter */}
              {onRankRangeChange && (
                <div className="flex flex-col gap-2 text-xs text-gray-300">
                  <span className="font-semibold text-gray-200">Rank</span>
                  <div className="flex flex-wrap gap-1.5">
                    {RANK_RANGES.map((range) => {
                      const isSelected = selectedRankRanges.has(range.label);
                      return (
                        <button
                          key={range.label}
                          type="button"
                          onClick={() => {
                            // Toggle this range
                            const newRanges = new Set(selectedRankRanges);
                            if (isSelected) {
                              newRanges.delete(range.label);
                            } else {
                              newRanges.add(range.label);
                            }
                            // Convert ranges to individual rank values
                            const rankValues: string[] = [];
                            for (const r of RANK_RANGES) {
                              if (newRanges.has(r.label)) {
                                const maxVal = Math.min(r.max, 1243);
                                for (let i = r.min; i <= maxVal; i++) {
                                  rankValues.push(String(i));
                                }
                              }
                            }
                            onRankRangeChange(rankValues);
                          }}
                          className={`px-2 py-1 text-xs rounded-md border transition-all ${
                            isSelected
                              ? "bg-lsGreen/20 border-lsGreen text-lsGreen"
                              : "bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500"
                          }`}
                        >
                          {range.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {(Object.entries(availableFilters || {}) as Array<[string, string[]]>)
                .sort(([a], [b]) => {
                  const aIndex = FILTER_SORT_ORDER.indexOf(a.toLowerCase());
                  const bIndex = FILTER_SORT_ORDER.indexOf(b.toLowerCase());
                  if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                  if (aIndex !== -1) return -1;
                  if (bIndex !== -1) return 1;
                  return a.localeCompare(b);
                })
                .map(([trait, values]) => {
                  const normalisedTrait = trait.toLowerCase();

                  // Skip removed traits
                  if (REMOVED_TRAITS.has(normalisedTrait)) {
                    return null;
                  }

                  const safeValues = Array.isArray(values)
                    ? values
                        .map((value) => String(value ?? ""))
                        .filter((value) => value.length > 0)
                    : [];
                  const isBoolean =
                    BOOLEAN_FILTER_TRAITS.has(normalisedTrait) &&
                    safeValues.every((value) => value === "0" || value === "1");
                  const isSearchField = SEARCH_FIELD_TRAITS.has(normalisedTrait);
                  const isRangeSlider = RANGE_SLIDER_TRAITS.has(normalisedTrait);
                  const isMultiSelect = MULTI_SELECT_TRAITS.has(normalisedTrait) && onMultiFilterChange;
                  const currentValue = attributeFilters[trait]?.[0];
                  const currentValues = attributeFilters[trait] || [];

                  return (
                    <div
                      key={trait}
                      className="flex flex-col gap-2 text-xs text-gray-300"
                    >
                      <span className="font-semibold capitalize text-gray-200">
                        {trait}
                      </span>

                      {isBoolean ? (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            {currentValue === "1" ? "Yes" : currentValue === "0" ? "No" : "Any"}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              // Cycle through: no filter → yes (1) → no (0) → no filter
                              const nextValue =
                                currentValue === "1" ? "0" :
                                currentValue === "0" ? "" : "1";
                              onFilterChange(trait, nextValue);
                            }}
                            aria-pressed={currentValue === "1"}
                            aria-label={`${trait} filter: ${
                              currentValue === "1"
                                ? "Yes"
                                : currentValue === "0"
                                ? "No"
                                : "Any"
                            }`}
                            className="p-1 rounded-full border border-transparent hover:border-lsGreen focus:outline-none focus:ring-2 focus:ring-lsGreen"
                          >
                            <span
                              className={`block h-4 w-4 rounded-full border transition flex items-center justify-center text-[8px] font-bold ${
                                currentValue === "1"
                                  ? "border-[#39ff14] bg-[#39ff14] shadow-[0_0_8px_#39ff14] text-black"
                                  : currentValue === "0"
                                  ? "border-red-500 bg-red-500/20 text-red-500"
                                  : "border-gray-700 bg-gray-800"
                              }`}
                            >
                              {currentValue === "1" ? "✓" : currentValue === "0" ? "✗" : ""}
                            </span>
                          </button>
                        </div>
                      ) : isSearchField ? (
                        <input
                          type="text"
                          value={currentValue ?? ""}
                          onChange={(event) =>
                            onFilterChange(trait, event.target.value)
                          }
                          placeholder={`Search ${trait.toLowerCase()}...`}
                          className="bg-black border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-lsGreen focus:border-lsGreen"
                        />
                      ) : isRangeSlider ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <span>Min: {Math.min(...safeValues.map(Number))}</span>
                            <span>Max: {Math.max(...safeValues.map(Number))}</span>
                          </div>
                          <input
                            type="range"
                            min={Math.min(...safeValues.map(Number))}
                            max={Math.max(...safeValues.map(Number))}
                            value={currentValue ? Number(currentValue) : Math.min(...safeValues.map(Number))}
                            onChange={(event) =>
                              onFilterChange(trait, event.target.value)
                            }
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-slider"
                          />
                          <div className="text-center text-xs text-lsGold">
                            {currentValue ? `Selected: ${currentValue}` : 'All values'}
                          </div>
                        </div>
                      ) : isMultiSelect ? (
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                          {safeValues
                            .slice()
                            .sort((a, b) => {
                              // Sort numerically if both are numbers
                              const aNum = Number(a);
                              const bNum = Number(b);
                              if (!isNaN(aNum) && !isNaN(bNum)) {
                                return aNum - bNum;
                              }
                              return a.localeCompare(b);
                            })
                            .map((value) => {
                              const isSelected = currentValues.includes(value);
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => {
                                    const newValues = isSelected
                                      ? currentValues.filter((v) => v !== value)
                                      : [...currentValues, value];
                                    onMultiFilterChange(trait, newValues);
                                  }}
                                  className={`px-2 py-1 text-xs rounded-md border transition-all ${
                                    isSelected
                                      ? "bg-lsGreen/20 border-lsGreen text-lsGreen"
                                      : "bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500"
                                  }`}
                                >
                                  {value}
                                </button>
                              );
                            })}
                        </div>
                      ) : (
                        <select
                          value={currentValue ?? ""}
                          onChange={(event) =>
                            onFilterChange(trait, event.target.value)
                          }
                          className="bg-black border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-lsGreen"
                        >
                          <option value="">All</option>
                          {safeValues
                            .slice()
                            .sort((a, b) => a.localeCompare(b))
                            .map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  );
                }).filter(Boolean)}
              {/* Unclaimed Skulls Toggle - below animated (same UI as shiny/animated) */}
              {onUnclaimedSkullsChange && (
                <div className="flex flex-col gap-2 text-xs text-gray-300">
                  <span className="font-semibold capitalize text-gray-200">
                    Unclaimed Skulls
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 flex items-center gap-1.5">
                      {unclaimedSkullsFilter ? "Yes" : "Any"}
                      {skullsLoading && (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-600 border-t-lsGreen" />
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUnclaimedSkullsChange(!unclaimedSkullsFilter)}
                      aria-pressed={unclaimedSkullsFilter}
                      aria-label={`Unclaimed Skulls filter: ${unclaimedSkullsFilter ? "Yes" : "Any"}`}
                      className="p-1 rounded-full border border-transparent hover:border-lsGreen focus:outline-none focus:ring-2 focus:ring-lsGreen"
                    >
                      <span
                        className={`block h-4 w-4 rounded-full border transition flex items-center justify-center text-[8px] font-bold ${
                          unclaimedSkullsFilter
                            ? "border-[#39ff14] bg-[#39ff14] shadow-[0_0_8px_#39ff14] text-black"
                            : "border-gray-700 bg-gray-800"
                        }`}
                      >
                        {unclaimedSkullsFilter ? "✓" : ""}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {Object.keys(availableFilters || {}).length === 0 && (
                <p className="text-xs text-gray-400">
                  No metadata filters available.
                </p>
              )}

              {/* Health Range Slider - at bottom above Level */}
              {onHealthRangeChange && (
                <div className="flex flex-col gap-2 text-xs text-gray-300 pt-2 border-t border-gray-800/50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-200">Health</span>
                    {healthFilterActive && (
                      <button
                        type="button"
                        onClick={() => {
                          setHealthMin(HEALTH_MIN);
                          setHealthMax(HEALTH_MAX);
                          onHealthRangeChange(-1, -1); // Signal to clear filter
                        }}
                        className="text-[10px] text-gray-500 hover:text-gray-300"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-500 mb-1 block">Min</label>
                        <input
                          type="number"
                          min={HEALTH_MIN}
                          max={healthMax}
                          value={healthMin}
                          onChange={(e) => {
                            const val = Math.max(HEALTH_MIN, Math.min(Number(e.target.value), healthMax));
                            setHealthMin(val);
                            onHealthRangeChange(val, healthMax);
                          }}
                          className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-500 mb-1 block">Max</label>
                        <input
                          type="number"
                          min={healthMin}
                          max={HEALTH_MAX}
                          value={healthMax}
                          onChange={(e) => {
                            const val = Math.min(HEALTH_MAX, Math.max(Number(e.target.value), healthMin));
                            setHealthMax(val);
                            onHealthRangeChange(healthMin, val);
                          }}
                          className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="text-center text-[10px] text-gray-500">
                      {healthMin === HEALTH_MIN && healthMax === HEALTH_MAX
                        ? "All health values"
                        : `${healthMin} - ${healthMax}`}
                    </div>
                  </div>
                </div>
              )}

              {/* Level Range Slider - below Health */}
              {onLevelRangeChange && (
                <div className="flex flex-col gap-2 text-xs text-gray-300">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-200">Level</span>
                    {levelFilterActive && (
                      <button
                        type="button"
                        onClick={() => {
                          setLevelMin(LEVEL_MIN);
                          setLevelMax(dynamicLevelMax);
                          onLevelRangeChange(-1, -1); // Signal to clear filter
                        }}
                        className="text-[10px] text-gray-500 hover:text-gray-300"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-500 mb-1 block">Min</label>
                        <input
                          type="number"
                          min={LEVEL_MIN}
                          max={levelMax}
                          value={levelMin}
                          onChange={(e) => {
                            const val = Math.max(LEVEL_MIN, Math.min(Number(e.target.value), levelMax));
                            setLevelMin(val);
                            onLevelRangeChange(val, levelMax);
                          }}
                          className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-500 mb-1 block">Max</label>
                        <input
                          type="number"
                          min={levelMin}
                          max={dynamicLevelMax}
                          value={levelMax}
                          onChange={(e) => {
                            const val = Math.min(dynamicLevelMax, Math.max(Number(e.target.value), levelMin));
                            setLevelMax(val);
                            onLevelRangeChange(levelMin, val);
                          }}
                          className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="text-center text-[10px] text-gray-500">
                      {levelMin === LEVEL_MIN && levelMax === dynamicLevelMax
                        ? "All levels"
                        : `${levelMin} - ${levelMax}`}
                    </div>
                  </div>
                </div>
              )}

              {/* Adventurers Killed Range Slider */}
              {onAdventurersKilledRangeChange && (
                <div className="flex flex-col gap-2 text-xs text-gray-300">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-200">Adventurers Killed</span>
                    {adventurersKilledFilterActive && (
                      <button
                        type="button"
                        onClick={() => {
                          setAdventurersKilledMin(ADVENTURERS_KILLED_MIN);
                          setAdventurersKilledMax(dynamicAdventurersKilledMax);
                          onAdventurersKilledRangeChange(-1, -1); // Signal to clear filter
                        }}
                        className="text-[10px] text-gray-500 hover:text-gray-300"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-500 mb-1 block">Min</label>
                        <input
                          type="number"
                          min={ADVENTURERS_KILLED_MIN}
                          max={adventurersKilledMax}
                          value={adventurersKilledMin}
                          onChange={(e) => {
                            const val = Math.max(ADVENTURERS_KILLED_MIN, Math.min(Number(e.target.value), adventurersKilledMax));
                            setAdventurersKilledMin(val);
                            onAdventurersKilledRangeChange(val, adventurersKilledMax);
                          }}
                          className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-500 mb-1 block">Max</label>
                        <input
                          type="number"
                          min={adventurersKilledMin}
                          max={dynamicAdventurersKilledMax}
                          value={adventurersKilledMax}
                          onChange={(e) => {
                            const val = Math.min(dynamicAdventurersKilledMax, Math.max(Number(e.target.value), adventurersKilledMin));
                            setAdventurersKilledMax(val);
                            onAdventurersKilledRangeChange(adventurersKilledMin, val);
                          }}
                          className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="text-center text-[10px] text-gray-500">
                      {adventurersKilledMin === ADVENTURERS_KILLED_MIN && adventurersKilledMax === dynamicAdventurersKilledMax
                        ? "All values"
                        : `${adventurersKilledMin} - ${adventurersKilledMax}`}
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FiltersDrawer;
