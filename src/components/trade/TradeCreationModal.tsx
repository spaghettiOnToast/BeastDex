import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import { createTrade } from "../../services/trades";
import type { Beast } from "../../services/beast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { X, Plus, ArrowRightLeft } from "lucide-react";

type TradeCreationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialBeast?: Beast;
  availableBeasts: Beast[];
};

export function TradeCreationModal({
  isOpen,
  onClose,
  initialBeast,
  availableBeasts,
}: TradeCreationModalProps) {
  const navigate = useNavigate();
  const { account } = useAccount();
  const [selectedBeasts, setSelectedBeasts] = useState<Beast[]>(
    initialBeast ? [initialBeast] : []
  );
  const [creating, setCreating] = useState(false);

  const connectedWalletAddress = account?.address;

  const handleBeastToggle = (beast: Beast) => {
    setSelectedBeasts(prev => {
      const isSelected = prev.some(b => b.id === beast.id);
      if (isSelected) {
        return prev.filter(b => b.id !== beast.id);
      } else {
        return [...prev, beast];
      }
    });
  };

  const handleCreateTrade = async () => {
    if (!connectedWalletAddress || selectedBeasts.length === 0) return;

    try {
      setCreating(true);
      const { trade } = await createTrade({
        account_a: connectedWalletAddress,
        offer_a: selectedBeasts.map(beast => beast.id),
      });

      onClose();
      navigate(`/trade/${trade.id}`);
    } catch (error) {
      console.error('Failed to create trade:', error);
      alert('Failed to create trade. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const isSelected = (beast: Beast) => selectedBeasts.some(b => b.id === beast.id);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            Create Trade
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">Your Offer</h3>
            {selectedBeasts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedBeasts.map((beast) => (
                  <Badge
                    key={beast.id}
                    variant="default"
                    className="flex items-center gap-1 px-3 py-1"
                  >
                    {beast.name}
                    <button
                      onClick={() => handleBeastToggle(beast)}
                      className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No beasts selected for your offer</p>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Select Beasts to Offer</h3>
            <ScrollArea className="h-64 border rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-4">
                {availableBeasts.map((beast) => (
                  <div
                    key={beast.id}
                    className={`
                      p-3 border rounded-lg cursor-pointer transition-colors
                      ${isSelected(beast)
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                      }
                    `}
                    onClick={() => handleBeastToggle(beast)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{beast.name}</p>
                        <p className="text-sm text-muted-foreground">
                          #{beast.numericId || beast.id}
                        </p>
                      </div>
                      {isSelected(beast) ? (
                        <X className="w-4 h-4 text-primary" />
                      ) : (
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {availableBeasts.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  No beasts available
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <div className="flex items-center justify-between w-full">
            <p className="text-sm text-muted-foreground">
              {selectedBeasts.length} beast{selectedBeasts.length !== 1 ? 's' : ''} selected
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateTrade}
                disabled={creating || selectedBeasts.length === 0 || !connectedWalletAddress}
              >
                {creating ? 'Creating...' : 'Create Trade'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}