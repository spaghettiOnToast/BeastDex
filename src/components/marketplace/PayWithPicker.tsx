import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import TokenSelect from "./TokenSelect";
import { useSelectedToken } from "../../hooks/useEkuboTokens";
import { fromWei } from "../../utils/price";
import { cn } from "../../lib/utils";
import {
  MAX_PREMIUM,
  SLIPPAGE_OPTIONS_BP,
  WARN_PREMIUM,
  maxSpend,
  quoteExactOutput,
  sameToken,
  swapPremium,
  type PayWith,
} from "../../services/marketplace/swap";

type Props = {
  /** token the listing is priced in */
  currency: string;
  /** exact amount of `currency` the purchase needs (price + client fee) */
  amountOut: bigint;
  value: PayWith;
  onChange: (value: PayWith) => void;
  /** null = ready to buy; otherwise why the purchase can't go ahead yet */
  onBlockerChange: (blocker: string | null) => void;
  disabled?: boolean;
};

/** "Pay with" token choice for a purchase, with a live Ekubo swap quote when it differs from the listing token. */
export function PayWithPicker({ currency, amountOut, value, onChange, onBlockerChange, disabled }: Props) {
  const swapping = !sameToken(value.token, currency);
  const pay = useSelectedToken(value.token);
  const want = useSelectedToken(currency);

  const quote = useQuery({
    queryKey: ["swapQuote", value.token, currency, amountOut.toString()],
    enabled: swapping && amountOut > 0n,
    queryFn: ({ signal }) => quoteExactOutput(value.token, currency, amountOut, signal),
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: 1,
  });

  const premium = quote.data ? swapPremium(quote.data, pay, want) : null;
  const maxIn = quote.data ? maxSpend(quote.data.amountIn, value.slippageBp) : undefined;
  const blocker = !swapping
    ? null
    : quote.isLoading
      ? "Getting a swap quote…"
      : quote.error
        ? (quote.error as Error).message
        : premium !== null && premium > MAX_PREMIUM
          ? `This swap costs ${(premium * 100).toFixed(1)}% more than market value (limit ${MAX_PREMIUM * 100}%). Pay in ${want.symbol} instead.`
          : null;

  useEffect(() => {
    onBlockerChange(blocker);
  }, [blocker, onBlockerChange]);

  // Lock the confirmed maximum into the purchase (it stops if a fresh quote needs more)
  const maxInKey = maxIn?.toString();
  useEffect(() => {
    if (swapping && maxInKey && value.maxIn?.toString() !== maxInKey) onChange({ ...value, maxIn: BigInt(maxInKey) });
  }, [swapping, maxInKey, value, onChange]);

  const fmt = (v: bigint, decimals: number) => {
    const n = Number.parseFloat(fromWei(v, decimals));
    return n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : 4 });
  };

  return (
    <div className="space-y-2 rounded-md border border-white/[0.06] bg-black/20 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-zinc-400">Pay with</span>
        <TokenSelect
          value={value.token}
          onValueChange={(token) => onChange({ ...value, token })}
          disabled={disabled}
          className="w-40"
        />
      </div>

      {swapping && (
        <div className="space-y-1.5 text-xs">
          {quote.isLoading ? (
            <p className="flex items-center gap-1.5 text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Getting a swap quote…
            </p>
          ) : quote.data ? (
            <>
              <div className="flex justify-between">
                <span className="text-zinc-400">You spend about</span>
                <span className="font-semibold text-white">
                  {fmt(quote.data.amountIn, pay.decimals)} {pay.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">At most (with {value.slippageBp / 100}% slippage)</span>
                <span className="text-zinc-300">
                  {fmt(maxIn!, pay.decimals)} {pay.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Vs market value</span>
                {premium === null ? (
                  <span className="text-zinc-500">no price data</span>
                ) : (
                  <span
                    className={cn(
                      premium > MAX_PREMIUM ? "text-red-400" : premium > WARN_PREMIUM ? "text-amber-300" : "text-emerald-300",
                    )}
                  >
                    {premium >= 0 ? `+${(premium * 100).toFixed(2)}%` : `${(premium * 100).toFixed(2)}% (below market)`}
                  </span>
                )}
              </div>
            </>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-400">Slippage</span>
            <div className="flex gap-1">
              {SLIPPAGE_OPTIONS_BP.map((bp) => (
                <button
                  key={bp}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...value, slippageBp: bp })}
                  className={cn(
                    "rounded border px-1.5 py-0.5",
                    value.slippageBp === bp ? "border-gold/60 bg-gold/10 text-gold" : "border-white/10 text-zinc-400 hover:text-white",
                  )}
                >
                  {bp / 100}%
                </button>
              ))}
            </div>
          </div>

          {blocker && !quote.isLoading && <p className="text-red-300">{blocker}</p>}
          {!blocker && premium !== null && premium > WARN_PREMIUM && (
            <p className="text-amber-300">
              Liquidity for this pair is thin, so you pay noticeably more than market value. Paying in {want.symbol} directly is
              cheaper.
            </p>
          )}
          {!blocker && quote.data && premium === null && (
            <p className="text-amber-300">Couldn't value-check this swap (no USD price for one of the tokens). Check the amounts.</p>
          )}
          <p className="text-zinc-500">
            If the price moves past the maximum before your transaction lands, the purchase stops and nothing is spent.
          </p>
          <p className="flex items-start gap-1.5 text-zinc-500">
            <ArrowRightLeft className="mt-0.5 h-3 w-3 flex-shrink-0" />
            Swapped on Ekubo into exactly {fmt(amountOut, want.decimals)} {want.symbol} in the same transaction as the purchase.
            Unused {pay.symbol} is refunded, and if the purchase fails the swap is undone.
          </p>
        </div>
      )}
    </div>
  );
}
