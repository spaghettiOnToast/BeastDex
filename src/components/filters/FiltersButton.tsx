import { useMemo } from "react";
import { Filter } from "lucide-react";
import type { BeastAttributeFilters } from "../../services/beast";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

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

  return (
    <Button
      variant={hasActiveFilters ? "default" : "outline"}
      onClick={onClick}
      className={`h-8 px-2 sm:px-3 ${buttonClassName || ""}`.trim()}
      size="sm"
    >
      <Filter className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
      <span className="font-medium text-xs sm:text-sm">Filters</span>
      {hasActiveFilters ? (
        <Badge variant={hasActiveFilters ? "secondary" : "outline"} className="ml-1 sm:ml-2 px-1 sm:px-1.5 py-0 text-[10px] sm:text-xs font-bold bg-background/20">
          {activeFiltersCount}
        </Badge>
      ) : null}
    </Button>
  );
}

export default FiltersButton;
