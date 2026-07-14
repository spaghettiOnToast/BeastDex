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
  const hasOverviewCards = overviewCards.length > 0;

  return (
    <>
      {/* Header Total - if needed */}
      {totalInHeader && renderHeaderTotal && renderHeaderTotal(collectionStats)}

      {hasOverviewCards ? (
        /* Three Column Layout: Beast Collection | Overview Cards | Highlights */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 items-center">
          <div className="lg:col-span-1 h-fit">
            <BeastCollectionTile {...collectionStats} />
          </div>
          <div className="lg:col-span-1 h-fit">
            <OverviewCards cards={overviewCards} />
          </div>
          <div className="lg:col-span-1 h-fit">
            <HighlightsTile {...collectionStats} />
          </div>
        </div>
      ) : (
        /* Two Column Layout: Beast Collection | Highlights */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch">
          <div>
            <BeastCollectionTile {...collectionStats} />
          </div>
          <div>
            <HighlightsTile {...collectionStats} />
          </div>
        </div>
      )}
    </>
  );
}