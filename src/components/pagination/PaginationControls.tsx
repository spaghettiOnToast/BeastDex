import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

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
    <Card className="p-3 sm:p-4 backdrop-blur-sm bg-card/50 border-muted/50 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Button
          onClick={onRefresh}
          disabled={loading}
          variant="ghost"
          size="sm"
          className="hover:bg-muted/50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          <span className="font-medium">{loading ? "Refreshing..." : "Refresh"}</span>
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onPrevious}
            disabled={disablePrevious}
            className="h-9 w-9 hover:bg-muted/50"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-4 py-1.5 rounded-md bg-muted/50 border border-border/50">
            <span className="text-sm font-medium">
              {page} / {totalPages}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onNext}
            disabled={disableNext}
            className="h-9 w-9 hover:bg-muted/50"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default PaginationControls;
