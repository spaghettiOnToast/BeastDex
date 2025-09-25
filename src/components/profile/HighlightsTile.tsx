import type { Beast } from "../../services/beast";
import { Card, CardContent } from "../ui/card";
import { Separator } from "../ui/separator";

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
      label: "Last Killed",
      value: lastBeastKilledName ?? lastBeastKilled?.name ?? "Unknown",
      icon: "⚔️",
      bgGradient: "bg-gradient-to-br from-blue-500/15 to-cyan-500/5",
      borderColor: "border-blue-500/30",
      textColor: "text-blue-400",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Separator className="flex-1 opacity-50" />
      </div>

      <div className="grid gap-3 grid-cols-2">
        {cards.map((card) => (
          <Card
            key={card.key}
            className={`${card.bgGradient} ${card.borderColor} backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-md min-h-[120px] flex flex-col`}
          >
            <CardContent className="p-4 flex-1 flex flex-col">
              <div className="flex flex-col items-center text-center gap-1.5 mb-2 min-h-[20px]">
                <span className="text-sm flex-shrink-0">{card.icon}</span>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium truncate">
                  {card.label}
                </p>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <p
                  className={`text-sm font-bold ${card.textColor} text-center leading-tight break-words px-1`}
                  title={card.value}
                >
                  {card.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default HighlightsTile;
