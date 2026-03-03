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
        <div
          key={card.key}
          className="relative overflow-hidden rounded-xl border-0 bg-gradient-to-br from-blue-500/30 to-purple-500/30 backdrop-blur-sm p-2 sm:p-3 transition-all duration-300 hover:scale-105"
        >
          <div className="flex flex-col items-center text-center">
            <div className="flex h-5 w-5 sm:h-7 sm:w-7 m-0.5 sm:m-1.5 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base sm:text-xl">
              {card.icon}
            </div>

            <p className="text-[9px] sm:text-xs uppercase tracking-wider text-zinc-400 font-medium leading-tight">
              {card.label}
            </p>
            <div className="m-0.5 sm:m-1">
              <div className="text-base sm:text-2xl font-bold text-white leading-tight">
                {card.value}
              </div>
              {card.sub ? (
                <div className="text-[9px] sm:text-xs text-zinc-500 font-medium leading-tight">
                  {card.sub}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
