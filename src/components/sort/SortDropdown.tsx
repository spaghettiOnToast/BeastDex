import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import type { BeastSortField } from "../../services/beast/types";

export type SortOption =
  | "default"
  | "beast-asc"
  | "beast-desc"
  | "tier-asc"
  | "tier-desc"
  | "health-asc"
  | "health-desc"
  | "rank-asc"
  | "rank-desc"
  | "last-death-asc"
  | "last-death-desc"
  | "price-asc"
  | "price-desc"
  | "recent-desc";

/**
 * Converts a SortOption (with direction) to a BeastSortField (without direction)
 * for use with the fetchBeasts API
 */
export function sortOptionToBeastSortField(sortOption: SortOption): BeastSortField {
  if (sortOption === "default") return "default";

  // Strip the -asc or -desc suffix to get the base field
  const field = sortOption.replace(/-(?:asc|desc)$/, "") as BeastSortField;
  return field;
}

type SortDropdownProps = {
  value: SortOption;
  onChange: (value: SortOption) => void;
  /** Sort options to exclude from the dropdown */
  excludeOptions?: SortOption[];
};

/** All available sort options */
export const ALL_SORT_OPTIONS: Array<{ label: string; value: SortOption }> = [
  { label: "Default (Power)", value: "default" },
  { label: "Most Recent", value: "recent-desc" },
  { label: "Price (Low → High)", value: "price-asc" },
  { label: "Price (High → Low)", value: "price-desc" },
  { label: "Beast (A → Z)", value: "beast-asc" },
  { label: "Beast (Z → A)", value: "beast-desc" },
  { label: "Tier (1 → 5)", value: "tier-asc" },
  { label: "Tier (5 → 1)", value: "tier-desc" },
  { label: "Health (High → Low)", value: "health-desc" },
  { label: "Health (Low → High)", value: "health-asc" },
  { label: "Rank (1 → ∞)", value: "rank-asc" },
  { label: "Rank (∞ → 1)", value: "rank-desc" },
  { label: "Last Death (Recent)", value: "last-death-desc" },
  { label: "Last Death (Oldest)", value: "last-death-asc" },
];

/** Sort options to exclude from the homepage */
export const HOMEPAGE_EXCLUDED_OPTIONS: SortOption[] = [
  "recent-desc",    // Most Recent (based on listing time, not beast death)
  "price-asc",      // Price options don't apply to non-listed beasts
  "price-desc",
  "last-death-asc", // Last death not relevant for homepage browsing
  "last-death-desc",
];

export function SortDropdown({ value, onChange, excludeOptions }: SortDropdownProps) {
  // Filter out excluded options
  const options = excludeOptions
    ? ALL_SORT_OPTIONS.filter(opt => !excludeOptions.includes(opt.value))
    : ALL_SORT_OPTIONS;

  const currentOption = options.find(option => option.value === value) || options[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 sm:px-3 font-medium border border-gray-700 bg-black/40 text-gray-200 hover:bg-gray-900 hover:text-white"
        >
          <span className="mr-1 sm:mr-1.5 text-gray-400 text-xs sm:text-sm">Sort:</span>
          <span className="text-xs sm:text-sm">{currentOption.label}</span>
          <ChevronDown className="ml-1 sm:ml-1.5 h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[140px] border border-gray-800 bg-black/90 text-gray-200 backdrop-blur-md"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className="cursor-pointer font-medium text-xs sm:text-sm text-gray-200 hover:bg-gray-800 hover:text-lsGold"
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default SortDropdown;
