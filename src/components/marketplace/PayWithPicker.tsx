import { useEffect, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import TokenSelect from "./TokenSelect";
import { useEkuboTokens } from "../../hooks/useEkuboTokens";
import { fromWei } from "../../utils/price";
import { cn } from "../../lib/utils";
import {
  MAX_PREMIUM,
  SLIPPAGE_OPTIONS_BP,
  WARN_PREMIUM,
  maxSpend,
  quoteExactOutput,
  sameToken,
  tokenKey,
  type PayWith,
} from "../../services/marketplace/swap";

/** An exact amount of a listing currency the purchase needs (price + client fee). */
export type PaymentNeed = { currency: string; amount: bigint };

type Props = {
  /** one entry per listing currency in the purchase */
  needs: PaymentNeed[];
  value: PayWith;
  onChange: (value: PayWith) => void;
  /** null = ready to buy; otherwise why the purchase can't go ahead yet */
  onBlockerChange: (blocker: string | null) => void;
  disabled?: boolean;
};

/**
 * "Pay with" token choice for a purchase. Every listing currency that differs
 * from the chosen token gets its own Ekubo quote and swap; the confirmed caps
 * are written into `value.caps`.
 */
export function PayWithPicker({ needs, value, onChange, onBlockerChange, disabled }: Props) {
  const { tokens } = useEkuboTokens();
  const info = (address: string) => {
    const t = tokens.find((x) => sameToken(x.address, address));
    return { symbol: t?.symbol ?? "TOKEN", decimals: t?.decimals ?? 18, usdPrice: t?.usdPrice ?? null };
  };
  const pay = info(value.token);

  const swaps = needs.filter((n) => n.amount > 0n && !sameToken(n.currency, value.token));
  const direct = needs.filter((n) => sameToken(n.currency, value.token));
  const swapping = swaps.length > 0;

  const quotes = useQueries({
    queries: swaps.map((n) => ({
      queryKey: ["swapQuote", value.token, n.currency, n.amount.toString()],
      queryFn: ({ signal }: { signal: AbortSignal }) => quoteExactOutput(value.token, n.currency, n.amount, signal),
      refetchInterval: 20_000,
      staleTime: 10_000,
      retry: 1,
    })),
  });

  const loading = quotes.some((q) => q.isLoading);
  const failed = quotes.find((q) => q.error);
  const ready = swapping && !loading && !failed && quotes.every((q) => q.data);
  const rows = swaps.map((n, i) => ({ need: n, quote: quotes[i]?.data }));
  const expected = rows.reduce((sum, r) => sum + (r.quote?.amountIn ?? 0n), 0n);
  const caps = useMemo(() => {
    const out: Record<string, bigint> = {};
    for (const r of rows) if (r.quote) out[tokenKey(r.need.currency)] = maxSpend(r.quote.amountIn, value.slippageBp);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => `${r.need.currency}:${r.quote?.amountIn}`).join(","), value.slippageBp]);
  const capTotal = Object.values(caps).reduce((a, b) => a + b, 0n);

  // Premium over market value across every swap (null if any price is unknown)
  const premium = useMemo(() => {
    if (!ready) return null;
    let usdIn = 0;
    let usdOut = 0;
    for (const r of rows) {
      const want = info(r.need.currency);
      if (!pay.usdPrice || !want.usdPrice || !r.quote) return null;
      usdIn += (Number(r.quote.amountIn) / 10 ** pay.decimals) * pay.usdPrice;
      usdOut += (Number(r.need.amount) / 10 ** want.decimals) * want.usdPrice;
    }
    return usdOut > 0 ? usdIn / usdOut - 1 : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, expected, tokens, value.token]);

  const blocker = !swapping
    ? null
    : loading
      ? "Getting a swap quote…"
      : failed
        ? (failed.error as Error).message
        : premium !== null && premium > MAX_PREMIUM
          ? `This swap costs ${(premium * 100).toFixed(1)}% more than market value (limit ${MAX_PREMIUM * 100}%). Pay in the listing's token instead.`
          : null;

  useEffect(() => {
    onBlockerChange(blocker);
  }, [blocker, onBlockerChange]);

  // Lock the confirmed caps into the purchase (it stops if a fresh quote needs more)
  const capsKey = Object.entries(caps)
    .map(([k, v]) => `${k}:${v}`)
    .sort()
    .join(",");
  const valueCapsKey = Object.entries(value.caps ?? {})
    .map(([k, v]) => `${k}:${v}`)
    .sort()
    .join(",");
  useEffect(() => {
    if (capsKey !== valueCapsKey) onChange({ ...value, caps });
  }, [capsKey, valueCapsKey, caps, value, onChange]);

  const fmt = (v: bigint, decimals: number) => {
    const n = Number.parseFloat(fromWei(v, decimals));
    return n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : 4 });
  };
  const fmtNeed = (n: PaymentNeed) => `${fmt(n.amount, info(n.currency).decimals)} ${info(n.currency).symbol}`;
  /** "$1.23" for an amount of a token, or "" without a price. */
  const usd = (v: bigint, token: string) => {
    const t = info(token);
    if (!t.usdPrice) return "";
    const dollars = (Number(v) / 10 ** t.decimals) * t.usdPrice;
    return `$${dollars < 0.01 ? dollars.toPrecision(2) : dollars.toFixed(2)}`;
  };
  const directTotal = direct.reduce((sum, n) => sum + n.amount, 0n);

  return (
    <div className="space-y-2 rounded-md border border-white/[0.06] bg-black/20 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-zinc-400">Pay with</span>
        <TokenSelect value={value.token} onValueChange={(token) => onChange({ ...value, token, caps: {} })} disabled={disabled} className="w-40" />
      </div>

      {!swapping && directTotal > 0n && (
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">You pay</span>
          <span className="text-right">
            <span className="font-semibold text-white">
              {fmt(directTotal, pay.decimals)} {pay.symbol}
            </span>
            {usd(directTotal, value.token) && <span className="ml-1.5 text-zinc-500">≈ {usd(directTotal, value.token)}</span>}
          </span>
        </div>
      )}

      {swapping && (
        <div className="space-y-1.5 text-xs">
          {loading ? (
            <p className="flex items-center gap-1.5 text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Getting a swap quote…
            </p>
          ) : ready ? (
            <>
              {(rows.length > 1 || direct.length > 0) && (
                <div className="space-y-0.5 text-zinc-500">
                  {rows.map((r) => (
                    <div key={r.need.currency} className="flex justify-between">
                      <span>{fmtNeed(r.need)}</span>
                      <span className="text-right">
                        ≈ {fmt(r.quote!.amountIn, pay.decimals)} {pay.symbol}
                        {usd(r.quote!.amountIn, value.token) && ` (${usd(r.quote!.amountIn, value.token)})`}
                      </span>
                    </div>
                  ))}
                  {direct.map((n) => (
                    <div key={n.currency} className="flex justify-between">
                      <span>{fmtNeed(n)}</span>
                      <span>paid directly{usd(n.amount, n.currency) && ` (${usd(n.amount, n.currency)})`}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-zinc-400">You spend about{direct.length > 0 ? " (swaps)" : ""}</span>
                <span className="text-right">
                  <span className="font-semibold text-white">
                    {fmt(expected, pay.decimals)} {pay.symbol}
                  </span>
                  {usd(expected, value.token) && <span className="ml-1.5 text-zinc-500">≈ {usd(expected, value.token)}</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">At most (with {value.slippageBp / 100}% slippage)</span>
                <span className="text-right text-zinc-300">
                  {fmt(capTotal, pay.decimals)} {pay.symbol}
                  {usd(capTotal, value.token) && <span className="ml-1.5 text-zinc-500">≈ {usd(capTotal, value.token)}</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Vs market value</span>
                {premium === null ? (
                  <span className="text-zinc-500">no price data</span>
                ) : (
                  <span className={cn(premium > MAX_PREMIUM ? "text-red-400" : premium > WARN_PREMIUM ? "text-amber-300" : "text-emerald-300")}>
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

          {blocker && !loading && <p className="text-red-300">{blocker}</p>}
          {!blocker && premium !== null && premium > WARN_PREMIUM && (
            <p className="text-amber-300">
              Liquidity is thin, so you pay noticeably more than market value. Paying in the listing's token directly is cheaper.
            </p>
          )}
          {!blocker && ready && premium === null && (
            <p className="text-amber-300">Couldn't value-check this swap (no USD price for one of the tokens). Check the amounts.</p>
          )}
          <p className="text-zinc-500">
            If the price moves past the maximum before your transaction lands, the purchase stops and nothing is spent.
          </p>
          <p className="flex items-start gap-1.5 text-zinc-500">
            <ArrowRightLeft className="mt-0.5 h-3 w-3 flex-shrink-0" />
            Swapped on Ekubo into exactly {swaps.map(fmtNeed).join(" + ")} in the same transaction as the purchase. Unused{" "}
            {pay.symbol} is refunded, and if the purchase fails the swap is undone.
          </p>
        </div>
      )}
    </div>
  );
}
