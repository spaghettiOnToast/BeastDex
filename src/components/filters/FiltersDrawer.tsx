import { useEffect, useMemo } from "react";
import type { BeastAttributeFilters } from "../../services/beast";

type FiltersDrawerProps = {
  open: boolean;
  onClose: () => void;
  availableFilters: BeastAttributeFilters;
  attributeFilters: BeastAttributeFilters;
  filtersLoading: boolean;
  filtersError: string | null;
  onFilterChange: (trait: string, value: string) => void;
  onResetFilters: () => void;
};

export function FiltersDrawer({
  open,
  onClose,
  availableFilters,
  attributeFilters,
  filtersLoading,
  filtersError,
  onFilterChange,
  onResetFilters,
}: FiltersDrawerProps) {
  const hasFiltersApplied = useMemo(
    () => Object.keys(attributeFilters || {}).length > 0,
    [attributeFilters]
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
        className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-hidden border-l border-gray-800 bg-[#0b0b0f] shadow-[0_0_30px_rgba(57,255,20,0.15)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-lsGold">Filters</h2>
            <p className="text-xs text-gray-400">
              {hasFiltersApplied
                ? `${Object.keys(attributeFilters || {}).length} active`
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
              {(Object.entries(availableFilters || {}) as Array<[string, string[]]>)
                .sort(([a], [b]) => {
                  // Custom sort order for filters
                  const order = [
                    "shiny",
                    "animated",
                    "genesis",
                    "beast",
                    "beast id",
                    "prefix",
                    "suffix",
                    "rank",
                    "tier",
                    "type",
                    "token id",
                    "health",
                    "level",
                    "power",
                  ];

                  const aLower = a.toLowerCase();
                  const bLower = b.toLowerCase();
                  const aIndex = order.indexOf(aLower);
                  const bIndex = order.indexOf(bLower);

                  // If both are in the order array, sort by their position
                  if (aIndex !== -1 && bIndex !== -1) {
                    return aIndex - bIndex;
                  }
                  // If only a is in the order array, it comes first
                  if (aIndex !== -1) return -1;
                  // If only b is in the order array, it comes first
                  if (bIndex !== -1) return 1;
                  // Otherwise, sort alphabetically
                  return a.localeCompare(b);
                })
                .map(([trait, values]) => {
                  const normalisedTrait = trait.toLowerCase();
                  const BOOLEAN_FILTER_TRAITS = new Set([
                    "shiny",
                    "animated",
                    "genesis",
                  ]);

                  // Special handling for different filter types
                  const SEARCH_FIELD_TRAITS = new Set([
                    "beast id", "beastid",
                    "token id", "tokenid",
                    "last killed by", "lastkilledby"
                  ]);

                  const RANGE_SLIDER_TRAITS = new Set([
                    "health", "level", "power"
                  ]);

                  const REMOVED_TRAITS = new Set([
                    "last death timestamp", "lastdeathtimestamp",
                    "adventurerkilledcount", "adventurer killed count",
                    "adventurers killed", "lastkilledby", "last killed by"
                  ]);

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
                  const currentValue = attributeFilters[trait]?.[0];

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
              {Object.keys(availableFilters || {}).length === 0 && (
                <p className="text-xs text-gray-400">
                  No metadata filters available.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FiltersDrawer;
