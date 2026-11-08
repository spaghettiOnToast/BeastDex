import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { padStarknetAddress } from "../../utils/address";

/** Your wallet address to receive tokens (every Starknet token arrives at the same address). */
export function ReceiveDialog({
  open,
  onOpenChange,
  address,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: string;
  name?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const full = padStarknetAddress(address) ?? address;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable: the address is selectable below
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-surface-overlay border-white/[0.06]">
        <DialogHeader>
          <DialogTitle className="text-gold">Receive tokens</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Share this address{name ? ` or your name, ${name},` : ""} to receive LORDS, STRK, SKULL or any other Starknet token.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="select-all break-all rounded-md border border-white/[0.08] bg-surface-raised p-3 font-mono text-sm text-zinc-100">
            {full}
          </p>
          <p className="text-xs text-amber-300/90">
            Only send tokens on <strong>Starknet</strong> to this address. Tokens sent from another network (like Ethereum) won't arrive.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => void copy()} className="bg-[#fbcb4a] text-black hover:bg-[#f0b833]">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy address"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
