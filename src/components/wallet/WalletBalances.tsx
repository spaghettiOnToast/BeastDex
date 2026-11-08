import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import TokenIcon from "../ui/TokenIcon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { fetchWalletBalances, formatTokenAmount } from "../../services/tokens/walletBalances";

type Props = {
  address: string;
  /** Open the send dialog with this token preselected. */
  onSend?: (tokenAddress: string) => void;
  /** Open the receive dialog. */
  onReceive?: () => void;
};

/** Token balances in the wallet menu (Loot Survivor's Assets list + SKULL). Zero balances are hidden. */
export function WalletBalances({ address, onSend, onReceive }: Props) {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["walletBalances", address.toLowerCase()],
    queryFn: () => fetchWalletBalances(address),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return (
    <TooltipProvider delayDuration={150}>
      <div className="px-2 pb-1.5 pt-1">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
          <span>Balances</span>
          <div className="flex items-center gap-0.5">
            {onReceive && (
              <IconButton label="Receive" onClick={onReceive}>
                <ArrowDownLeft className="h-3.5 w-3.5" />
              </IconButton>
            )}
            <IconButton label="Refresh balances" onClick={() => void refetch()}>
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            </IconButton>
          </div>
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
          <ul className="space-y-0.5">
            {data.map((b) => (
              <li key={b.address} className="group flex items-center gap-2 rounded px-0.5 py-0.5 hover:bg-white/[0.03]">
                <TokenIcon symbol={b.symbol} size="md" className="shrink-0 rounded-full" />
                <span className="font-medium text-zinc-200">{b.label ?? b.symbol}</span>
                <span className="ml-auto font-semibold tabular-nums text-[#fbcb4a]">
                  {formatTokenAmount(b.raw, b.decimals, b.displayDecimals)}
                </span>
                {onSend && (
                  <IconButton label={`Send ${b.label ?? b.symbol}`} onClick={() => onSend(b.address)}>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </TooltipProvider>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
          }}
          className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-zinc-100 focus-visible:text-zinc-100"
          aria-label={label}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-zinc-800 px-2 py-1 text-[11px] text-zinc-100">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
