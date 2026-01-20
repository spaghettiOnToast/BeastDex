import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

type Props = {
  selected: number | "all";
  onSelect: (tier: number | "all") => void;
};

const tiers: (number | "all")[] = ["all", 1, 2, 3];

const tierColors: Record<number, string> = {
  1: "text-gray-300 border-gray-500",
  2: "text-blue-400 border-blue-600",
  3: "text-yellow-400 border-yellow-600",
};

export default function TierFilter({ selected, onSelect }: Props) {
  return (
    <div className="flex justify-center gap-3 mb-8">
      {tiers.map((tier) => {
        const isSelected = selected === tier;

        // Base tier styling
        const tierClass =
          tier === "all"
            ? "text-lsGold border-lsGold"
            : tierColors[tier as number];

        return (
          <Button
            key={tier}
            variant="outline"
            onClick={() => onSelect(tier)}
            className={cn(
              "px-4 py-2 font-ls transition border shadow-sm bg-black hover:bg-gray-900",
              tierClass,
              isSelected && "border-2 border-lsGreen shadow-[0_0_10px_#39ff14]"
            )}
          >
            {tier === "all" ? "All" : `Tier ${tier}`}
          </Button>
        );
      })}
    </div>
  );
}
