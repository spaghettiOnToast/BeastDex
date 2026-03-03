import { useState, useCallback, useEffect } from "react";
import { useAccount } from "@starknet-react/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Alert, AlertDescription } from "../ui/alert";
import { Send, Loader2, CheckCircle2 } from "lucide-react";
import { lookupControllerAddresses } from "../../services/controller";
import { normaliseStarknetAddress } from "../../utils/address";
import { CONTRACT_ADDRESS } from "../../services/beast/constants";

type SendBeastDialogProps = {
  open: boolean;
  onClose: () => void;
  beastId: string | number;
  beastName: string;
};

export function SendBeastDialog({
  open,
  onClose,
  beastId,
  beastName,
}: SendBeastDialogProps) {
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

    // Check if it's already a valid address
    const normalized = normaliseStarknetAddress(trimmed);
    if (normalized && normalized.startsWith("0x") && normalized.length > 10) {
      return normalized;
    }

    // Try to resolve as Cartridge username
    try {
      const result = await lookupControllerAddresses([trimmed]);

      // The result keys are normalized (lowercase)
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
    }, 500); // Debounce for 500ms

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

    setIsLoading(true);
    setError(null);

    try {

      // Format token ID as u256 - convert to two separate felts (low, high)
      const tokenIdBigInt = BigInt(beastId);
      const low = tokenIdBigInt & BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
      const high = tokenIdBigInt >> BigInt(128);

      // Execute transfer using account.execute (Cartridge controller will handle this)
      const call = {
        contractAddress: CONTRACT_ADDRESS,
        entrypoint: "transfer_from",
        calldata: [
          connectedAddress,  // from
          resolvedAddress,   // to
          low.toString(),    // token_id.low
          high.toString(),   // token_id.high
        ],
      };

      const result = await account.execute(call);

      if (result?.transaction_hash) {
        setTxHash(result.transaction_hash);
        setSuccess(true);
      } else {
        throw new Error("Transaction failed");
      }
    } catch (err: any) {
      console.error("Transfer failed:", err);
      setError(err?.message || "Failed to send beast. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [connectedAddress, account, resolvedAddress, beastId]);

  if (!connectedAddress) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent className="sm:max-w-md bg-surface-overlay border-white/[0.06]">
          <DialogHeader>
            <DialogTitle className="text-gold">Send Beast</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Connect your wallet to send this beast
            </DialogDescription>
          </DialogHeader>
          <Alert className="bg-surface-raised border-white/[0.08]">
            <AlertDescription className="text-zinc-300">
              Please connect your wallet to send beasts
            </AlertDescription>
          </Alert>
          <div className="flex justify-end gap-2">
            <Button onClick={handleClose} variant="outline">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md bg-surface-overlay border-white/[0.06]">
        <DialogHeader>
          <DialogTitle className="text-gold">Send Beast</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Transfer {beastName} to another address or Cartridge username
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4">
            <Alert className="bg-green-500/10 border-green-500/50">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-500">
                Beast sent successfully!
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
            <div className="space-y-2">
              <Label htmlFor="recipient" className="text-zinc-300">
                Recipient Address or Username
              </Label>
              <Input
                id="recipient"
                placeholder="0x... or username"
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setError(null);
                }}
                disabled={isLoading}
                className="font-mono bg-surface-raised border-white/[0.08] text-zinc-100"
              />
              <p className="text-xs text-muted-foreground">
                Enter a Starknet address (0x...) or Cartridge username
              </p>

              {/* Show resolved address */}
              {isResolving && (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Resolving address...</span>
                </div>
              )}

              {!isResolving && resolvedAddress && (
                <div className="rounded-md bg-green-950/30 border border-green-800/50 p-2">
                  <p className="text-xs text-green-400 font-semibold mb-1">
                    ✓ Resolved Address:
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
              <Button
                onClick={handleClose}
                variant="outline"
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={isLoading || !resolvedAddress || isResolving}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Beast
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

export default SendBeastDialog;
