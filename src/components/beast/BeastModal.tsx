import { useState, useEffect, type ReactNode, memo } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import type { Beast } from "../../services/beast";
import { fetchSummitBeastData, type SummitBeastData } from "../../services/summit";
import BeastDetailContent from "./BeastDetailContent";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { ChevronLeft, ChevronRight, Send, Clock } from "lucide-react";
import { normaliseStarknetAddress } from "../../utils/address";
import { SendBeastDialog } from "./SendBeastDialog";

type BeastModalProps = {
  beast: Beast | null;
  ownerUsernames: Record<string, string | undefined>;
  onClose: () => void;
  duplicates?: Beast[];
  currentDuplicateIndex?: number;
  onNextDuplicate?: () => void;
  onPreviousDuplicate?: () => void;
  customActionSlot?: ReactNode; // Override default action buttons
  listingExpiration?: number; // Unix timestamp for listing expiry
};

export const BeastModal = memo(function BeastModal({
  beast,
  ownerUsernames,
  onClose,
  duplicates = [],
  currentDuplicateIndex = 0,
  onNextDuplicate,
  onPreviousDuplicate,
  customActionSlot,
  listingExpiration,
}: BeastModalProps) {
  const navigate = useNavigate();
  const { address: connectedAddress } = useAccount();
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [summitData, setSummitData] = useState<SummitBeastData | null>(null);
  const [summitLoading, setSummitLoading] = useState(true);

  // Fetch Summit data when beast changes
  useEffect(() => {
    let cancelled = false;

    async function loadSummitData() {
      if (!beast) {
        setSummitData(null);
        setSummitLoading(false);
        return;
      }

      try {
        setSummitLoading(true);
        const data = await fetchSummitBeastData(beast.numericId);
        if (cancelled) return;
        setSummitData(data);
      } catch (err) {
        console.error("Failed to load Summit data in modal:", err);
        if (cancelled) return;
        setSummitData(null);
      } finally {
        if (!cancelled) setSummitLoading(false);
      }
    }

    loadSummitData();

    return () => {
      cancelled = true;
    };
  }, [beast]);

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

  // Check if the connected user owns this beast
  const isOwner = connectedAddress && normalizedOwner &&
    normaliseStarknetAddress(connectedAddress)?.toLowerCase() === normalizedOwner.toLowerCase();

  return (
    <Dialog open={!!beast} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl p-0 gap-0 border-muted/50 bg-background/95 backdrop-blur-sm">
        <DialogHeader className="px-4 py-5 border-b border-border/50 bg-muted/30">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-xl font-bold tracking-tight">{beast.name}</DialogTitle>
            <div className="flex items-center gap-3">
              {listingExpiration && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50 border border-border/50">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Expires {new Date(listingExpiration * 1000).toLocaleDateString()}
                  </span>
                </div>
              )}
              {hasDuplicates && (
                <>
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
                </>
              )}
            </div>
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[85vh]">
          <div className="px-6 py-6 space-y-4">
            <BeastDetailContent
              beast={beast}
              ownerUsername={ownerUsername}
              summitData={summitData}
              summitLoading={summitLoading}
              imageSize="modal"
              actionSlot={
                customActionSlot ?? (
                  <div className="flex flex-col sm:flex-row gap-2">
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
                    {isOwner && (
                      <Button
                        variant="outline"
                        size="default"
                        onClick={() => setShowSendDialog(true)}
                        className="w-full sm:w-auto font-semibold tracking-wide cursor-pointer"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Send Beast
                      </Button>
                    )}
                  </div>
                )
              }
            />
          </div>
        </ScrollArea>
      </DialogContent>

      <SendBeastDialog
        open={showSendDialog}
        onClose={() => setShowSendDialog(false)}
        beastId={beast.numericId || beast.id}
        beastName={beast.name}
      />
    </Dialog>
  );
});

export default BeastModal;
