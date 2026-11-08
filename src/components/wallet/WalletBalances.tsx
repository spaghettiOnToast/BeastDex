import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import TokenIcon from "../ui/TokenIcon";
import { fetchWalletBalances, formatTokenAmount } from "../../services/tokens/walletBalances";

/** Token balances in the wallet menu (Loot Survivor's Assets list + SKULL). Zero balances are hidden. */
export function WalletBalances({ address }: { address: string }) {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["walletBalances", address.toLowerCase()],
    queryFn: () => fetchWalletBalances(address),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="px-2 pb-1.5 pt-1">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span>Balances</span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void refetch();
          }}
          className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
          title="Refresh balances"
          aria-label="Refresh balances"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>
      {isLoading ? (
        <div className="space-y-1.5 py-0.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-white/[0.05]" />
          ))}
        </div>
      ) : isError ? (
        <p className="py-1 text-zinc-500">Couldn&apos;t load balances.</p>
      ) : !data || data.length === 0 ? (
        <p className="py-1 text-zinc-500">No token balances.</p>
      ) : (
        <ul className="space-y-1">
          {data.map((b) => (
            <li key={b.address} className="flex items-center gap-2">
              <TokenIcon symbol={b.symbol} size="md" className="shrink-0 rounded-full" />
              <span className="font-medium text-zinc-200">{b.label ?? b.symbol}</span>
              <span className="ml-auto font-semibold tabular-nums text-[#fbcb4a]">
                {formatTokenAmount(b.raw, b.decimals, b.displayDecimals)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
