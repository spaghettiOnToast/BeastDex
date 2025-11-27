import { Card, CardContent } from "../ui/card";

export type OverviewCard = {
  key: string;
  icon: string;
  label: string;
  value: string;
  sub?: string;
};

type OverviewCardsProps = {
  cards: OverviewCard[];
};

export function OverviewCards({ cards }: OverviewCardsProps) {
  return (
    <div className="grid gap-2 grid-cols-2">
      {cards.map((card) => (
        <Card
          key={card.key}
          className="relative overflow-hidden bg-gradient-to-br from-blue-500/30 to-purple-500/30 backdrop-blur-sm border-0 transition-all duration-300"
        >
          <CardContent className="px-1.5 sm:px-2 py-1 sm:py-2">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-4 w-4 sm:h-6 sm:w-6 m-0.5 sm:m-2 shrink-0 items-center justify-center rounded-md bg-primary/10 text-base sm:text-2xl">
                {card.icon}
              </div>

              <p className="text-[9px] sm:text-xs uppercase tracking-wider text-muted-foreground font-medium leading-tight">
                {card.label}
              </p>
              <div className="m-0.5 sm:m-1">
                <div className="text-base sm:text-2xl font-bold text-primary leading-tight">
                  {card.value}
                </div>
                {card.sub ? (
                  <div className="text-[9px] sm:text-xs text-gray-500 text-muted-foreground font-medium leading-tight">
                    {card.sub}
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
