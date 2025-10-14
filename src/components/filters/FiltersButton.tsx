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
    hasActiveFilters && "border-lsGreen text-lsGreen bg-lsGreen/10 shadow-[0_0_12px_rgba(57,255,20,0.25)]"
  );

  return (
    <Button
      variant="outline"
      onClick={onClick}
      className={cn(buttonClasses, buttonClassName)}
      size="sm"
    >
      <Filter className="h-4 w-4 mr-2" />
      <span className="font-medium">Filters</span>
      {hasActiveFilters ? (
        <Badge
          variant="outline"
          className="ml-2 px-1.5 py-0 text-[10px] font-bold border-lsGreen text-lsGreen bg-black/60"
        >
          {activeFiltersCount}
        </Badge>
      ) : null}
    </Button>
  );
}

export default FiltersButton;
