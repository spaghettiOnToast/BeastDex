import { useSearchParams } from "react-router-dom";
import { ADVENTURER_MARKET_ENABLED } from "../services/adventurers/constants";

export type MarketKind = "beasts" | "adventurers";

/** Which market `?market=` selects (Beasts unless the Adventurers market is on and chosen). */
export function useMarketKind(): [MarketKind, (kind: MarketKind) => void] {
  const [params, setParams] = useSearchParams();
  const kind: MarketKind = ADVENTURER_MARKET_ENABLED && params.get("market") === "adventurers" ? "adventurers" : "beasts";
  const set = (next: MarketKind) =>
    setParams(
      (p) => {
        const out = new URLSearchParams();
        if (next === "adventurers") out.set("market", "adventurers");
        // keep unrelated params only when staying in the same market
        if (next === kind) p.forEach((v, k) => k !== "market" && out.set(k, v));
        return out;
      },
      { replace: false },
    );
  return [kind, set];
}
