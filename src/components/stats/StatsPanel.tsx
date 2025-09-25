import { type ReactNode } from "react";
import CompletionTracker from "../CompletionTracker";
import StatsCarousel from "../StatsCarousel";
import { TOTAL_BEAST_SUPPLY } from "../../services/beast";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Alert, AlertDescription } from "../ui/alert";
import { Separator } from "../ui/separator";
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
        <div className="flex flex-col">
          {/* Top section with gradient background */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-2">
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
                  <Alert variant="destructive" className="py-1.5 px-3 bg-destructive/10 border-destructive/30">
                    <AlertDescription className="text-xs font-medium">{mintedError}</AlertDescription>
                  </Alert>
                ) : null}
              </div>

              <Button
                onClick={onRefresh}
                disabled={refreshing}
                variant="ghost"
                size="default"
                className="hover:bg-primary/10 font-semibold"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>

          <Separator className="opacity-50" />

          {/* Bottom section with carousel and filters */}
          <div className="p-6 bg-gradient-to-b from-background/50 to-background">
            <div className="flex items-center gap-4">
              <div className="flex-1 overflow-hidden">
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
              <Alert variant="destructive" className="mt-4 bg-destructive/10 border-destructive/30">
                <AlertDescription className="font-medium">{highlightsError}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default StatsPanel;
