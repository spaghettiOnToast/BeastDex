import type { Beast } from "../../services/beast";

type HighlightsTileProps = {
  mostPowerful?: Beast | null;
  rarest?: Beast | null;
  highestRanked?: Beast | null;
  lastBeastKilled?: Beast | null;
  lastBeastKilledName?: string | null;
};

export function HighlightsTile({
  mostPowerful,
  rarest,
  highestRanked,
  lastBeastKilled,
  lastBeastKilledName,
}: HighlightsTileProps) {
  const cards = [
    {
      key: "mostPowerful",
      label: "Most Powerful",
      value: mostPowerful ? mostPowerful.name : "Unknown",
      icon: "💪",
      bgGradient: "bg-gradient-to-br from-red-500/15 to-orange-500/5",
      borderColor: "border-red-500/30",
      textColor: "text-red-400",
    },
    {
      key: "rarest",
      label: "Rarest",
      value: rarest ? rarest.name : "Unknown",
      icon: "💎",
      bgGradient: "bg-gradient-to-br from-purple-500/15 to-pink-500/5",
      borderColor: "border-purple-500/30",
      textColor: "text-purple-400",
    },
    {
      key: "highestRanked",
      label: "Highest Rank",
      value: highestRanked ? highestRanked.name : "Unknown",
      icon: "👑",
      bgGradient: "bg-gradient-to-br from-yellow-500/15 to-amber-500/5",
      borderColor: "border-yellow-500/30",
      textColor: "text-yellow-400",
    },
    {
      key: "lastBeastKilled",
      label: "Last Collected",
      value: lastBeastKilledName ?? lastBeastKilled?.name ?? "Unknown",
      icon: "⚔️",
      bgGradient: "bg-gradient-to-br from-blue-500/15 to-cyan-500/5",
      borderColor: "border-blue-500/30",
      textColor: "text-sky-400",
    },
  ];

  return (
    <div className="h-full">
      <div className="grid gap-2 sm:gap-3 grid-cols-2 h-full auto-rows-fr">
        {cards.map((card) => (
          <div
            key={card.key}
            className={`relative overflow-hidden rounded-xl border ${card.borderColor} ${card.bgGradient} backdrop-blur-sm p-2 sm:p-4 transition-all duration-300 hover:scale-105 hover:shadow-md min-h-[80px] sm:min-h-[100px] flex flex-col`}
          >
            <div className="flex flex-col items-center text-center gap-0.5 sm:gap-1 mb-1 sm:mb-2">
              <span className="text-xs sm:text-sm">{card.icon}</span>
              <p className="text-[9px] sm:text-xs uppercase tracking-wider text-zinc-400 font-medium leading-tight">
                {card.label}
              </p>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <p
                className={`text-[11px] sm:text-sm font-bold ${card.textColor} text-center leading-tight break-words px-1`}
                title={card.value}
              >
                {card.value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default HighlightsTile;
