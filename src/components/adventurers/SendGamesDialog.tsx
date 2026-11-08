import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@starknet-react/core";
import { CheckCircle2, Loader2, Send, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Alert, AlertDescription } from "../ui/alert";
import { checkRecipientInput } from "../../services/tokens/send";
import { lookupProfileAddresses } from "../../services/walletNames";
import { compareStarknetAddresses } from "../../utils/address";
import { isUserRejection } from "../../utils/transaction";
import { waitForTx } from "../../services/tx";
import { buildGameTransferCall, gameDungeonFor, gameStatus, type AdventurerGame } from "../../services/adventurers";
import { GameStatusBadge } from "./AdventurerCard";

type Props = {
  open: boolean;
  onClose: () => void;
  games: AdventurerGame[];
  onRemove?: (tokenId: string) => void;
  onSent?: () => void;
};

export function SendGamesDialog({ open, onClose, games, onRemove, onSent }: Props) {
  const { address, account } = useAccount();
  const [recipient, setRecipient] = useState("");
  const [resolved, setResolved] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const reset = useCallback(() => {
    setRecipient("");
    setResolved(null);
    setResolving(false);
    setSending(false);
    setError(null);
    setTxHash(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  // Resolve the recipient as the user types (addresses, Controller usernames, .brother names)
  useEffect(() => {
    const check = checkRecipientInput(recipient);
    setResolved(null);
    if (check.kind === "empty") return setError(null);
    if (check.kind === "invalid") return setError(check.message);
    if (check.kind === "address") {
      setError(null);
      return setResolved(check.address);
    }
    let alive = true;
    setResolving(true);
    const timer = setTimeout(async () => {
      try {
        const res = await lookupProfileAddresses([check.name]);
        if (!alive) return;
        const addr = res[check.name.toLowerCase()]?.[0] ?? null;
        setResolved(addr);
        setError(addr ? null : "Username not found.");
      } catch {
        if (alive) setError("Couldn't look up that name.");
      } finally {
        if (alive) setResolving(false);
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [recipient]);

  const toSelf = !!resolved && !!address && compareStarknetAddresses(resolved, address);

  const send = async () => {
    if (!account || !address || !resolved || games.length === 0 || toSelf) return;
    setSending(true);
    setError(null);
    try {
      const calls = games.map((g) => buildGameTransferCall(address, resolved, g.tokenId));
      const res = await account.execute(calls);
      const outcome = await waitForTx(res.transaction_hash);
      if (outcome === "reverted" || outcome === "rejected") throw new Error(`Transfer ${outcome}. Nothing was sent.`);
      setTxHash(res.transaction_hash);
      onSent?.();
    } catch (e) {
      setError(isUserRejection(e) ? null : (e as Error).message || "Transfer failed");
    } finally {
      setSending(false);
    }
  };

  const count = games.length;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="border border-white/[0.06] bg-surface-overlay">
        <DialogHeader>
          <DialogTitle className="text-gold">Send {count === 1 ? "Game" : `${count} Games`}</DialogTitle>
          <DialogDescription>
            Transfers the game NFT{count === 1 ? "" : "s"} to another Starknet wallet. The new owner can play
            {count === 1 ? " it" : " them"} on Loot Survivor straight away.
          </DialogDescription>
        </DialogHeader>

        {txHash ? (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="text-sm text-zinc-200">{count === 1 ? "Game" : `${count} games`} sent!</p>
            <a
              className="text-xs text-zinc-400 underline"
              href={`https://voyager.online/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View transaction
            </a>
            <Button className="w-full" onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {games.map((g) => {
                const d = gameDungeonFor(g.minterId);
                return (
                  <div key={g.tokenId} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-white/[0.04]">
                    <span className="h-2 w-2 rounded-full" style={{ background: d.accentColor }} />
                    <span className="flex-1 truncate font-medium text-zinc-200">
                      {d.name} · Lv {g.level}
                      <span className="ml-1 font-mono text-[10px] text-zinc-500">#{BigInt(g.tokenId).toString(16).slice(-6)}</span>
                    </span>
                    <GameStatusBadge status={gameStatus(g)} />
                    {onRemove && count > 1 && (
                      <button className="text-zinc-500 hover:text-white" onClick={() => onRemove(g.tokenId)} aria-label="Remove">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="send-game-recipient">Recipient</Label>
              <Input
                id="send-game-recipient"
                placeholder="0x… address, username or name.brother"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={sending}
              />
              {resolving && <p className="text-[11px] text-zinc-500">Looking up…</p>}
              {resolved && !resolving && (
                <p className="break-all font-mono text-[11px] text-zinc-400">→ {resolved}</p>
              )}
              {toSelf && <p className="text-[11px] text-amber-300">That's your own wallet.</p>}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <p className="text-[11px] text-zinc-500">
              Transfers can't be undone. Any live listing of these games stops working once they leave your wallet.
            </p>

            <Button
              className="w-full bg-gold/15 font-bold text-gold border border-gold hover:bg-gold/20"
              disabled={!resolved || resolving || sending || toSelf || count === 0}
              onClick={send}
            >
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {sending ? "Sending…" : `Send ${count === 1 ? "game" : `${count} games`}`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
