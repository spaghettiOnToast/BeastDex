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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className="relative overflow-hidden rounded-xl border border-lsGold/30 px-3 py-2 min-w-[160px]"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-lg">
              {card.icon}
            </span>

            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">
                {card.label}
              </p>
              <div className="flex items-baseline gap-2">
                <p className="text-lg font-semibold text-[#f5d97c] md:text-xl">
                  {card.value}
                </p>
                {card.sub ? (
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">
                    {card.sub}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
