import { useCallback, useMemo, useState } from "react";
import { Filter } from "lucide-react";
import type { BeastAttributeFilters } from "../../services/beast";
import { Button } from "../ui/button";
import { FiltersDrawer } from "./FiltersDrawer";

type FiltersButtonProps = {
  availableFilters: BeastAttributeFilters;
  attributeFilters: BeastAttributeFilters;
  filtersLoading: boolean;
  filtersError: string | null;
  onFilterChange: (trait: string, value: string) => void;
  onBooleanFilterToggle: (trait: string, values: string[]) => void;
  onResetFilters: () => void;
  buttonClassName?: string;
};

export function FiltersButton({
  availableFilters,
  attributeFilters,
  filtersLoading,
  filtersError,
  onFilterChange,
  onBooleanFilterToggle,
  onResetFilters,
  buttonClassName,
}: FiltersButtonProps) {
  const [open, setOpen] = useState(false);

  const activeFiltersCount = useMemo(
    () => Object.keys(attributeFilters || {}).length,
    [attributeFilters]
  );

  const hasActiveFilters = activeFiltersCount > 0;

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button
        variant="outline"
        onClick={handleOpen}
        className={`border-lsGold text-lsGold hover:bg-gray-900 hover:text-lsGold ${buttonClassName || ""}`}
      >
        <Filter className="h-4 w-4" />
        <span>Filters</span>
        {hasActiveFilters ? (
          <span className="text-[10px] text-gray-400">{`${activeFiltersCount} active`}</span>
        ) : null}
      </Button>
      <FiltersDrawer
        open={open}
        onClose={handleClose}
        availableFilters={availableFilters}
        attributeFilters={attributeFilters}
        filtersLoading={filtersLoading}
        filtersError={filtersError}
        onFilterChange={onFilterChange}
        onBooleanFilterToggle={onBooleanFilterToggle}
        onResetFilters={onResetFilters}
      />
    </>
  );
}

export default FiltersButton;
