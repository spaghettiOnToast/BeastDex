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
    <Card className="backdrop-blur-sm bg-card/50 border-muted/50 shadow-2xl overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col gap-0">
          {/* Top section: completion + carousel in same row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-6 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
            {/* Completion shrinks to fit */}
            <div className="shrink-0">
              <CompletionTracker
                owned={mintedCount}
                total={TOTAL_BEAST_SUPPLY}
                loading={mintedLoading}
                error={mintedError}
                align="left"
                className="mb-0"
                uniqueOwners={uniqueOwners}
              />
            </div>

            {/* Carousel takes the rest of the row */}
            <div className="flex-1 w-full">
              <StatsCarousel
                items={highlightItems}
                loading={highlightsLoading}
                className="w-full"
              />
            </div>
          </div>

          {/* Error display for minted */}
          {!mintedLoading && mintedError ? (
            <Alert
              variant="destructive"
              className="mx-6 mt-2 mb-0 bg-destructive/10 border-destructive/30"
            >
              <AlertDescription className="text-xs font-medium">
                {mintedError}
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Bottom controls row: Refresh + Filters */}
          <div className="flex items-center justify-end gap-3 p-4 bg-gradient-to-b from-background/50 to-background">
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
            {filtersControl ? (
              <div className="shrink-0">{filtersControl}</div>
            ) : null}
          </div>

          {/* Error display for highlights */}
          {highlightsError ? (
            <Alert
              variant="destructive"
              className="mx-6 mb-4 bg-destructive/10 border-destructive/30"
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
