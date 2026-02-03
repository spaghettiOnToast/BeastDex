type Props = {
  owned: number;
  total: number;
  loading?: boolean;
  align?: "left" | "center";
  className?: string;
  uniqueOwners?: number;
};

export default function CompletionTracker({
  owned,
  total,
  loading = false,
  align = "center",
  className = "",
  uniqueOwners,
}: Props) {
  const safeTotal = total > 0 ? total : 0;
  const safeOwned = Math.max(0, Math.min(owned, safeTotal || owned));
  const remaining = Math.max(safeTotal - safeOwned, 0);
  const progress = safeTotal > 0 ? (safeOwned / safeTotal) * 100 : 0;
  const isLeftAligned = align === "left";

  return (
    <div
      className={`${isLeftAligned ? "text-left" : "text-center"} mb-4 sm:mb-8 ${className}`.trim()}
    >
      <p className="text-sm sm:text-lg font-medium font-gothic tracking-wide">
        <span className="font-bold text-neon">{safeOwned.toLocaleString()}</span> /
        {` ${safeTotal.toLocaleString()} beasts collected`}
      </p>
      <div
        className={`w-48 sm:w-64 h-3 sm:h-4 border border-lsGold bg-black/40 rounded-full mt-1 sm:mt-2 overflow-hidden ${
          isLeftAligned ? "" : "mx-auto"
        }`}
      >
        <div
          className="h-full bg-[#39ff14] shadow-[0_0_10px_#39ff14] transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-400">
        {loading
          ? "Loading minted beasts..."
          : `${remaining.toLocaleString()} beasts remaining`}
      </p>
      {typeof uniqueOwners === "number" && (
        <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">
          {uniqueOwners.toLocaleString()} unique owners
        </p>
      )}
    </div>
  );
}
