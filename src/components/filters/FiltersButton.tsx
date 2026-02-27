import { useMemo } from "react";
import { Filter } from "lucide-react";
import type { BeastAttributeFilters } from "../../services/beast";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

type FiltersButtonProps = {
  attributeFilters: BeastAttributeFilters;
  onClick: () => void;
  buttonClassName?: string;
};

export function FiltersButton({
  attributeFilters,
  onClick,
  buttonClassName,
}: FiltersButtonProps) {
  const activeFiltersCount = useMemo(
    () => Object.keys(attributeFilters || {}).length,
    [attributeFilters]
  );

  const hasActiveFilters = activeFiltersCount > 0;

  const buttonClasses = cn(
    "border border-gray-700 bg-black/40 text-gray-200 hover:bg-gray-900 hover:text-white transition-colors",
    hasActiveFilters && "border-accent text-accent bg-accent/10 shadow-[0_0_12px_rgba(57,255,20,0.25)]"
  );

  return (
    <Button
      variant="outline"
      onClick={onClick}
      className={cn(buttonClasses, "h-8 px-2 sm:px-3", buttonClassName)}
      size="sm"
    >
      <Filter className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
      <span className="font-medium text-xs sm:text-sm">Filters</span>
      {hasActiveFilters ? (
        <Badge
          variant="outline"
          className="ml-1 sm:ml-2 px-1 sm:px-1.5 py-0 text-[10px] sm:text-xs font-bold border-accent text-accent bg-black/60"
        >
          {activeFiltersCount}
        </Badge>
      ) : null}
    </Button>
  );
}

export default FiltersButton;
