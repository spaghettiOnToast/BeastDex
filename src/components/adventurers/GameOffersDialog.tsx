import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import type { ArcadeOrderModelCompat } from "../../hooks/useArcadeOrders";
import { useControllerUsernames } from "../../hooks/useControllerUsernames";
import { getPaymentTokenByAddress } from "../../services/marketplace/constants";
import { formatPrice } from "../../utils/price";
import { normaliseStarknetAddress } from "../../utils/address";
import {
  ADVENTURER_ROYALTY_BP,
  acceptOfferBlocker,
  gameDungeonFor,
  type AdventurerGame,
} from "../../services/adventurers";
import { formatAgo } from "../../services/adventurers/format";

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
  if (!game) return null;
  const d = gameDungeonFor(game.minterId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                        {formatPrice(price, symbol)} {symbol}
                      </div>
                      <div className="text-zinc-500">
                        You receive {formatPrice(net, symbol)} {symbol} · from{" "}
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
                      onClick={() => onAccept(o)}
                    >
                      {acceptingId === id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept"}
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
