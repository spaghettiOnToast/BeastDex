/**
 * Warnings and fee breakdowns shown in every game transaction dialog, so the
 * wording (and the numbers) stay the same wherever a tx is made.
 */
import type { ReactNode } from "react";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { ADVENTURER_CLIENT_FEE_BP, ADVENTURER_ROYALTY_BP, IDLE_SECONDS } from "../../services/adventurers";

const ROYALTY = `${ADVENTURER_ROYALTY_BP / 100}%`;
const CLIENT_FEE = `${ADVENTURER_CLIENT_FEE_BP / 100}%`;

/** A titled box of bullet points. */
export function NoticeBox({
  title,
  items,
  tone = "amber",
}: {
  title: string;
  items: Array<ReactNode | false | null | undefined>;
  tone?: "amber" | "blue" | "red";
}) {
  const shown = items.filter(Boolean);
  if (shown.length === 0) return null;
  const Icon = tone === "blue" ? Info : AlertTriangle;
  return (
    <div
      className={cn(
        "rounded-md border p-2.5 text-xs",
        tone === "amber" && "border-amber-500/30 bg-amber-500/10 text-amber-100",
        tone === "blue" && "border-blue-500/25 bg-blue-500/10 text-blue-100",
        tone === "red" && "border-red-500/30 bg-red-500/10 text-red-100",
      )}
    >
      <p className="mb-1 flex items-center gap-1.5 font-semibold">
        <Icon className="h-3.5 w-3.5 flex-shrink-0" /> {title}
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {shown.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Label / amount rows with an optional emphasised total. */
export function FeeTable({ rows, total }: { rows: Array<[string, string]>; total?: [string, string] }) {
  return (
    <div className="space-y-1.5 rounded-md border border-white/[0.06] bg-black/30 p-2.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <span className="text-zinc-400">{label}</span>
          <span className="text-right text-zinc-200">{value}</span>
        </div>
      ))}
      {total && (
        <div className="flex justify-between gap-3 border-t border-white/[0.08] pt-1.5 font-semibold">
          <span className="text-white">{total[0]}</span>
          <span className="text-gold">{total[1]}</span>
        </div>
      )}
    </div>
  );
}

export function ListGameNotice({ started }: { started: boolean }) {
  return (
    <NoticeBox
      title="Before you list"
      items={[
        "Listing doesn't lock the game: it stays in your wallet and you can still play it.",
        <>
          <strong>If you play it after listing, the listing is void</strong>: buyers can't purchase it until you cancel and
          relist. Cancel the listing before you play on.
        </>,
        started &&
          `It can only be listed ${IDLE_SECONDS / 60} minutes after its last move, so the move's result is final before anyone buys.`,
        "Your first game listing also asks your wallet to let the marketplace move your Loot Survivor games (needed to sell them). You can revoke this from the wallet menu.",
        `Loot Survivor takes a ${ROYALTY} royalty from the sale price (shown below). Network gas is extra.`,
      ]}
    />
  );
}

export function BuyGameNotice({ started }: { started: boolean }) {
  return (
    <NoticeBox
      title="Before you buy"
      items={[
        "You get the game NFT exactly as shown above. Play it at lootsurvivor.io once it's in your wallet.",
        started &&
          "The seller can still play until your purchase lands. BeastDex re-checks the game just before you sign and stops if anything changed, but a move in the last few seconds can't be prevented.",
        `You pay the price plus the ${CLIENT_FEE} BeastDex client fee (total below). The seller pays Loot Survivor's ${ROYALTY} royalty out of the price. Network gas is extra.`,
        "Your wallet may also ask to approve the payment token for that total, in the same transaction.",
        "Purchases can't be reversed.",
      ]}
    />
  );
}

export function OfferGameNotice() {
  return (
    <NoticeBox
      title="How game offers work"
      items={[
        <>
          Your offer is for the game <strong>as it is now</strong>. If the owner plays after you offer, BeastDex won't let them
          accept it, but other marketplaces might, so choose a short duration.
        </>,
        "Nothing is taken now: your wallet approves the marketplace to spend the total. Keep it in your wallet; if it's missing when the owner accepts, the sale fails.",
        `If accepted, you pay the offer plus the ${CLIENT_FEE} BeastDex client fee (below). The seller pays the ${ROYALTY} royalty.`,
      ]}
    />
  );
}

export function SendGameNotice({ listed, withOffers }: { listed: number; withOffers: number }) {
  return (
    <NoticeBox
      title="Before you send"
      items={[
        <>
          <strong>Transfers can't be undone.</strong> A wrong address loses the game, so double-check it. Only Starknet wallets
          can receive games.
        </>,
        "No marketplace fee or royalty applies to transfers, only network gas.",
        listed > 0 &&
          `${listed} of these game${listed === 1 ? " is" : "s are"} listed for sale. The listing stops working once sent; cancel it first to tidy up.`,
        withOffers > 0 && `${withOffers} of these game${withOffers === 1 ? " has" : "s have"} offers, which only the new owner could accept.`,
      ]}
    />
  );
}

/** Generic confirm step for one transaction. */
export function ConfirmTxDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  onConfirm,
  busy,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="border border-white/[0.06] bg-surface-overlay">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">{children}</div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button
            className="flex-1 bg-gold/15 font-bold text-gold border border-gold hover:bg-gold/20"
            disabled={busy || disabled}
            onClick={onConfirm}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
