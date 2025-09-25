import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  disablePrevious: boolean;
  disableNext: boolean;
  loading: boolean;
  onRefresh: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

export function PaginationControls({
  page,
  totalPages,
  disablePrevious,
  disableNext,
  loading,
  onRefresh,
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <Button
        onClick={onRefresh}
        disabled={loading}
        className="self-start sm:self-auto bg-lsGold text-black font-roboto hover:bg-lsGold/80 disabled:opacity-50"
      >
        {loading ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        <span>{loading ? "Refreshing..." : "Refresh"}</span>
      </Button>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={disablePrevious}
          className="text-xs uppercase tracking-wide border-gray-700 text-gray-300 hover:border-lsGreen hover:text-gray-100 disabled:opacity-40"
        >
          <ChevronLeft className="h-3 w-3" />
          Previous
        </Button>
        <span className="text-xs text-gray-500 px-2">Page {page} of {totalPages}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={disableNext}
          className="text-xs uppercase tracking-wide border-gray-700 text-gray-300 hover:border-lsGreen hover:text-gray-100 disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export default PaginationControls;
