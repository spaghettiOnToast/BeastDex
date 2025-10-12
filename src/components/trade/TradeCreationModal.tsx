import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import { createTrade } from "../../services/trades";
import { fetchBeasts } from "../../services/beast";
import type { Beast } from "../../services/beast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogOverlay,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { X, Plus, ArrowRightLeft, Search } from "lucide-react";

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
  const [step, setStep] = useState<'select-a' | 'enter-address' | 'select-b'>(

'select-a');
  const [selectedBeastsA, setSelectedBeastsA] = useState<Beast[]>([]);
  const [accountB, setAccountB] = useState("");
  const [accountBBeasts, setAccountBBeasts] = useState<Beast[]>([]);
  const [selectedBeastsB, setSelectedBeastsB] = useState<Beast[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingBeasts, setLoadingBeasts] = useState(false);

  // Update selected beasts when initialBeast changes or modal opens
  useEffect(() => {
    if (isOpen && initialBeast) {
      setSelectedBeastsA([initialBeast]);
    } else if (isOpen && !initialBeast) {
      setSelectedBeastsA([]);
      setSelectedBeastsB([]);
      setAccountB("");
      setAccountBBeasts([]);
      setStep('select-a');
    }
  }, [isOpen, initialBeast]);

  const connectedWalletAddress = account?.address;

  const handleBeastToggleA = (beast: Beast) => {
    setSelectedBeastsA(prev => {
      const isSelected = prev.some(b => b.id === beast.id);
      if (isSelected) {
        return prev.filter(b => b.id !== beast.id);
      } else {
        return [...prev, beast];
      }
    });
  };

  const handleBeastToggleB = (beast: Beast) => {
    setSelectedBeastsB(prev => {
      const isSelected = prev.some(b => b.id === beast.id);
      if (isSelected) {
        return prev.filter(b => b.id !== beast.id);
      } else {
        return [...prev, beast];
      }
    });
  };

  const handleContinueToAddress = async () => {
    if (selectedBeastsA.length === 0) {
      alert('Please select at least one beast for your offer');
      return;
    }

    setStep('enter-address');
  };

  const handleLoadAccountBCollection = async () => {
    if (!accountB.trim()) {
      alert('Please enter a wallet address');
      return;
    }

    try {
      setLoadingBeasts(true);
      const { beasts } = await fetchBeasts({
        ownerAddresses: [accountB.trim()],
        limit: 100,
      });

      if (beasts.length === 0) {
        alert('No beasts found for this address. Please check the address and try again.');
        return;
      }

      setAccountBBeasts(beasts);
      setStep('select-b');
    } catch (error) {
      console.error('Failed to load collection:', error);
      alert('Failed to load collection. Please check the address and try again.');
    } finally {
      setLoadingBeasts(false);
    }
  };

  const handleCreateTrade = async () => {
    if (!connectedWalletAddress || selectedBeastsA.length === 0) return;
    if (!accountB.trim() || selectedBeastsB.length === 0) {
      alert('Please select beasts from the other user\'s collection');
      return;
    }

    try {
      setLoading(true);
      const { trade } = await createTrade({
        account_a: connectedWalletAddress,
        account_b: accountB.trim(),
        offer_a: selectedBeastsA.map(beast => beast.id),
        offer_b: selectedBeastsB.map(beast => beast.id),
      });

      onClose();
      navigate(`/trade/${trade.id}`);
    } catch (error) {
      console.error('Failed to create trade:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create trade. Please try again.';

      if (errorMessage.includes('connect') || errorMessage.includes('service')) {
        alert('Trading service is currently unavailable. Please try again later or check your connection.');
      } else {
        alert(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const isSelectedA = (beast: Beast) => selectedBeastsA.some(b => b.id === beast.id);
  const isSelectedB = (beast: Beast) => selectedBeastsB.some(b => b.id === beast.id);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogOverlay className="bg-black/90" />
      <DialogContent className="max-w-4xl max-h-[80vh] p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            Create Trade - {step === 'select-a' ? 'Step 1: Your Offer' : step === 'enter-address' ? 'Step 2: Trading Partner' : 'Step 3: Their Offer'}
          </DialogTitle>
        </DialogHeader>

        {step === 'select-a' && (
          <div className="px-6 py-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Your Offer</h3>
              {selectedBeastsA.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedBeastsA.map((beast) => (
                    <Badge
                      key={beast.id}
                      variant="default"
                      className="flex items-center gap-1 px-3 py-1"
                    >
                      {beast.name}
                      <button
                        onClick={() => handleBeastToggleA(beast)}
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
                        ${isSelectedA(beast)
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                        }
                      `}
                      onClick={() => handleBeastToggleA(beast)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{beast.name}</p>
                          <p className="text-sm text-muted-foreground">
                            #{beast.numericId || beast.id}
                          </p>
                        </div>
                        {isSelectedA(beast) ? (
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
        )}

        {step === 'enter-address' && (
          <div className="px-6 py-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Your Offer ({selectedBeastsA.length} beasts)</h3>
              <div className="flex flex-wrap gap-2">
                {selectedBeastsA.map((beast) => (
                  <Badge key={beast.id} variant="default">
                    {beast.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Who do you want to trade with?</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Enter the wallet address of the person you want to trade with
                </p>
                <input
                  type="text"
                  className="w-full px-4 py-2 border rounded-lg"
                  placeholder="0x... or username"
                  value={accountB}
                  onChange={(e) => setAccountB(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleLoadAccountBCollection();
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {step === 'select-b' && (
          <div className="px-6 py-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">What do you want from {accountB.slice(0, 6)}...{accountB.slice(-4)}?</h3>
              {selectedBeastsB.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedBeastsB.map((beast) => (
                    <Badge
                      key={beast.id}
                      variant="default"
                      className="flex items-center gap-1 px-3 py-1"
                    >
                      {beast.name}
                      <button
                        onClick={() => handleBeastToggleB(beast)}
                        className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No beasts selected from their collection</p>
              )}
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Select Beasts from Their Collection</h3>
              <ScrollArea className="h-64 border rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-4">
                  {accountBBeasts.map((beast) => (
                    <div
                      key={beast.id}
                      className={`
                        p-3 border rounded-lg cursor-pointer transition-colors
                        ${isSelectedB(beast)
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                        }
                      `}
                      onClick={() => handleBeastToggleB(beast)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{beast.name}</p>
                          <p className="text-sm text-muted-foreground">
                            #{beast.numericId || beast.id}
                          </p>
                        </div>
                        {isSelectedB(beast) ? (
                          <X className="w-4 h-4 text-primary" />
                        ) : (
                          <Plus className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {accountBBeasts.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    No beasts available
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        )}

        <DialogFooter className="px-6 py-4 border-t">
          <div className="flex items-center justify-between w-full">
            {step === 'select-a' && (
              <>
                <p className="text-sm text-muted-foreground">
                  {selectedBeastsA.length} beast{selectedBeastsA.length !== 1 ? 's' : ''} selected
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleContinueToAddress}
                    disabled={selectedBeastsA.length === 0}
                  >
                    Continue
                  </Button>
                </div>
              </>
            )}

            {step === 'enter-address' && (
              <>
                <Button variant="outline" onClick={() => setStep('select-a')}>
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleLoadAccountBCollection}
                    disabled={loadingBeasts || !accountB.trim()}
                  >
                    {loadingBeasts ? (
                      <>
                        <Search className="w-4 h-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Continue'
                    )}
                  </Button>
                </div>
              </>
            )}

            {step === 'select-b' && (
              <>
                <Button variant="outline" onClick={() => setStep('enter-address')}>
                  Back
                </Button>
                <div className="flex gap-2">
                  <p className="text-sm text-muted-foreground mr-4">
                    {selectedBeastsB.length} beast{selectedBeastsB.length !== 1 ? 's' : ''} selected
                  </p>
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateTrade}
                    disabled={loading || selectedBeastsB.length === 0}
                  >
                    {loading ? 'Creating...' : 'Create Trade'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
