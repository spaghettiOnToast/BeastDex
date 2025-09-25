import { useNavigate } from "react-router-dom";
import type { Beast } from "../../services/beast";
import BeastDetailContent from "./BeastDetailContent";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";

type BeastModalProps = {
  beast: Beast | null;
  ownerUsernames: Record<string, string | undefined>;
  onClose: () => void;
};

export function BeastModal({ beast, ownerUsernames, onClose }: BeastModalProps) {
  const navigate = useNavigate();

  if (!beast) {
    return null;
  }

  const ownerUsername = beast.owner
    ? ownerUsernames[beast.owner.toLowerCase()] ?? null
    : null;

  const detailPath = Number.isFinite(beast.numericId) && beast.numericId > 0
    ? `/beasts/${beast.numericId}`
    : `/beasts/${encodeURIComponent(beast.id)}`;

  return (
    <Dialog open={!!beast} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl p-0 gap-0 border-muted/50 bg-background/95 backdrop-blur-sm">
        <DialogHeader className="px-6 py-5 border-b border-border/50 bg-muted/30">
          <DialogTitle className="text-xl font-bold tracking-tight">{beast.name}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[75vh]">
          <div className="px-6 py-6 space-y-4">
            <BeastDetailContent
              beast={beast}
              ownerUsername={ownerUsername}
              actionSlot={
                <Button
                  variant="default"
                  size="default"
                  onClick={() => {
                    onClose();
                    navigate(detailPath);
                  }}
                  className="w-full sm:w-auto font-semibold tracking-wide"
                >
                  View Full Details
                </Button>
              }
            />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default BeastModal;
