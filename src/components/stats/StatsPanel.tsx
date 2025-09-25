import { type ReactNode } from "react";
import CompletionTracker from "../CompletionTracker";
import StatsCarousel from "../StatsCarousel";
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
    <Card className="backdrop-blur-md bg-card/60 border-0 shadow-lg overflow-hidden mb-6">
      <CardContent className="p-0">
        <div className="flex flex-col">
          {/* Top row: Carousel | Centered Completion | Controls */}
          <div className="relative flex items-center px-2 py-2 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent min-h-[90px]">
            {/* Left: Carousel (narrower) */}
            <div className="order-1 max-w-sm flex-shrink">
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
                error={mintedError}
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

          {/* Error display for minted */}
          {!mintedLoading && mintedError ? (
            <Alert
              variant="destructive"
              className="mx-4 mt-2 bg-destructive/10 border-destructive/30"
            >
              <AlertDescription className="text-xs font-medium">
                {mintedError}
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Error display for highlights */}
          {highlightsError ? (
            <Alert
              variant="destructive"
              className="mx-4 mb-3 bg-destructive/10 border-destructive/30"
            >
              <AlertDescription className="font-medium">
                {highlightsError}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default StatsPanel;
