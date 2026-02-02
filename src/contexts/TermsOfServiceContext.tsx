import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const TOS_ACCEPTED_KEY = "beastdex:tos-accepted";
const TOS_VERSION = "1.0.0"; // Increment this to require re-acceptance

interface TermsOfServiceContextValue {
  hasAcceptedToS: boolean;
  acceptToS: () => void;
  declineToS: () => void;
  showToSDialog: boolean;
  openToSDialog: () => void;
  closeToSDialog: () => void;
  promptToSAcceptance: (onDecline?: () => void) => boolean;
  tosVersion: string;
}

const TermsOfServiceContext = createContext<TermsOfServiceContextValue | null>(null);

export function TermsOfServiceProvider({ children }: { children: ReactNode }) {
  const [hasAcceptedToS, setHasAcceptedToS] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(TOS_ACCEPTED_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Check if the accepted version matches current version
        return parsed.version === TOS_VERSION && parsed.accepted === true;
      }
    } catch {
      // Ignore parse errors
    }
    return false;
  });

  const [showToSDialog, setShowToSDialog] = useState(false);
  const [onDeclineCallback, setOnDeclineCallback] = useState<(() => void) | null>(null);

  // Function to prompt ToS acceptance (called on wallet connection)
  const promptToSAcceptance = useCallback((onDecline?: () => void) => {
    if (!hasAcceptedToS) {
      setOnDeclineCallback(() => onDecline || null);
      setShowToSDialog(true);
      return true; // ToS prompt was shown
    }
    return false; // Already accepted, no prompt needed
  }, [hasAcceptedToS]);

  const acceptToS = useCallback(() => {
    const acceptance = {
      version: TOS_VERSION,
      accepted: true,
      acceptedAt: new Date().toISOString(),
    };
    localStorage.setItem(TOS_ACCEPTED_KEY, JSON.stringify(acceptance));
    setHasAcceptedToS(true);
    setShowToSDialog(false);
  }, []);

  const declineToS = useCallback(() => {
    setShowToSDialog(false);
    // Call the decline callback (e.g., to disconnect wallet)
    if (onDeclineCallback) {
      onDeclineCallback();
      setOnDeclineCallback(null);
    }
  }, [onDeclineCallback]);

  const openToSDialog = useCallback(() => setShowToSDialog(true), []);
  const closeToSDialog = useCallback(() => setShowToSDialog(false), []);

  const value: TermsOfServiceContextValue = {
    hasAcceptedToS,
    acceptToS,
    declineToS,
    showToSDialog,
    openToSDialog,
    closeToSDialog,
    promptToSAcceptance,
    tosVersion: TOS_VERSION,
  };

  return (
    <TermsOfServiceContext.Provider value={value}>
      {children}
    </TermsOfServiceContext.Provider>
  );
}

export function useTermsOfService() {
  const context = useContext(TermsOfServiceContext);
  if (!context) {
    throw new Error("useTermsOfService must be used within a TermsOfServiceProvider");
  }
  return context;
}
