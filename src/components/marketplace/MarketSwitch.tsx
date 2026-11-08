import { cn } from "../../lib/utils";
import { ADVENTURER_MARKET_ENABLED } from "../../services/adventurers/constants";
import { useMarketKind, type MarketKind } from "../../hooks/useMarketKind";

/** Beasts / Adventurers switch at the top of the marketplace. */
export function MarketSwitch() {
  const [kind, setKind] = useMarketKind();
  if (!ADVENTURER_MARKET_ENABLED) return null;
  const options: Array<{ value: MarketKind; label: string; hint: string }> = [
    { value: "beasts", label: "Beasts", hint: "Collectable beast NFTs" },
    { value: "adventurers", label: "Adventurers", hint: "Loot Survivor games and tickets" },
  ];
  return (
    <div className="inline-flex gap-1 rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-1" role="tablist" aria-label="Market">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={kind === o.value}
          title={o.hint}
          onClick={() => kind !== o.value && setKind(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-semibold transition",
            kind === o.value ? "bg-gold/15 text-gold" : "text-zinc-400 hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
