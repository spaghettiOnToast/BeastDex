import { useEffect, useState } from "react";
import { useConnect, type Connector } from "@starknet-react/core";
import { ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { controllerConnector } from "../../wallet/controller";
import { WALLET_INSTALL_URLS, connectorIconSrc, walletName } from "../../wallet/connectors";
import controllerIcon from "../../assets/cartridge-icon.svg";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a wallet connects successfully. */
  onConnected?: (connector: Connector) => void;
};

export function WalletConnectDialog({ open, onOpenChange, onConnected }: Props) {
  const { connectors, connectAsync } = useConnect();
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const next: Record<string, boolean> = {};
    for (const c of connectors) {
      try {
        next[c.id] = c.available();
      } catch {
        next[c.id] = false;
      }
    }
    setAvailable(next);
  }, [open, connectors]);

  const connect = async (connector: Connector) => {
    setPending(connector.id);
    setError(null);
    try {
      await connectAsync({ connector });
      onOpenChange(false);
      onConnected?.(connector);
    } catch (err) {
      console.error(`Failed to connect ${connector.id}`, err);
      setError(err instanceof Error ? err.message : "Couldn't connect. Try again.");
    } finally {
      setPending(null);
    }
  };

  const controller = connectors.find((c) => c.id === controllerConnector.id);
  const injected = connectors.filter((c) => c.id !== controllerConnector.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-surface-overlay border-white/[0.06]">
        <DialogHeader>
          <DialogTitle className="text-gold">Connect wallet</DialogTitle>
          <DialogDescription className="text-zinc-400">Choose how you want to sign in.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {controller && (
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => connect(controller)}
              className="w-full flex items-center gap-3 rounded-lg border border-gold/30 bg-gold/[0.06] px-3 py-3 text-left transition-colors hover:border-gold/60 hover:bg-gold/[0.10] disabled:opacity-60"
            >
              <img src={controllerIcon} alt="" className="h-8 w-8 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-100">Cartridge Controller</p>
                <p className="text-[11px] text-zinc-400">
                  Passkey, Google, Discord, password, or an EVM wallet (MetaMask, Rabby, WalletConnect)
                </p>
              </div>
              {pending === controller.id && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />
              )}
            </button>
          )}

          {injected.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Starknet wallets</p>
              {injected.map((c) => {
                const isAvailable = available[c.id] ?? false;
                const installUrl = WALLET_INSTALL_URLS[c.id];
                const icon = connectorIconSrc(c);
                const name = walletName(c);
                const row = (
                  <>
                    {icon ? (
                      <img src={icon} alt="" className="h-7 w-7 flex-shrink-0 rounded" />
                    ) : (
                      <span className="h-7 w-7 flex-shrink-0 rounded bg-white/10" />
                    )}
                    <span className="flex-1 text-sm font-medium text-zinc-100">{name}</span>
                    {pending === c.id ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                    ) : !isAvailable ? (
                      <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                        Install <ExternalLink className="h-3 w-3" />
                      </span>
                    ) : null}
                  </>
                );
                const cls =
                  "w-full flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-60";
                return isAvailable || !installUrl ? (
                  <button
                    key={c.id}
                    type="button"
                    disabled={pending !== null || !isAvailable}
                    onClick={() => connect(c)}
                    className={cls}
                  >
                    {row}
                  </button>
                ) : (
                  <a key={c.id} href={installUrl} target="_blank" rel="noopener noreferrer" className={cls}>
                    {row}
                  </a>
                );
              })}
            </div>
          )}

          <p className="text-[10px] leading-relaxed text-zinc-500">
            Prefer to hold your own keys? Ready X and Braavos are self-custody browser wallets. Signing in to
            Controller with MetaMask, Rabby or WalletConnect also keeps signing with your own wallet.
          </p>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default WalletConnectDialog;
