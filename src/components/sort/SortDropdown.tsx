import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  | "recent-desc"
  | "skulls-desc";

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

/** A standalone item with no asc/desc pair */
type SingleItem = { type: "single"; label: string; value: SortOption };
/** A paired item with asc and desc directions */
type PairedItem = { type: "paired"; label: string; asc: SortOption; desc: SortOption };
type SortGroupItem = SingleItem | PairedItem;
type SortGroup = { groupLabel: string | null; items: SortGroupItem[] };

/** Flat list kept for backward compatibility (trigger label lookup, external consumers) */
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
  { label: "Unclaimed Skulls (High → Low)", value: "skulls-desc" },
];

/** Sort options organized into groups with paired direction toggles */
const SORT_GROUPS: SortGroup[] = [
  {
    groupLabel: null,
    items: [
      { type: "single", label: "Default (Power)", value: "default" },
      { type: "single", label: "Most Recent", value: "recent-desc" },
    ],
  },
  {
    groupLabel: "Price",
    items: [
      { type: "paired", label: "Price", asc: "price-asc", desc: "price-desc" },
    ],
  },
  {
    groupLabel: "Name",
    items: [
      { type: "paired", label: "Name", asc: "beast-asc", desc: "beast-desc" },
    ],
  },
  {
    groupLabel: "Stats",
    items: [
      { type: "paired", label: "Tier", asc: "tier-asc", desc: "tier-desc" },
      { type: "paired", label: "Health", asc: "health-asc", desc: "health-desc" },
      { type: "paired", label: "Rank", asc: "rank-asc", desc: "rank-desc" },
      { type: "single", label: "Unclaimed Skulls", value: "skulls-desc" },
    ],
  },
  {
    groupLabel: "Activity",
    items: [
      { type: "paired", label: "Last Death", asc: "last-death-asc", desc: "last-death-desc" },
    ],
  },
];

/** Sort options to exclude from the homepage */
export const HOMEPAGE_EXCLUDED_OPTIONS: SortOption[] = [
  "recent-desc",    // Most Recent (based on listing time, not beast death)
  "price-asc",      // Price options don't apply to non-listed beasts
  "price-desc",
  "last-death-asc", // Last death not relevant for homepage browsing
  "last-death-desc",
  "skulls-desc",    // Unclaimed skulls not relevant for homepage
];

/** Check whether a group item has any visible options after exclusions */
function isItemVisible(item: SortGroupItem, excluded?: SortOption[]): boolean {
  if (!excluded) return true;
  if (item.type === "single") return !excluded.includes(item.value);
  // Paired: visible if at least one direction is not excluded
  return !excluded.includes(item.asc) || !excluded.includes(item.desc);
}

export function SortDropdown({ value, onChange, excludeOptions }: SortDropdownProps) {
  // Filter groups, removing excluded items and empty groups
  const filteredGroups = SORT_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isItemVisible(item, excludeOptions)),
  })).filter((group) => group.items.length > 0);

  const currentOption =
    ALL_SORT_OPTIONS.find((option) => option.value === value) || ALL_SORT_OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 sm:px-3 font-medium border border-white/[0.06] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
        >
          <span className="mr-1 sm:mr-1.5 text-zinc-500 text-xs sm:text-sm">Sort:</span>
          <span className="text-xs sm:text-sm">{currentOption.label}</span>
          <ChevronDown className="ml-1 sm:ml-1.5 h-3 w-3 sm:h-3.5 sm:w-3.5 text-zinc-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[180px] border border-white/[0.06] bg-[#18181b] text-zinc-200"
      >
        {filteredGroups.map((group, groupIndex) => (
          <DropdownMenuGroup key={group.groupLabel ?? "default"}>
            {groupIndex > 0 && (
              <DropdownMenuSeparator className="bg-white/[0.06]" />
            )}
            {group.groupLabel && (
              <DropdownMenuLabel className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold px-2 py-1">
                {group.groupLabel}
              </DropdownMenuLabel>
            )}
            {group.items.map((item) =>
              item.type === "single" ? (
                <DropdownMenuItem
                  key={item.value}
                  onClick={() => onChange(item.value)}
                  className="cursor-pointer font-medium text-xs sm:text-sm text-zinc-200 hover:bg-white/[0.06] hover:text-white"
                >
                  {item.label}
                </DropdownMenuItem>
              ) : (
                <PairedSortRow
                  key={item.label}
                  item={item}
                  currentValue={value}
                  onChange={onChange}
                  excludeOptions={excludeOptions}
                />
              )
            )}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PairedSortRow({
  item,
  currentValue,
  onChange,
  excludeOptions,
}: {
  item: PairedItem;
  currentValue: SortOption;
  onChange: (value: SortOption) => void;
  excludeOptions?: SortOption[];
}) {
  const ascHidden = excludeOptions?.includes(item.asc);
  const descHidden = excludeOptions?.includes(item.desc);
  const isAscActive = currentValue === item.asc;
  const isDescActive = currentValue === item.desc;

  return (
    <div className="flex items-center justify-between px-2 py-1.5 text-xs sm:text-sm font-medium text-zinc-200">
      <span>{item.label}</span>
      <span className="flex items-center gap-0.5 ml-3">
        {!ascHidden && (
          <button
            type="button"
            onClick={() => onChange(item.asc)}
            className={`rounded p-0.5 transition-colors ${
              isAscActive
                ? "bg-accent/15 text-accent"
                : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
            }`}
            title="Ascending"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        )}
        {!descHidden && (
          <button
            type="button"
            onClick={() => onChange(item.desc)}
            className={`rounded p-0.5 transition-colors ${
              isDescActive
                ? "bg-accent/15 text-accent"
                : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
            }`}
            title="Descending"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </div>
  );
}

export default SortDropdown;
