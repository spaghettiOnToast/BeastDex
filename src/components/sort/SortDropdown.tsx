import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";

export type SortOption = "default" | "beast" | "tier" | "health" | "rank" | "last-death";

type SortDropdownProps = {
  value: SortOption;
  onChange: (value: SortOption) => void;
};

const OPTIONS: Array<{ label: string; value: SortOption }> = [
  { label: "Default", value: "default" },
  { label: "Beast (A → Z)", value: "beast" },
  { label: "Tier (1 → 5)", value: "tier" },
  { label: "Health (High → Low)", value: "health" },
  { label: "Rank (1 → ∞)", value: "rank" },
  { label: "Last Death (Recent)", value: "last-death" },
];

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const currentOption = OPTIONS.find(option => option.value === value) || OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="font-medium bg-card/90 backdrop-blur-sm hover:bg-card"
        >
          <span className="text-muted-foreground mr-1.5">Sort:</span>
          {currentOption.label}
          <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px] bg-card/95 backdrop-blur-md border-border/50">
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className="cursor-pointer font-medium text-foreground hover:bg-accent/80 hover:text-accent-foreground"
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default SortDropdown;
