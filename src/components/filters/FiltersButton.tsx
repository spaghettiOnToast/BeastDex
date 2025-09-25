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
      className={buttonClassName}
      size="sm"
    >
      <Filter className="h-4 w-4 mr-2" />
      <span className="font-medium">Filters</span>
      {hasActiveFilters ? (
        <Badge variant={hasActiveFilters ? "secondary" : "outline"} className="ml-2 px-1.5 py-0 text-xs font-bold bg-background/20">
          {activeFiltersCount}
        </Badge>
      ) : null}
    </Button>
  );
}

export default FiltersButton;
