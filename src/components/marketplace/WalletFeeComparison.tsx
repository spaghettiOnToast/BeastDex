import { useQuery } from "@tanstack/react-query";
import { useAccount } from "@starknet-react/core";
import { Fuel } from "lucide-react";
import { cn } from "../../lib/utils";
import { controllerConnector } from "../../wallet/controller";
import { useSelectedToken } from "../../hooks/useEkuboTokens";
import { STRK_ADDRESS } from "../../services/tokens/send";
import {
  FEES_MEASURED_ON,
  WALLET_LABELS,
  estimateFeeFri,
  fetchGasPrices,
  profileForConnector,
  type ActionCounts,
  type WalletProfile,
} from "../../services/gas/walletFees";

const ROWS: WalletProfile[] = ["ready", "braavos", "controller", "controllerFirstSocial", "controllerFirstPasskey"];

/**
 * Estimated network fee of this transaction with each wallet (Ready X,
 * Braavos, Controller), from measured gas × the current gas price.
 */
export function WalletFeeComparison({ actions, className }: { actions: ActionCounts; className?: string }) {
  const { connector } = useAccount();
  const mine = profileForConnector(connector?.id, controllerConnector.id);
  const { usdPrice } = useSelectedToken(STRK_ADDRESS);
  const prices = useQuery({ queryKey: ["gasPrices"], queryFn: fetchGasPrices, staleTime: 60_000, refetchInterval: 120_000 });

  if (!prices.data || prices.data.l2Fri === 0n) return null;
  const fees = ROWS.map((w) => ({ w, fri: estimateFeeFri(actions, w, prices.data) }));
  const strk = (fri: bigint) => Number(fri) / 1e18;
  const fmt = (fri: bigint) => {
    const s = strk(fri);
    const usd = usdPrice ? ` ≈ $${(s * usdPrice < 0.01 ? (s * usdPrice).toPrecision(2) : (s * usdPrice).toFixed(2))}` : "";
    return { strk: `${s < 0.01 ? s.toPrecision(2) : s.toFixed(3)} STRK`, usd };
  };
  const cheapest = fees.reduce((a, b) => (b.fri < a.fri ? b : a));
  const yours = mine ? fees.find((f) => f.w === mine) : undefined;
  const ratio = yours && yours.w !== cheapest.w ? strk(yours.fri) / strk(cheapest.fri) : null;

  return (
    <details className={cn("group rounded-md border border-white/[0.06] bg-black/20 text-xs", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-2 text-zinc-400 hover:text-zinc-200">
        <Fuel className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="flex-1">
          Network fee ≈ {fmt(yours?.fri ?? cheapest.fri).strk}
          {yours ? ` with ${WALLET_LABELS[yours.w]}` : ` with ${WALLET_LABELS[cheapest.w]}`}
          {ratio && ratio > 1.15 && (
            <span className="text-amber-300">
              {" "}
              · {ratio.toFixed(1)}× {WALLET_LABELS[cheapest.w]}
            </span>
          )}
        </span>
        <span className="text-[10px] text-zinc-500 group-open:hidden">compare wallets ▾</span>
      </summary>
      <div className="space-y-1 border-t border-white/[0.06] px-2.5 py-2">
        {fees.map(({ w, fri }) => {
          const f = fmt(fri);
          return (
            <div key={w} className={cn("flex justify-between gap-2", w === cheapest.w ? "text-emerald-300" : "text-zinc-300")}>
              <span>
                {WALLET_LABELS[w]}
                {w === mine && <span className="ml-1 rounded bg-white/10 px-1 text-[9px] text-zinc-300">you</span>}
                {w === cheapest.w && <span className="ml-1 text-[9px]">cheapest</span>}
              </span>
              <span className="text-right">
                {f.strk}
                <span className="ml-1 text-zinc-500">{f.usd}</span>
              </span>
            </div>
          );
        })}
        <p className="pt-1 text-[10px] leading-snug text-zinc-500">
          Estimates: gas measured from mainnet transactions ({FEES_MEASURED_ON}) × the current gas price. Controller checks your
          sign-in on-chain on the first transaction after each login (much dearer with a passkey), then reuses it.
        </p>
      </div>
    </details>
  );
}
