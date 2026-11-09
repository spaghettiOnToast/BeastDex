import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "@starknet-react/core";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Clock, Loader2, Sparkles, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { WalletFeeComparison } from "../marketplace/WalletFeeComparison";
import { NoticeBox } from "./TxNotices";
import { useGoldenPasses } from "../../hooks/useGoldenPasses";
import { useRecipient } from "../../hooks/useRecipient";
import { compareStarknetAddresses } from "../../utils/address";
import { isUserRejection } from "../../utils/transaction";
import { waitForTx } from "../../services/tx";
import {
  buildGoldenPassMintCall,
  formatCountdown,
  fetchGoldenPassStatus,
  formatReadyDate,
  GOLDEN_PASS_COOLDOWN_S,
  GOLDEN_TOKEN_IMAGE_URL,
  isCooldownError,
  waitForGoldenPassUsed,
} from "../../services/adventurers/goldenPass";

type Props = {
  open: boolean;
  onClose: () => void;
  /** called after at least one game was minted to the connected wallet */
  onMinted?: () => void;
};

type StepState = "queued" | "signing" | "confirming" | "done" | "failed" | "skipped" | "cooldown";
type Step = { tokenId: number; state: StepState; txHash?: string; note?: string; readyAt?: number | null };

const RECIPIENT_KEY = "beastdex:goldenPassRecipient";
/** tokenId → when we last sent a mint for it (kept across dialog opens for this page session). */
const recentlySubmitted = new Map<number, number>();
const RESUBMIT_GUARD_MS = 3 * 60_000;
const loadRecipient = () => {
  try {
    return localStorage.getItem(RECIPIENT_KEY) ?? "";
  } catch {
    return "";
  }
};
const saveRecipient = (v: string) => {
  try {
    if (v) localStorage.setItem(RECIPIENT_KEY, v);
    else localStorage.removeItem(RECIPIENT_KEY);
  } catch {
    /* storage unavailable */
  }
};

export function GoldenPassMintDialog({ open, onClose, onMinted }: Props) {
  const { address, account } = useAccount();
  const queryClient = useQueryClient();
  const golden = useGoldenPasses(open ? address : undefined);
  const [recipient, setRecipient] = useState(loadRecipient);
  const recip = useRecipient(recipient);
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const now = Math.floor(Date.now() / 1000);

  const passes = useMemo(() => golden.data?.passes ?? [], [golden.data]);
  const usable = useMemo(() => passes.filter((p) => p.usable), [passes]);
  // default selection: every usable token
  const chosen = useMemo(
    () => usable.filter((p) => (selected ? selected.has(p.tokenId) : true)).map((p) => p.tokenId),
    [usable, selected],
  );
  const nextReady = golden.data?.summary.nextReady ?? null;

  const to = recipient.trim() ? recip.resolved : (address ?? null);
  const toSelf = !!to && !!address && compareStarknetAddresses(to, address);
  const cooldownS = golden.data?.config.cooldownS ?? GOLDEN_PASS_COOLDOWN_S;
  const expiryDays = golden.data?.config.gameExpiryS ? Math.round(golden.data.config.gameExpiryS / 86_400) : null;

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setSteps(null);
    }
  }, [open]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev ?? usable.map((p) => p.tokenId));
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const update = (i: number, patch: Partial<Step>) => setSteps((prev) => prev && prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const mint = async () => {
    if (!account || !to || chosen.length === 0 || runningRef.current) return;
    runningRef.current = true;
    saveRecipient(recipient.trim());
    setRunning(true);
    const plan: Step[] = chosen.map((tokenId) => ({ tokenId, state: "queued" }));
    setSteps(plan);
    let minted = 0;
    try {
      for (let i = 0; i < plan.length; i++) {
        const { tokenId } = plan[i];
        // Check the chain right before signing (pre-confirmed state). Fail closed: if the token isn't
        // confirmed usable, nothing is sent to the wallet, because a reverted mint still costs gas.
        const status = await fetchGoldenPassStatus(tokenId, cooldownS).catch(() => null);
        if (!status) {
          update(i, { state: "skipped", note: "couldn't check it on chain, so nothing was sent. Try again" });
          continue;
        }
        if (!status.usable) {
          update(i, { state: "cooldown", readyAt: status.readyAt });
          continue;
        }
        // A mint sent moments ago may not be readable yet: never send a token twice in quick succession.
        const sentAt = recentlySubmitted.get(tokenId);
        if (sentAt && Date.now() - sentAt < RESUBMIT_GUARD_MS) {
          update(i, { state: "skipped", note: "sent moments ago, waiting for the chain" });
          continue;
        }
        update(i, { state: "signing" });
        let txHash: string | undefined;
        try {
          const res = await account.execute([buildGoldenPassMintCall(tokenId, to)]);
          txHash = res.transaction_hash;
          recentlySubmitted.set(tokenId, Date.now());
          update(i, { state: "confirming", txHash });
          const outcome = await waitForTx(txHash);
          if (outcome === "success" || (outcome === "timeout" && (await waitForGoldenPassUsed(tokenId)))) {
            minted++;
            update(i, { state: "done" });
          } else {
            const after = await fetchGoldenPassStatus(tokenId, cooldownS).catch(() => null);
            if (after && !after.usable) update(i, { state: "cooldown", readyAt: after.readyAt, txHash });
            else update(i, { state: "failed", note: outcome });
            break;
          }
        } catch (e) {
          if (isUserRejection(e)) {
            update(i, { state: "failed", note: "cancelled" });
            break;
          }
          if (isCooldownError(e)) {
            // The wallet's own simulation hit the cooldown: nothing was submitted.
            const after = await fetchGoldenPassStatus(tokenId, cooldownS).catch(() => null);
            update(i, { state: "cooldown", readyAt: after?.readyAt ?? null });
            continue;
          }
          // Some wallets report an error even though they submitted the transaction.
          // Treat the token as possibly sent, then confirm from the chain before moving on.
          recentlySubmitted.set(tokenId, Date.now());
          update(i, { state: "confirming", txHash, note: "wallet reported an error, checking the chain" });
          if (await waitForGoldenPassUsed(tokenId)) {
            minted++;
            update(i, { state: "done", note: "went through despite the wallet error" });
            continue;
          }
          update(i, { state: "failed", note: (e as Error).message?.slice(0, 120) || "failed" });
          break;
        }
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
      void queryClient.invalidateQueries({ queryKey: ["goldenPasses"] });
      if (minted > 0 && toSelf) onMinted?.();
    }
  };

  const doneCount = steps?.filter((s) => s.state === "done").length ?? 0;
  const finished = !!steps && !running;
  const cooldownCount = steps?.filter((s) => s.state === "cooldown" && !s.txHash).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="border border-white/[0.06] bg-surface-overlay">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gold">
            <img src={GOLDEN_TOKEN_IMAGE_URL} alt="" className="h-6 w-6" />
            Golden Tokens
          </DialogTitle>
          <DialogDescription>
            Each Golden Token mints one free Beast Mode game, then rests for{" "}
            {Math.round(cooldownS / 86_400)} days. Mint every ready token and send the games
            straight to any wallet, such as your Controller.
          </DialogDescription>
        </DialogHeader>

        {!address ? (
          <p className="text-sm text-zinc-400">Connect the wallet that holds your Golden Tokens.</p>
        ) : golden.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your Golden Tokens…
          </p>
        ) : golden.error ? (
          <p className="text-sm text-red-400">Couldn't load your Golden Tokens.</p>
        ) : passes.length === 0 ? (
          <p className="text-sm text-zinc-400">This wallet holds no Golden Tokens.</p>
        ) : (
          <div className="space-y-4">
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {(steps ?? passes.map((p) => ({ tokenId: p.tokenId }) as Step)).map((row) => {
                const p = passes.find((x) => x.tokenId === row.tokenId)!;
                return (
                  <label
                    key={row.tokenId}
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-white/[0.04]"
                  >
                    {steps ? (
                      <StepIcon state={row.state} />
                    ) : (
                      <input
                        type="checkbox"
                        disabled={!p.usable || running}
                        checked={p.usable && chosen.includes(p.tokenId)}
                        onChange={() => toggle(p.tokenId)}
                      />
                    )}
                    <span className="flex-1 font-medium text-zinc-200">Golden Token #{row.tokenId}</span>
                    {steps ? (
                      <span className="text-[11px] text-zinc-400">
                        {row.txHash ? (
                          <a className="underline" href={`https://voyager.online/tx/${row.txHash}`} target="_blank" rel="noopener noreferrer">
                            {stepLabel(row)}
                          </a>
                        ) : (
                          stepLabel(row)
                        )}
                      </span>
                    ) : p.usable ? (
                      <span className="text-[11px] font-semibold text-emerald-300">Ready</span>
                    ) : (
                      <span className="text-[11px] text-zinc-500">
                        {p.readyAt
                          ? `On cooldown · usable ${formatReadyDate(p.readyAt)} (in ${formatCountdown(p.readyAt - now)})`
                          : "Unavailable"}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {finished ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-zinc-200">
                  {doneCount === 0 ? "No games minted." : `${doneCount} game${doneCount === 1 ? "" : "s"} minted${toSelf ? "" : " and sent"}.`}
                  {cooldownCount > 0 &&
                    ` ${cooldownCount} token${cooldownCount === 1 ? " was" : "s were"} on cooldown, so nothing was sent to your wallet for ${cooldownCount === 1 ? "it" : "them"}.`}
                </p>
                <Button className="w-full" onClick={onClose}>
                  Done
                </Button>
              </div>
            ) : (
              <>
                {usable.length === 0 && (
                  <p className="text-xs text-zinc-400">
                    No token is ready
                    {nextReady ? `. The next one is usable ${formatReadyDate(nextReady)} (in ${formatCountdown(nextReady - now)})` : ""}.
                  </p>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="golden-recipient">
                      Send games to <span className="font-normal text-zinc-500">(optional)</span>
                    </Label>
                    {recipient.trim() && (
                      <button
                        type="button"
                        className="text-[11px] text-gold underline disabled:opacity-50"
                        disabled={running}
                        onClick={() => setRecipient("")}
                      >
                        Keep in this wallet
                      </button>
                    )}
                  </div>
                  <Input
                    id="golden-recipient"
                    placeholder="Leave empty to keep games in this wallet"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    disabled={running}
                  />
                  {recip.resolving && <p className="text-[11px] text-zinc-500">Looking up…</p>}
                  {recipient.trim() && recip.resolved && !recip.resolving && (
                    <p className="break-all font-mono text-[11px] text-zinc-400">→ {recip.resolved}</p>
                  )}
                  {!recipient.trim() && address && (
                    <div className="flex items-start gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-400/[0.06] px-2 py-1.5 text-[11px] leading-snug">
                      <CheckCircle2 className="mt-px h-3.5 w-3.5 flex-shrink-0 text-emerald-300" />
                      <span className="text-zinc-300">
                        <span className="font-semibold text-emerald-300">Empty = keep in this wallet</span>{" "}
                        <span className="font-mono text-zinc-400">
                          ({address.slice(0, 6)}…{address.slice(-4)})
                        </span>
                        , the one holding your Golden Tokens. To send them elsewhere, enter a 0x… address, Controller
                        username or name.brother.
                      </span>
                    </div>
                  )}
                  {recip.error && <p className="text-[11px] text-red-400">{recip.error}</p>}
                </div>

                <NoticeBox
                  tone="blue"
                  title="Before you mint"
                  items={[
                    chosen.length > 1
                      ? `The Beast Mode contract mints one Golden Token game per transaction, so your wallet asks you to approve ${chosen.length} transactions, one after another.`
                      : "Your wallet asks you to approve one transaction.",
                    "Each game is minted straight to the recipient, so there's no separate transfer.",
                    expiryDays && `Golden Token games must be played within ${expiryDays} days of minting.`,
                  ]}
                />

                {chosen.length > 0 && <WalletFeeComparison actions={{ goldenPassMint: 1 }} txCount={chosen.length} />}

                <Button
                  className="w-full border border-gold bg-gold/15 font-bold text-gold hover:bg-gold/20"
                  disabled={running || chosen.length === 0 || !to || recip.resolving || !account}
                  onClick={mint}
                >
                  {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {running
                    ? `Minting ${Math.min(doneCount + 1, chosen.length)} of ${chosen.length}…`
                    : `Mint ${chosen.length} game${chosen.length === 1 ? "" : "s"}`}
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function stepLabel(s: Step): string {
  switch (s.state) {
    case "queued":
      return "Waiting";
    case "signing":
      return "Approve in wallet…";
    case "confirming":
      return s.note ? `Confirming (${s.note})…` : "Confirming…";
    case "done":
      return s.note ? `Minted (${s.note})` : "Minted";
    case "cooldown":
      return s.readyAt ? `On cooldown · usable ${formatReadyDate(s.readyAt)}` : "On cooldown";
    case "skipped":
      return `Skipped${s.note ? ` (${s.note})` : ""}`;
    case "failed":
      return `Failed${s.note ? ` (${s.note})` : ""}`;
  }
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  if (state === "failed") return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  if (state === "cooldown") return <Clock className="h-3.5 w-3.5 text-amber-300" />;
  if (state === "signing" || state === "confirming") return <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />;
  return <Circle className="h-3.5 w-3.5 text-zinc-600" />;
}
