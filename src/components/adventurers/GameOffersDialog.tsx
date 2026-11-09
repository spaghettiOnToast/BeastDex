import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import type { ArcadeOrderModelCompat } from "../../hooks/useArcadeOrders";
import { useControllerUsernames } from "../../hooks/useControllerUsernames";
import { getPaymentTokenByAddress } from "../../services/marketplace/constants";
import { formatPrice } from "../../utils/price";
import { normaliseStarknetAddress } from "../../utils/address";
import {
  ADVENTURER_CLIENT_FEE_BP,
  ADVENTURER_ROYALTY_BP,
  acceptOfferBlocker,
  gameDungeonFor,
  type AdventurerGame,
} from "../../services/adventurers";
import { formatAgo } from "../../services/adventurers/format";
import { useArcadeBookConfig } from "../../hooks/useArcadeBookConfig";
import { FeeTable, NoticeBox } from "./TxNotices";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: AdventurerGame | null;
  offers: ArcadeOrderModelCompat[];
  /** offer id being accepted */
  acceptingId: string | null;
  onAccept: (offer: ArcadeOrderModelCompat) => void;
};

/** Offers received on one of the user's games, with the accept rules applied per offer. */
export function GameOffersDialog({ open, onOpenChange, game, offers, acceptingId, onAccept }: Props) {
  const { usernames } = useControllerUsernames(offers.map((o) => o.owner));
  const { platformFeeBP } = useArcadeBookConfig();
  const [confirming, setConfirming] = useState<ArcadeOrderModelCompat | null>(null);
  if (!game) return null;
  const d = gameDungeonFor(game.minterId);
  const close = (o: boolean) => {
    if (!o) setConfirming(null);
    onOpenChange(o);
  };

  if (confirming) {
    const symbol = getPaymentTokenByAddress(confirming.currency)?.symbol ?? "STRK";
    const price = BigInt(confirming.price);
    const royalty = (price * BigInt(ADVENTURER_ROYALTY_BP)) / 10000n;
    const platform = (price * BigInt(platformFeeBP)) / 10000n;
    const fmt = (v: bigint) => formatPrice(v, symbol); // includes the symbol
    const busy = acceptingId === String(confirming.id);
    const blocker = acceptOfferBlocker(game, confirming.createdAt);
    return (
      <Dialog open={open} onOpenChange={(o) => !busy && close(o)}>
        <DialogContent className="border border-white/[0.06] bg-surface-overlay">
          <DialogHeader>
            <DialogTitle>Accept offer?</DialogTitle>
            <DialogDescription>
              Sell {d.name} Lv {game.level} (#{BigInt(game.tokenId).toString(16).slice(-6)}) for {fmt(price)}.
            </DialogDescription>
          </DialogHeader>
          <FeeTable
            rows={[
              ["Offer", fmt(price)],
              [`Loot Survivor royalty (${ADVENTURER_ROYALTY_BP / 100}%)`, `−${fmt(royalty)}`],
              ...(platformFeeBP > 0 ? ([[`Marketplace fee (${platformFeeBP / 100}%)`, `−${fmt(platform)}`]] as Array<[string, string]>) : []),
            ]}
            total={["You receive", fmt(price - royalty - platform)]}
          />
          <p className="text-[11px] text-zinc-500">
            The buyer also pays the {ADVENTURER_CLIENT_FEE_BP / 100}% BeastDex client fee on top, from their wallet. Network gas is extra.
          </p>
          <NoticeBox
            title="Before you accept"
            items={[
              "The game leaves your wallet as soon as this lands. It can't be reversed.",
              "Don't play the game while this is pending.",
              "If the game is listed, that listing ends.",
            ]}
          />
          {blocker && <NoticeBox tone="red" title="Can't accept" items={[blocker]} />}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setConfirming(null)}>
              Back
            </Button>
            <Button
              className="flex-1 bg-gold/15 font-bold text-gold border border-gold hover:bg-gold/20"
              disabled={busy || !!blocker}
              onClick={() => onAccept(confirming)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Accept ${fmt(price)}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="border border-white/[0.06] bg-surface-overlay">
        <DialogHeader>
          <DialogTitle>
            Offers · {d.name} Lv {game.level}
          </DialogTitle>
          <DialogDescription>
            Accepting sells the game now. Loot Survivor's {ADVENTURER_ROYALTY_BP / 100}% royalty comes out of the price.
          </DialogDescription>
        </DialogHeader>
        {offers.length === 0 ? (
          <p className="text-sm text-zinc-400">No offers on this game.</p>
        ) : (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {offers.map((o) => {
              const symbol = getPaymentTokenByAddress(o.currency)?.symbol ?? "STRK";
              const price = BigInt(o.price);
              const net = price - (price * BigInt(ADVENTURER_ROYALTY_BP)) / 10000n;
              const blocker = acceptOfferBlocker(game, o.createdAt);
              const buyer = normaliseStarknetAddress(o.owner);
              const id = String(o.id);
              return (
                <div key={id} className="rounded-lg border border-white/[0.06] bg-black/30 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-gold">
                        {formatPrice(price, symbol)}
                      </div>
                      <div className="text-zinc-500">
                        You receive {formatPrice(net, symbol)} · from{" "}
                        {(buyer && usernames[buyer]) || `${o.owner.slice(0, 6)}…${o.owner.slice(-4)}`}
                        {o.createdAt ? ` · ${formatAgo(o.createdAt)}` : ""}
                      </div>
                      <div className="text-zinc-600">Expires {new Date(o.expiration * 1000).toLocaleString()}</div>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 bg-gold/15 font-bold text-gold border border-gold hover:bg-gold/20"
                      disabled={!!blocker || !!acceptingId}
                      title={blocker ?? undefined}
                      onClick={() => setConfirming(o)}
                    >
                      Accept…
                    </Button>
                  </div>
                  {blocker && <p className="mt-1.5 text-amber-300">{blocker}</p>}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
