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
    <div className="flex justify-center">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card
          key={card.key}
          className="relative overflow-hidden bg-gradient-to-br from-blue-500/30 to-purple-500/30 backdrop-blur-sm border-0 transition-all duration-300"
        >
          <CardContent className="px-6 py-4">
            <div className="flex flex-col items-center text-center space-y-1">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-2xl">
                {card.icon}
              </div>

              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {card.label}
                </p>
                <div className="space-y-1">
                  <p className="text-2xl font-bold text-primary leading-tight">
                    {card.value}
                  </p>
                  {card.sub ? (
                    <p className="text-sm text-muted-foreground font-medium leading-tight">
                      {card.sub}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      </div>
    </div>
  );
}
