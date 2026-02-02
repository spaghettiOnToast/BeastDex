import { type ReactNode } from "react";
import CompletionTracker from "./CompletionTracker";
import StatsCarousel from "./StatsCarousel";
import { TOTAL_BEAST_SUPPLY } from "../../services/beast";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Alert, AlertDescription } from "../ui/alert";
import { RefreshCw } from "lucide-react";

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
  /** Additional error to display (e.g., from beast fetching) */
  globalError?: string | null;
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
  globalError,
}: StatsPanelProps) {
  // Show only one consolidated error message (first error encountered)
  const consolidatedError = globalError || mintedError || highlightsError;
  return (
    <Card className="backdrop-blur-md bg-card/60 border-0 shadow-lg overflow-hidden mb-4 sm:mb-6">
      <CardContent className="p-0">
        <div className="flex flex-col">
          {/* Mobile Layout: Stack vertically */}
          <div className="flex flex-col lg:hidden px-2 py-2 gap-2 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
            {/* Completion Tracker */}
            <div className="flex justify-center py-1">
              <CompletionTracker
                owned={mintedCount}
                total={TOTAL_BEAST_SUPPLY}
                loading={mintedLoading}
                align="center"
                uniqueOwners={uniqueOwners}
              />
            </div>

            {/* Carousel */}
            <div className="w-full px-1">
              <StatsCarousel
                items={highlightItems}
                loading={highlightsLoading}
              />
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-2 py-1 flex-wrap">
              <Button
                onClick={onRefresh}
                disabled={refreshing}
                variant="ghost"
                size="sm"
                className="hover:bg-primary/10 font-semibold text-xs h-8 px-2"
              >
                <RefreshCw
                  className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              {filtersControl ? <div>{filtersControl}</div> : null}
            </div>
          </div>

          {/* Desktop Layout: Horizontal with centered completion */}
          <div className="hidden lg:flex relative items-center px-2 py-2 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent min-h-[90px]">
            {/* Left: Carousel (narrower) */}
            <div className="order-1 max-w-sm flex-shrink w-full">
              <StatsCarousel
                items={highlightItems}
                loading={highlightsLoading}
              />
            </div>

            {/* Center: Completion Tracker (absolutely centered, bigger) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-110">
              <CompletionTracker
                owned={mintedCount}
                total={TOTAL_BEAST_SUPPLY}
                loading={mintedLoading}
                align="center"
                className="mt-12"
                uniqueOwners={uniqueOwners}
              />
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-2 order-3 shrink-0 ml-auto">
              <Button
                onClick={onRefresh}
                disabled={refreshing}
                variant="ghost"
                size="sm"
                className="hover:bg-primary/10 font-semibold"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              {filtersControl ? <div>{filtersControl}</div> : null}
            </div>
          </div>

          {/* Single consolidated error display */}
          {consolidatedError ? (
            <Alert
              variant="destructive"
              className="mx-3 sm:mx-4 my-2 bg-destructive/10 border-destructive/30"
            >
              <AlertDescription className="text-xs sm:text-sm font-medium text-center">
                {consolidatedError}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default StatsPanel;
