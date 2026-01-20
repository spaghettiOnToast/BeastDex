import { memo, useMemo } from "react";
import { Grid } from "react-window";
import type { Beast } from "../../services/beast";
import BeastCard from "./BeastCard";
import { normaliseStarknetAddress } from "../../utils/address";

type VirtualizedBeastGridProps = {
  beasts: Beast[];
  ownerUsernames: Record<string, string | undefined>;
  onSelect: (beast: Beast) => void;
  loading?: boolean;
  emptyMessage?: string;
  loadingMessage?: string;
  containerWidth?: number;
  containerHeight?: number;
};

const CARD_WIDTH = 224; // 56 * 4 (14rem)
const CARD_HEIGHT = 360; // Approximate height including spacing
const GAP = 32; // 8rem gap between cards

interface GridCellProps {
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
  data: {
    beasts: Beast[];
    ownerUsernames: Record<string, string | undefined>;
    onSelect: (beast: Beast) => void;
    columnsPerRow: number;
  };
}

const Cell = memo(function Cell({ columnIndex, rowIndex, style, data }: GridCellProps) {
  const { beasts, ownerUsernames, onSelect, columnsPerRow } = data;
  const itemIndex = rowIndex * columnsPerRow + columnIndex;
  const beast = beasts[itemIndex];

  if (!beast) {
    return <div style={style} />;
  }

  const normalizedOwner = beast.owner ? normaliseStarknetAddress(beast.owner) : null;

  return (
    <div
      style={{
        ...style,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: GAP / 2,
      }}
    >
      <BeastCard
        beast={beast}
        owned={!!beast.owner}
        ownerUsername={
          normalizedOwner ? ownerUsernames[normalizedOwner] ?? null : null
        }
        onSelect={onSelect}
      />
    </div>
  );
});

export const VirtualizedBeastGrid = memo(function VirtualizedBeastGrid({
  beasts,
  ownerUsernames,
  onSelect,
  loading = false,
  emptyMessage = "No beasts found.",
  loadingMessage = "Loading beasts...",
  containerWidth = 1200,
  containerHeight = 600,
}: VirtualizedBeastGridProps) {
  const gridData = useMemo(() => {
    const columnsPerRow = Math.max(1, Math.floor((containerWidth - GAP) / (CARD_WIDTH + GAP)));
    const rowCount = Math.ceil(beasts.length / columnsPerRow);

    return {
      beasts,
      ownerUsernames,
      onSelect,
      columnsPerRow,
      rowCount,
      columnWidth: Math.floor(containerWidth / columnsPerRow),
    };
  }, [beasts, ownerUsernames, onSelect, containerWidth]);

  if (loading && beasts.length === 0) {
    return (
      <div className="flex justify-center py-10 text-sm text-gray-400">
        {loadingMessage}
      </div>
    );
  }

  if (!loading && beasts.length === 0) {
    return (
      <p className="col-span-full text-center text-lsGold font-roboto">
        {emptyMessage}
      </p>
    );
  }

  // For small lists, use regular grid to avoid virtualization overhead
  if (beasts.length <= 50) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 justify-items-center">
        {beasts.map((beast) => {
          const normalizedOwner = beast.owner ? normaliseStarknetAddress(beast.owner) : null;
          return (
            <BeastCard
              key={beast.id}
              beast={beast}
              owned={!!beast.owner}
              ownerUsername={
                normalizedOwner
                  ? ownerUsernames[normalizedOwner] ?? null
                  : null
              }
              onSelect={onSelect}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-full">
      <Grid
        cellComponent={Cell as any}
        cellProps={gridData}
        columnCount={gridData.columnsPerRow}
        columnWidth={gridData.columnWidth}
        defaultHeight={containerHeight}
        defaultWidth={containerWidth}
        rowCount={gridData.rowCount}
        rowHeight={CARD_HEIGHT}
        style={{ height: containerHeight, width: containerWidth }}
      />
    </div>
  );
});

export default VirtualizedBeastGrid;