import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount } from "@starknet-react/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import TokenIcon from "../ui/TokenIcon";
import { fetchWalletBalances, formatTokenAmount, type WalletBalance } from "../../services/tokens/walletBalances";
import {
  buildTransferCall,
  checkRecipientInput,
  maxSendable,
  parseTokenAmount,
  rawToInput,
  STRK_ADDRESS,
} from "../../services/tokens/send";
import { lookupProfileAddresses } from "../../services/walletNames";
import { withReadProvider } from "../../services/tx";
import { normaliseStarknetAddress } from "../../utils/address";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Token preselected from the row that was clicked. */
  initialToken?: string | null;
};

type Resolved = { address: string; name?: string } | null;

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

export function SendTokenDialog({ open, onOpenChange, initialToken }: Props) {
  const { address: from, account } = useAccount();
  const queryClient = useQueryClient();
  const { data: balances = [] } = useQuery({
    queryKey: ["walletBalances", (from ?? "").toLowerCase()],
    queryFn: () => fetchWalletBalances(from!),
    enabled: Boolean(from) && open,
    staleTime: 30_000,
  });

  const [tokenAddr, setTokenAddr] = useState<string | null>(null);
  const [recipientInput, setRecipientInput] = useState("");
  const [resolved, setResolved] = useState<Resolved>(null);
  const [resolving, setResolving] = useState(false);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [undeployed, setUndeployed] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [step, setStep] = useState<"form" | "review" | "sending" | "done">("form");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTokenAddr(initialToken ?? null);
    setRecipientInput("");
    setResolved(null);
    setRecipientError(null);
    setUndeployed(false);
    setAmountInput("");
    setStep("form");
    setTxHash(null);
    setTxError(null);
  }, [open, initialToken]);

  const token: WalletBalance | undefined = useMemo(
    () => balances.find((b) => tokenAddr && BigInt(b.address) === BigInt(tokenAddr)) ?? balances[0],
    [balances, tokenAddr],
  );
  const hasStrk = balances.some((b) => BigInt(b.address) === BigInt(STRK_ADDRESS));

  // Resolve the recipient as the user types (debounced).
  useEffect(() => {
    setResolved(null);
    setRecipientError(null);
    setUndeployed(false);
    const check = checkRecipientInput(recipientInput);
    if (check.kind === "empty") return;
    if (check.kind === "invalid") {
      setRecipientError(check.message);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setResolving(true);
      try {
        let target: Resolved = null;
        if (check.kind === "address") {
          target = { address: check.address };
        } else {
          const found = (await lookupProfileAddresses([check.name]))[check.name.toLowerCase()] ?? [];
          const addr = normaliseStarknetAddress(found[0]);
          target = addr ? { address: addr, name: check.name } : null;
          if (!target && !cancelled) setRecipientError(`No wallet found for "${check.name}".`);
        }
        if (cancelled || !target) return;
        if (from && BigInt(target.address) === BigInt(from)) {
          setRecipientError("That's your own wallet.");
          return;
        }
        setResolved(target);
        // A typo'd address usually has no account behind it: warn, don't block
        // (a brand-new wallet may not be deployed yet).
        try {
          await withReadProvider((p) => p.getClassHashAt(target!.address, "latest"));
        } catch {
          if (!cancelled) setUndeployed(true);
        }
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setResolving(false);
    };
  }, [recipientInput, from]);

  const amount = token ? parseTokenAmount(amountInput, token.decimals) : null;
  const amountError =
    !amountInput.trim() || !token
      ? null
      : amount === null
        ? `Enter a number with up to ${token.decimals} decimal places.`
        : amount <= 0n
          ? "Enter an amount above zero."
          : amount > token.raw
            ? "That's more than your balance."
            : null;
  const canReview = Boolean(token && resolved && amount && amount > 0n && !amountError && !recipientError && !resolving);

  const send = async () => {
    if (!account || !token || !resolved || !amount) return;
    setStep("sending");
    setTxError(null);
    try {
      const res = await account.execute([buildTransferCall(token.address, resolved.address, amount)]);
      const hash = res?.transaction_hash;
      if (!hash) throw new Error("The wallet didn't return a transaction.");
      setTxHash(hash);
      await withReadProvider((p) => p.waitForTransaction(hash, { retryInterval: 2000 }));
      setStep("done");
      toast.success(`Sent ${formatTokenAmount(amount, token.decimals, token.displayDecimals)} ${token.label ?? token.symbol}`);
      void queryClient.invalidateQueries({ queryKey: ["walletBalances"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTxError(/reject|cancel|abort/i.test(msg) ? "Cancelled in your wallet." : msg);
      setStep("review");
    }
  };

  const label = token ? token.label ?? token.symbol : "";
  const recipientLabel = resolved ? (resolved.name ? `${resolved.name} (${short(resolved.address)})` : short(resolved.address)) : "";

  return (
    <Dialog open={open} onOpenChange={(o) => step !== "sending" && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md bg-surface-overlay border-white/[0.06]">
        <DialogHeader>
          <DialogTitle className="text-gold">Send tokens</DialogTitle>
          <DialogDescription className="text-zinc-400">To any Starknet wallet, address or username.</DialogDescription>
        </DialogHeader>

        {balances.length === 0 ? (
          <p className="text-sm text-zinc-400">You have no tokens to send.</p>
        ) : step === "done" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md border border-green-700/50 bg-green-950/30 p-3 text-sm text-green-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Sent {amount && token ? formatTokenAmount(amount, token.decimals, token.displayDecimals) : ""} {label} to {recipientLabel}.
            </div>
            {txHash && <TxLink hash={txHash} />}
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        ) : step === "review" || step === "sending" ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-md border border-white/[0.08] bg-surface-raised p-3 text-sm">
              <Row k="Sending">
                <span className="inline-flex items-center gap-1.5">
                  {token && <TokenIcon symbol={token.symbol} size="sm" className="rounded-full" />}
                  {amount && token ? formatTokenAmount(amount, token.decimals, token.displayDecimals) : ""} {label}
                </span>
              </Row>
              <Row k="To">{resolved?.name ?? "Address"}</Row>
              <p className="break-all font-mono text-xs text-zinc-400">{resolved?.address}</p>
            </div>
            {undeployed && <Warn>No account is deployed at this address yet. Make sure it's right: tokens sent to a wrong address can't be recovered.</Warn>}
            {txError && <p className="text-xs text-red-400">{txError}</p>}
            {step === "sending" && txHash && <TxLink hash={txHash} />}
            <div className="flex justify-between gap-2">
              <Button variant="outline" disabled={step === "sending"} onClick={() => setStep("form")}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button disabled={step === "sending"} onClick={() => void send()} className="bg-[#fbcb4a] text-black hover:bg-[#f0b833]">
                {step === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {step === "sending" ? (txHash ? "Confirming…" : "Check your wallet…") : "Confirm & send"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!hasStrk && <Warn>You have no STRK. Starknet charges network fees in STRK, so this transfer may fail unless your wallet covers fees another way.</Warn>}

            <Field label="Token">
              <div className="flex flex-wrap gap-1.5">
                {balances.map((b) => {
                  const active = token && BigInt(b.address) === BigInt(token.address);
                  return (
                    <button
                      key={b.address}
                      type="button"
                      onClick={() => {
                        setTokenAddr(b.address);
                        setAmountInput("");
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                        active ? "border-[#fbcb4a]/60 bg-[#fbcb4a]/10 text-white" : "border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]"
                      }`}
                    >
                      <TokenIcon symbol={b.symbol} size="sm" className="rounded-full" />
                      {b.label ?? b.symbol}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Recipient">
              <Input
                placeholder="0x… address, username or name.brother"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="font-mono bg-surface-raised border-white/[0.08] text-zinc-100"
              />
              {resolving && (
                <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Loader2 className="h-3 w-3 animate-spin" /> Looking up…
                </p>
              )}
              {recipientError && <p className="text-xs text-red-400">{recipientError}</p>}
              {resolved && !resolving && (
                <p className="break-all font-mono text-xs text-green-400">
                  ✓ {resolved.name ? `${resolved.name} → ` : ""}
                  {resolved.address}
                </p>
              )}
              {resolved && undeployed && !resolving && (
                <p className="text-xs text-amber-400">No account is deployed at this address yet. Double-check it.</p>
              )}
            </Field>

            <Field label="Amount">
              <div className="flex gap-2">
                <Input
                  inputMode="decimal"
                  placeholder="0.0"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="bg-surface-raised border-white/[0.08] text-zinc-100"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!token}
                  onClick={() => token && setAmountInput(rawToInput(maxSendable(token.raw, token.address), token.decimals))}
                >
                  Max
                </Button>
              </div>
              {token && (
                <p className="text-xs text-zinc-500">
                  Balance: {formatTokenAmount(token.raw, token.decimals, token.displayDecimals)} {label}
                  {BigInt(token.address) === BigInt(STRK_ADDRESS) && " · Max keeps 2 STRK for fees"}
                </p>
              )}
              {amountError && <p className="text-xs text-red-400">{amountError}</p>}
            </Field>

            <div className="flex justify-end">
              <Button disabled={!canReview} onClick={() => setStep("review")} className="bg-[#fbcb4a] text-black hover:bg-[#f0b833]">
                Review
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      {children}
    </div>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-zinc-500">{k}</span>
      <span className="font-semibold text-zinc-100">{children}</span>
    </div>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-amber-600/40 bg-amber-950/30 p-2 text-xs text-amber-300">{children}</p>;
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={`https://voyager.online/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block text-xs text-zinc-400 hover:text-zinc-200 hover:underline"
    >
      View transaction on Voyager ↗
    </a>
  );
}
