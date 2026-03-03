import { ChevronLeft, ChevronRight } from "lucide-react";
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
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  return (
    <div className="flex items-center gap-2 py-6">
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        disabled={disablePrevious}
        className="h-9 w-9 text-zinc-400 hover:text-white hover:bg-white/[0.06]"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="px-4 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
        <span className="text-sm font-medium text-zinc-300">
          {page} / {totalPages}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={disableNext}
        className="h-9 w-9 text-zinc-400 hover:text-white hover:bg-white/[0.06]"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default PaginationControls;
