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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { normaliseStarknetAddress } from "../../utils/address";

type BeastModalProps = {
  beast: Beast | null;
  ownerUsernames: Record<string, string | undefined>;
  onClose: () => void;
  duplicates?: Beast[];
  currentDuplicateIndex?: number;
  onNextDuplicate?: () => void;
  onPreviousDuplicate?: () => void;
};

export function BeastModal({
  beast,
  ownerUsernames,
  onClose,
  duplicates = [],
  currentDuplicateIndex = 0,
  onNextDuplicate,
  onPreviousDuplicate
}: BeastModalProps) {
  const navigate = useNavigate();

  if (!beast) {
    return null;
  }

  const normalizedOwner = beast.owner ? normaliseStarknetAddress(beast.owner) : null;
  const ownerUsername = normalizedOwner
    ? ownerUsernames[normalizedOwner] ?? null
    : null;

  const detailPath = Number.isFinite(beast.numericId) && beast.numericId > 0
    ? `/beasts/${beast.numericId}`
    : `/beasts/${encodeURIComponent(beast.id)}`;

  const hasDuplicates = duplicates.length > 1;

  return (
    <Dialog open={!!beast} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl p-0 gap-0 border-muted/50 bg-background/95 backdrop-blur-sm">
        <DialogHeader className="px-6 py-5 border-b border-border/50 bg-muted/30">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-xl font-bold tracking-tight">{beast.name}</DialogTitle>
            {hasDuplicates && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground font-medium">
                  {currentDuplicateIndex + 1} of {duplicates.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onPreviousDuplicate}
                    disabled={!onPreviousDuplicate}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onNextDuplicate}
                    disabled={!onNextDuplicate}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
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
