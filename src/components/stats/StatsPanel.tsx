import { type ReactNode } from "react";
import CompletionTracker from "../CompletionTracker";
import StatsCarousel from "../StatsCarousel";
import { TOTAL_BEAST_SUPPLY } from "../../services/beast";

type HighlightItem = {
  title: string;
  subtitle?: string;
};

type StatsPanelProps = {
  mintedCount: number;
  uniqueOwners: number;
  mintedLoading: boolean;
  mintedError: string | null;
  highlightItems: HighlightItem[];
  highlightsLoading: boolean;
  highlightsError: string | null;
  onRefresh: () => void;
  refreshing: boolean;
  filtersControl?: ReactNode;
};

export function StatsPanel({
  mintedCount,
  uniqueOwners,
  mintedLoading,
  mintedError,
  highlightItems,
  highlightsLoading,
  highlightsError,
  onRefresh,
  refreshing,
  filtersControl,
}: StatsPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Top row with completion tracker and refresh */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-[11px] text-gray-400">
        <div className="flex flex-col gap-1">
          <CompletionTracker
            owned={mintedCount}
            total={TOTAL_BEAST_SUPPLY}
            loading={mintedLoading}
            error={mintedError}
            align="left"
            className="mb-0"
            uniqueOwners={uniqueOwners}
          />
          {!mintedLoading && mintedError ? (
            <span className="text-red-400">{mintedError}</span>
          ) : null}
        </div>

        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="px-3 py-1.5 bg-lsGold text-black font-roboto rounded-md hover:opacity-80 flex items-center space-x-2 disabled:opacity-50"
        >
          {refreshing ? (
            <span className="animate-spin h-3 w-3 border-2 border-black border-t-transparent rounded-full"></span>
          ) : null}
          <span className="text-xs uppercase">Refresh</span>
        </button>
      </div>

      {/* Full-width carousel with filters on the right */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <StatsCarousel
            items={highlightItems}
            loading={highlightsLoading}
          />
        </div>
        {filtersControl ? (
          <div className="shrink-0">{filtersControl}</div>
        ) : null}
      </div>

      {/* Error display */}
      {highlightsError ? (
        <span className="text-xs text-red-400">{highlightsError}</span>
      ) : null}
    </div>
  );
}

export default StatsPanel;
