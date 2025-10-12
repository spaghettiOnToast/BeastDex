import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTradeBuilder } from '../../contexts/TradeBuilderContext';
import { TradeBeastCard } from './TradeBeastCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { createTrade } from '../../services/trades';
import { useAccount } from '@starknet-react/core';

export function TradeBuilder() {
  const navigate = useNavigate();
  const { address: connectedWalletAddress } = useAccount();
  const {
    step,
    selectedBeastsA,
    selectedBeastsB,
    accountB,
    isBuilding,
    setAccountB,
    proceedToSelectB,
    reset,
    isExpanded,
    setIsExpanded,
    clearBeastsA,
    clearBeastsB,
    removeBeastFromA,
    removeBeastFromB,
  } = useTradeBuilder();

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isBuilding) {
    return null;
  }

  const handleCreateTrade = async () => {
    if (!connectedWalletAddress) {
      setError('Please connect your wallet');
      return;
    }

    if (selectedBeastsA.length === 0 || selectedBeastsB.length === 0) {
      setError('Please select beasts for both sides');
      return;
    }

    if (!accountB) {
      setError('Please enter account B address');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const { trade } = await createTrade({
        account_a: connectedWalletAddress,
        account_b: accountB,
        offer_a: selectedBeastsA.map((b) => b.id),
        offer_b: selectedBeastsB.map((b) => b.id),
        status: 'DRAFT',
      });

      reset();
      navigate(`/trade/${trade.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trade');
    } finally {
      setIsCreating(false);
    }
  };

  const canProceedToSelectB = step === 'select-a' && selectedBeastsA.length > 0;
  const canCreateTrade = step === 'select-b' && selectedBeastsA.length > 0 && selectedBeastsB.length > 0 && accountB;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-96 max-h-[80vh]">
      {/* Header */}
      <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-lg">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Trade Builder</h3>
            {step === 'select-a' && (
              <span className="text-xs text-muted-foreground">Step 1: Your Beasts</span>
            )}
            {step === 'enter-address' && (
              <span className="text-xs text-muted-foreground">Step 2: Enter Address</span>
            )}
            {step === 'select-b' && (
              <span className="text-xs text-muted-foreground">Step 3: Their Beasts</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-accent rounded"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
            <button onClick={reset} className="p-1 hover:bg-accent rounded">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="p-3 max-h-[60vh] overflow-y-auto">
            {/* Step 2: Enter Address */}
            {step === 'enter-address' && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Trading Partner Address
                  </label>
                  <Input
                    type="text"
                    value={accountB}
                    onChange={(e) => setAccountB(e.target.value)}
                    placeholder="Enter wallet address or username"
                    className="w-full"
                  />
                </div>
                <Button
                  onClick={proceedToSelectB}
                  disabled={!accountB}
                  className="w-full"
                >
                  Continue to Select Their Beasts
                </Button>
              </div>
            )}

            {/* Your Side (Account A) */}
            {(step === 'select-a' || step === 'select-b') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Your Beasts ({selectedBeastsA.length})</h4>
                  {selectedBeastsA.length > 0 && (
                    <button
                      onClick={clearBeastsA}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {selectedBeastsA.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No beasts selected</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {selectedBeastsA.map((beast) => (
                      <div key={beast.id} className="relative group">
                        <TradeBeastCard beast={beast} compact />
                        <button
                          onClick={() => removeBeastFromA(beast.id)}
                          className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Their Side (Account B) */}
            {step === 'select-b' && (
              <div className="space-y-2 mt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Their Beasts ({selectedBeastsB.length})</h4>
                  {selectedBeastsB.length > 0 && (
                    <button
                      onClick={clearBeastsB}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {selectedBeastsB.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No beasts selected</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {selectedBeastsB.map((beast) => (
                      <div key={beast.id} className="relative group">
                        <TradeBeastCard beast={beast} compact />
                        <button
                          onClick={() => removeBeastFromB(beast.id)}
                          className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs text-destructive mt-2">{error}</p>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-3 border-t border-border">
          {step === 'select-a' && (
            <Button
              onClick={proceedToSelectB}
              disabled={!canProceedToSelectB}
              className="w-full"
              size="sm"
            >
              Continue →
            </Button>
          )}
          {step === 'select-b' && (
            <Button
              onClick={handleCreateTrade}
              disabled={!canCreateTrade || isCreating}
              className="w-full"
              size="sm"
            >
              {isCreating ? 'Creating Trade...' : 'Create Trade'}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Badge (when collapsed) */}
      {!isExpanded && (
        <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg p-2 shadow-lg">
          <div className="flex items-center justify-between text-xs">
            <span>Your: {selectedBeastsA.length}</span>
            <span className="text-muted-foreground">↔</span>
            <span>Their: {selectedBeastsB.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}
