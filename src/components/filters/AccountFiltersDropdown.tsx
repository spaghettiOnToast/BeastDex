import { useMemo, useState } from "react";
import { Filter, X } from "lucide-react";
import type { BeastAttributeFilters } from "../../services/beast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";

type AccountFiltersDropdownProps = {
  availableFilters: BeastAttributeFilters;
  attributeFilters: BeastAttributeFilters;
  filtersLoading: boolean;
  filtersError: string | null;
  onFilterChange: (trait: string, value: string) => void;
  onResetFilters: () => void;
  buttonLabel?: string;
};

export function AccountFiltersDropdown({
  availableFilters,
  attributeFilters,
  filtersLoading,
  filtersError,
  onFilterChange,
  onResetFilters,
  buttonLabel = "Filters",
}: AccountFiltersDropdownProps) {
  const [open, setOpen] = useState(false);

  const activeFiltersCount = useMemo(
    () => Object.keys(attributeFilters).length,
    [attributeFilters]
  );

  const filterEntries = useMemo(
    () =>
      Object.entries(availableFilters ?? {}).filter(([, values]) =>
        Array.isArray(values)
      ) as Array<[string, string[]]>,
    [availableFilters]
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-lsGold text-lsGold hover:bg-gray-900 hover:text-lsGold text-[10px] font-semibold uppercase tracking-wide"
        >
          <Filter className="h-3 w-3" />
          <span>{buttonLabel}</span>
          {activeFiltersCount > 0 ? (
            <span className="rounded bg-lsGold/20 px-1 text-[9px] text-lsGold">
              {activeFiltersCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 border-gray-800 bg-[#0b0b0f] p-0"
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 text-xs text-gray-400">
          <span className="font-semibold text-gray-200">Filters</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onResetFilters();
              setOpen(false);
            }}
            className="h-6 px-2 py-1 text-[10px] uppercase tracking-wide text-gray-300 hover:bg-gray-700 hover:text-gray-200"
          >
            <X className="h-3 w-3 mr-1" />
            Reset
          </Button>
        </div>
          <div className="max-h-80 overflow-y-auto px-4 py-3 text-xs text-gray-300">
            {filtersError ? (
              <p className="text-red-400">{filtersError}</p>
            ) : filtersLoading ? (
              <p className="text-gray-400">Loading filters...</p>
            ) : filterEntries.length === 0 ? (
              <p className="text-gray-400">No metadata filters available.</p>
            ) : (
              filterEntries
                .slice()
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([trait, values]) => {
                  const normalisedTrait = trait.toLowerCase();
                  const BOOLEAN_FILTER_TRAITS = new Set([
                    "shiny",
                    "animated",
                    "genesis",
                  ]);
                  const safeValues = Array.isArray(values)
                    ? values
                        .map((value) => String(value ?? ""))
                        .filter((value) => value.length > 0)
                    : [];

                  const currentValue = attributeFilters[trait]?.[0] ?? "";
                  const sortedValues = safeValues.slice().sort((a, b) => a.localeCompare(b));
                  const isBoolean =
                    BOOLEAN_FILTER_TRAITS.has(normalisedTrait) &&
                    sortedValues.length > 0 &&
                    sortedValues.every((value) => value === "0" || value === "1");

                  if (sortedValues.length === 0) {
                    return null;
                  }

                  return (
                    <div key={trait} className="mb-3 last:mb-0">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-gray-200">
                        <span className="font-semibold capitalize">{trait}</span>
                        {currentValue ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onFilterChange(trait, "")}
                            className="h-auto p-0 text-[10px] text-lsGold hover:underline hover:bg-transparent"
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                      <select
                        value={currentValue}
                        onChange={(event) => {
                          onFilterChange(trait, event.target.value);
                          setOpen(false);
                        }}
                        className="w-full rounded-md border border-gray-700 bg-black px-2 py-1.5 text-[11px] text-gray-200 focus:outline-none focus:ring-2 focus:ring-lsGreen"
                      >
                        <option value="">All</option>
                        {sortedValues.map((value) => (
                          <option key={value} value={value}>
                            {isBoolean
                              ? value === "1"
                                ? "Yes"
                                : "No"
                              : value}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })
            )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AccountFiltersDropdown;
