import { useEffect, useState } from "react";
import { checkRecipientInput } from "../services/tokens/send";
import { lookupProfileAddresses } from "../services/walletNames";

/**
 * Resolve a recipient as the user types: 0x addresses, Controller usernames
 * and .brother names (debounced lookup).
 */
export function useRecipient(input: string) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const check = checkRecipientInput(input);
    setResolved(null);
    setResolving(false);
    if (check.kind === "empty") return setError(null);
    if (check.kind === "invalid") return setError(check.message);
    if (check.kind === "address") {
      setError(null);
      return setResolved(check.address);
    }
    let alive = true;
    setResolving(true);
    const timer = setTimeout(async () => {
      try {
        const res = await lookupProfileAddresses([check.name]);
        if (!alive) return;
        const addr = res[check.name.toLowerCase()]?.[0] ?? null;
        setResolved(addr);
        setError(addr ? null : "Username not found.");
      } catch {
        if (alive) setError("Couldn't look up that name.");
      } finally {
        if (alive) setResolving(false);
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [input]);

  return { resolved, resolving, error };
}
