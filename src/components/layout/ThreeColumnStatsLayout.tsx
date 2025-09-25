import type { ReactNode } from "react";
import BeastCollectionTile from "../profile/BeastCollectionTile";
import HighlightsTile from "../profile/HighlightsTile";
import { OverviewCards, type OverviewCard } from "../account/OverviewCards";
import type { BeastCollectionStats } from "../../utils/beastCollection";

type ThreeColumnStatsLayoutProps = {
  collectionStats: BeastCollectionStats;
  overviewCards: OverviewCard[];
  totalInHeader?: boolean;
  renderHeaderTotal?: (stats: BeastCollectionStats) => ReactNode;
};

export function ThreeColumnStatsLayout({
  collectionStats,
  overviewCards,
  totalInHeader = false,
  renderHeaderTotal,
}: ThreeColumnStatsLayoutProps) {
  return (
    <>
      {/* Header Total - if needed */}
      {totalInHeader && renderHeaderTotal && renderHeaderTotal(collectionStats)}
      
      {/* Three Column Layout: Beast Collection | Overview Cards | Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
        {/* Left Column - Beast Collection (1/3 width) */}
        <div className="lg:col-span-1 h-fit">
          <BeastCollectionTile {...collectionStats} />
        </div>

        {/* Middle Column - Overview Cards (1/3 width) */}
        <div className="lg:col-span-1 h-fit">
          <OverviewCards cards={overviewCards} />
        </div>

        {/* Right Column - Highlights (1/3 width) */}
        <div className="lg:col-span-1 h-fit">
          <HighlightsTile {...collectionStats} />
        </div>
      </div>
    </>
  );
}