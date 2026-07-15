import { useState, useCallback, useEffect } from "react";
import { useAccount } from "@starknet-react/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Alert, AlertDescription } from "../ui/alert";
import { Send, Loader2, CheckCircle2, X } from "lucide-react";
import { lookupControllerAddresses } from "../../services/controller";
import { normaliseStarknetAddress } from "../../utils/address";
import BeastCard from "./BeastCard";
import { CONTRACT_ADDRESS } from "../../services/beast/constants";
import type { Beast } from "../../services/beast";

type SendBeastsDialogProps = {
  open: boolean;
  onClose: () => void;
  beasts: Beast[];
  onRemoveBeast?: (beastId: string) => void;
  onSent?: () => void;
};

export function SendBeastsDialog({
  open,
  onClose,
  beasts,
  onRemoveBeast,
  onSent,
}: SendBeastsDialogProps) {
  const { address: connectedAddress, account } = useAccount();

  const [recipient, setRecipient] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setRecipient("");
    setResolvedAddress(null);
    setError(null);
    setSuccess(false);
    setTxHash(null);
    setIsResolving(false);
    setIsLoading(false);
    onClose();
  }, [onClose]);

  const resolveRecipient = useCallback(async (input: string): Promise<string | null> => {
    const trimmed = input.trim();

    const normalized = normaliseStarknetAddress(trimmed);
    if (normalized && normalized.startsWith("0x") && normalized.length > 10) {
      return normalized;
    }

    try {
      const result = await lookupControllerAddresses([trimmed]);
      const normalizedKey = trimmed.toLowerCase();
      const addresses = result[normalizedKey] ?? [];
      if (addresses.length > 0) {
        return addresses[0];
      }
    } catch (err) {
      console.error("Failed to resolve username:", err);
    }

    return null;
  }, []);

  // Live address resolution as user types
  useEffect(() => {
    if (!recipient.trim()) {
      setResolvedAddress(null);
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsResolving(true);
      setError(null);

      try {
        const resolved = await resolveRecipient(recipient);
        setResolvedAddress(resolved);
        if (!resolved) {
          setError("Invalid address or username not found");
        }
      } catch (err) {
        console.error("Resolution error:", err);
        setResolvedAddress(null);
        setError("Failed to resolve address");
      } finally {
        setIsResolving(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [recipient, resolveRecipient]);

  const handleSend = useCallback(async () => {
    if (!connectedAddress || !account) {
      setError("Please connect your wallet first");
      return;
    }

    if (!recipient.trim()) {
      setError("Please enter a recipient address or username");
      return;
    }

    if (!resolvedAddress) {
      setError("Invalid address or username not found");
      return;
    }

    if (beasts.length === 0) {
      setError("No beasts selected");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Build multicall with one transfer_from per beast
      const calls = beasts.map((beast) => {
        const rawId = beast.numericId ?? beast.id.split(":").pop() ?? beast.id;
        const tokenIdBigInt = BigInt(rawId);
        const low = tokenIdBigInt & BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
        const high = tokenIdBigInt >> BigInt(128);

        return {
          contractAddress: CONTRACT_ADDRESS,
          entrypoint: "transfer_from",
          calldata: [
            connectedAddress,
            resolvedAddress,
            low.toString(),
            high.toString(),
          ],
        };
      });

      const result = await account.execute(calls);

      if (result?.transaction_hash) {
        setTxHash(result.transaction_hash);
        setSuccess(true);
        onSent?.();
      } else {
        throw new Error("Transaction failed");
      }
    } catch (err: any) {
      console.error("Transfer failed:", err);
      setError(err?.message || "Failed to send beasts. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [connectedAddress, account, resolvedAddress, beasts, onSent]);

  const count = beasts.length;
  const label = count === 1 ? beasts[0].name : `${count} Beast${count > 1 ? "s" : ""}`;

  const dialogClasses = "sm:max-w-md bg-[#111113] border border-white/[0.06] shadow-2xl";

  if (!connectedAddress) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent className={dialogClasses}>
          <DialogHeader>
            <DialogTitle className="text-gold">Send Beasts</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Connect your wallet to send beasts
            </DialogDescription>
          </DialogHeader>
          <Alert className="bg-white/[0.04] border-white/[0.08]">
            <AlertDescription className="text-zinc-300">
              Please connect your wallet to send beasts
            </AlertDescription>
          </Alert>
          <div className="flex justify-end gap-2">
            <Button onClick={handleClose} variant="outline">Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className={dialogClasses}>
        <DialogHeader>
          <DialogTitle className="text-gold">Send {label}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Transfer {label} to another address or Cartridge username
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4">
            <Alert className="bg-green-500/10 border-green-500/50">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-500">
                {count === 1 ? "Beast" : `${count} beasts`} sent successfully!
              </AlertDescription>
            </Alert>
            {txHash && (
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold">Transaction:</span>{" "}
                <a
                  href={`https://voyager.online/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </a>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={handleClose}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Beast list with thumbnails */}
            <div className={`${count > 4 ? "max-h-48" : ""} overflow-y-auto space-y-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] p-2`}>
              {beasts.map((beast) => (
                <div key={beast.id} className="flex items-center gap-2.5 text-xs py-1 px-1.5 rounded-lg hover:bg-white/[0.04]">
                  <div className="w-10 shrink-0">
                    <BeastCard beast={beast} />
                  </div>
                  <span className="text-zinc-200 truncate flex-1 font-medium">{beast.name}</span>
                  {onRemoveBeast && (
                    <button
                      type="button"
                      onClick={() => onRemoveBeast(beast.id)}
                      className="text-zinc-500 hover:text-red-400 shrink-0 p-1 rounded hover:bg-white/[0.06]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Recipient input */}
            <div className="space-y-2">
              <Label htmlFor="send-recipient" className="text-zinc-300">
                Recipient Address or Username
              </Label>
              <Input
                id="send-recipient"
                placeholder="0x... or username"
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setError(null);
                }}
                disabled={isLoading}
                className="font-mono bg-black/40 border-white/[0.08] text-zinc-100"
              />
              <p className="text-xs text-muted-foreground">
                Enter a Starknet address (0x...) or Cartridge username
              </p>

              {isResolving && (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Resolving address...</span>
                </div>
              )}

              {!isResolving && resolvedAddress && (
                <div className="rounded-md bg-green-950/30 border border-green-800/50 p-2">
                  <p className="text-xs text-green-400 font-semibold mb-1">
                    Resolved Address:
                  </p>
                  <p className="text-xs font-mono text-green-300 break-all">
                    {resolvedAddress}
                  </p>
                </div>
              )}
            </div>

            {error && (
              <Alert variant="destructive" className="bg-red-950/50 border-red-800">
                <AlertDescription className="text-red-300">{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button onClick={handleClose} variant="outline" disabled={isLoading}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={isLoading || !resolvedAddress || isResolving || beasts.length === 0}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send {label}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default SendBeastsDialog;
