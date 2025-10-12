import { createContext, useContext, useState, ReactNode } from 'react';
import type { Beast } from '../services/beast';

type TradeBuilderStep = 'select-a' | 'enter-address' | 'select-b' | 'idle';

interface TradeBuilderState {
  step: TradeBuilderStep;
  selectedBeastsA: Beast[];
  selectedBeastsB: Beast[];
  accountB: string;
  isBuilding: boolean;
}

interface TradeBuilderContextValue extends TradeBuilderState {
  startTrade: () => void;
  addBeastToA: (beast: Beast) => void;
  removeBeastFromA: (beastId: string) => void;
  clearBeastsA: () => void;
  setAccountB: (address: string) => void;
  proceedToSelectB: () => void;
  addBeastToB: (beast: Beast) => void;
  removeBeastFromB: (beastId: string) => void;
  clearBeastsB: () => void;
  reset: () => void;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
}

const TradeBuilderContext = createContext<TradeBuilderContextValue | undefined>(undefined);

const initialState: TradeBuilderState = {
  step: 'idle',
  selectedBeastsA: [],
  selectedBeastsB: [],
  accountB: '',
  isBuilding: false,
};

export function TradeBuilderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TradeBuilderState>(initialState);
  const [isExpanded, setIsExpanded] = useState(false);

  const startTrade = () => {
    setState(prev => ({
      ...prev,
      step: 'select-a',
      isBuilding: true,
    }));
  };

  const addBeastToA = (beast: Beast) => {
    setState(prev => ({
      ...prev,
      selectedBeastsA: [...prev.selectedBeastsA, beast],
    }));
  };

  const removeBeastFromA = (beastId: string) => {
    setState(prev => ({
      ...prev,
      selectedBeastsA: prev.selectedBeastsA.filter(b => b.id !== beastId),
    }));
  };

  const clearBeastsA = () => {
    setState(prev => ({
      ...prev,
      selectedBeastsA: [],
    }));
  };

  const setAccountB = (address: string) => {
    setState(prev => ({
      ...prev,
      accountB: address,
    }));
  };

  const proceedToSelectB = () => {
    // If accountB is already set, go to select-b, otherwise go to enter-address
    setState(prev => ({
      ...prev,
      step: prev.accountB ? 'select-b' : 'enter-address',
    }));
  };

  const addBeastToB = (beast: Beast) => {
    setState(prev => ({
      ...prev,
      selectedBeastsB: [...prev.selectedBeastsB, beast],
    }));
  };

  const removeBeastFromB = (beastId: string) => {
    setState(prev => ({
      ...prev,
      selectedBeastsB: prev.selectedBeastsB.filter(b => b.id !== beastId),
    }));
  };

  const clearBeastsB = () => {
    setState(prev => ({
      ...prev,
      selectedBeastsB: [],
    }));
  };

  const reset = () => {
    setState(initialState);
    setIsExpanded(false);
  };

  const value: TradeBuilderContextValue = {
    ...state,
    startTrade,
    addBeastToA,
    removeBeastFromA,
    clearBeastsA,
    setAccountB,
    proceedToSelectB,
    addBeastToB,
    removeBeastFromB,
    clearBeastsB,
    reset,
    isExpanded,
    setIsExpanded,
  };

  return (
    <TradeBuilderContext.Provider value={value}>
      {children}
    </TradeBuilderContext.Provider>
  );
}

export function useTradeBuilder() {
  const context = useContext(TradeBuilderContext);
  if (context === undefined) {
    throw new Error('useTradeBuilder must be used within a TradeBuilderProvider');
  }
  return context;
}
