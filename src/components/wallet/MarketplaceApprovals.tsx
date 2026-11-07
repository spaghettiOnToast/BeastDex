import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@starknet-react/core";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { MARKETPLACE_COLLECTIONS } from "../../services/marketplace/constants";
import { isMarketplaceApprovedForAll, revokeMarketplaceApprovalCall } from "../../services/marketplace/approvals";
import { executeMarketplaceCalls } from "../../services/marketplace/safety";
import { waitForTx } from "../../services/tx";

/** Collections the marketplace may hold blanket approval on. */
const COLLECTIONS = MARKETPLACE_COLLECTIONS;

/**
 * Wallet-menu section: which collections the marketplace can move tokens from
 * (Arcade needs `set_approval_for_all` to list), with a one-click revoke.
 * Renders nothing when there's no approval to show.
 */
export function MarketplaceApprovals() {
  const { account, address } = useAccount();
  const [approved, setApproved] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return setApproved([]);
    const results = await Promise.all(
      COLLECTIONS.map(async (c) => ((await isMarketplaceApprovedForAll(c.address, address).catch(() => false)) ? c.address : null)),
    );
    setApproved(results.filter((a): a is string => a !== null));
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!account || approved.length === 0) return null;

  const revoke = async (collection: string) => {
    setBusy(collection);
    setError(null);
    try {
      const res = await executeMarketplaceCalls(account, [revokeMarketplaceApprovalCall(collection)]);
      await waitForTx(res.transaction_hash);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/reject|cancel|abort/i.test(msg) ? "Cancelled in wallet." : "Couldn't revoke. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="px-2 py-1.5 space-y-1" onClick={(e) => e.stopPropagation()}>
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
        <ShieldCheck className="h-3 w-3" /> Marketplace access
      </p>
      {COLLECTIONS.filter((c) => approved.includes(c.address)).map((c) => (
        <div key={c.address} className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-zinc-300" title="The marketplace can transfer any of these you own (needed to list)">
            {c.name}: approved
          </span>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => revoke(c.address)}
            className="flex items-center gap-1 rounded border border-red-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            title="Withdraw approval. Your active listings stop being fillable until you list again."
          >
            <ShieldOff className="h-3 w-3" /> {busy === c.address ? "Revoking…" : "Revoke"}
          </button>
        </div>
      ))}
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}

export default MarketplaceApprovals;
