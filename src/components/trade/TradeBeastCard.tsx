import type { Beast } from "../../services/beast";
import { Badge } from "../ui/badge";

type TradeBeastCardProps = {
  beast: Beast;
  compact?: boolean;
};

export function TradeBeastCard({ beast, compact = false }: TradeBeastCardProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 p-2 bg-muted rounded border">
        <div className="w-12 h-12 rounded overflow-hidden bg-background flex-shrink-0">
          {beast.image && (
            <img
              src={beast.image}
              alt={beast.name}
              className="w-full h-full object-cover"
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{beast.name}</p>
          <p className="text-xs text-muted-foreground">#{beast.numericId || beast.id}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-muted rounded-lg border">
      <div className="aspect-square rounded overflow-hidden bg-background mb-2">
        {beast.image && (
          <img
            src={beast.image}
            alt={beast.name}
            className="w-full h-full object-cover"
          />
        )}
      </div>
      <div>
        <p className="font-medium truncate">{beast.name}</p>
        <p className="text-sm text-muted-foreground">#{beast.numericId || beast.id}</p>
        {beast.tier && (
          <Badge variant="outline" className="mt-1">
            Tier {beast.tier}
          </Badge>
        )}
      </div>
    </div>
  );
}
