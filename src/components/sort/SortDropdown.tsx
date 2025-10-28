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
  | "price-desc";

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
};

const OPTIONS: Array<{ label: string; value: SortOption }> = [
  { label: "Default (Power)", value: "default" },
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

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const currentOption = OPTIONS.find(option => option.value === value) || OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="font-medium border border-gray-700 bg-black/40 text-gray-200 hover:bg-gray-900 hover:text-white"
        >
          <span className="mr-1.5 text-gray-400">Sort:</span>
          {currentOption.label}
          <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[140px] border border-gray-800 bg-black/90 text-gray-200 backdrop-blur-md"
      >
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className="cursor-pointer font-medium text-gray-200 hover:bg-gray-800 hover:text-lsGold"
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default SortDropdown;
