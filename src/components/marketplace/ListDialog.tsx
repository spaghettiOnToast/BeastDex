import { useEffect, useMemo, useState } from "react";
import { useAccount } from "@starknet-react/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { Beast } from "../../services/beast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  DEFAULT_PAYMENT_TOKEN,
  PAYMENT_TOKENS,
  BEASTS_COLLECTION_ADDRESS,
  DEFAULT_LISTING_DURATION_SECONDS,
  LISTING_DURATION_OPTIONS,
} from "../../services/marketplace/constants";
import { NAMESPACE, useMarketplace, useMarketplaceActions } from "@cartridge/marketplace";
import { parseDojoCall } from "@dojoengine/core";

const CUSTOM_DURATION_VALUE = "custom";

const DURATION_SELECT_OPTIONS = [
  ...LISTING_DURATION_OPTIONS.map((option) => ({
    label: option.label,
    value: String(option.value),
  })),
  { label: "Custom date…", value: CUSTOM_DURATION_VALUE },
] as const;

const DEFAULT_DURATION_VALUE = String(DEFAULT_LISTING_DURATION_SECONDS);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beast: Beast | null;
  onListed?: () => void;
};

export default function ListDialog({ open, onOpenChange, beast, onListed }: Props) {
  const { account } = useAccount();
  const { provider } = useMarketplace();
  const [price, setPrice] = useState("");
  const [tokenSym, setTokenSym] = useState<string>(DEFAULT_PAYMENT_TOKEN.symbol);
  const [duration, setDuration] = useState<string>(DEFAULT_DURATION_VALUE);
  const [customExpiration, setCustomExpiration] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { list, buildListCalls } = useMarketplaceActions();
  const [estimatedFee, setEstimatedFee] = useState<bigint | null>(null);
  const [estimatingFee, setEstimatingFee] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDuration(DEFAULT_DURATION_VALUE);
      setCustomExpiration("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (duration !== CUSTOM_DURATION_VALUE) {
      setCustomExpiration("");
    }
  }, [duration]);

  const selectedToken = useMemo(
    () => PAYMENT_TOKENS.find((t) => t.symbol === tokenSym) ?? DEFAULT_PAYMENT_TOKEN,
    [tokenSym]
  );
  const currencyAddress = selectedToken.address ?? DEFAULT_PAYMENT_TOKEN.address;

  const toBigInt = (value: string) => {
    const trimmed = value.trim();
    return BigInt(trimmed.startsWith("0x") ? trimmed : trimmed);
  };

  const priceBigInt = useMemo(() => {
    const trimmed = price.trim();
    if (!trimmed) return null;
    try {
      return toBigInt(trimmed);
    } catch {
      return null;
    }
  }, [price]);

  const formatFee = (feeWei: bigint) => {
    const decimals = 18;
    const feeString = feeWei.toString();
    const negative = feeString.startsWith("-");
    const digits = negative ? feeString.slice(1) : feeString;
    const padded = digits.padStart(decimals + 1, "0");
    const intPart = padded.slice(0, -decimals);
    const fracPartRaw = padded.slice(-decimals).replace(/0+$/, "");
    const fracPart = fracPartRaw.slice(0, 6); // limit to 6 decimals for display
    const formatted = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
    return negative ? `-${formatted}` : formatted;
  };

  const toLocalInputValue = (date: Date) => {
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
  };

  const minCustomExpiration = useMemo(() => {
    return toLocalInputValue(new Date(Date.now() + 60 * 1000));
  }, [open]);

  const expirationDetails = useMemo(() => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (duration === CUSTOM_DURATION_VALUE) {
      if (!customExpiration) {
        return {
          expirationSeconds: null,
          error: "Select an expiration date and time.",
          preview: null,
        };
      }
      const parsed = Date.parse(customExpiration);
      if (Number.isNaN(parsed)) {
        return {
          expirationSeconds: null,
          error: "Unable to parse the chosen date.",
          preview: null,
        };
      }
      const seconds = Math.floor(parsed / 1000);
      if (seconds <= nowSeconds) {
        return {
          expirationSeconds: null,
          error: "Expiration must be in the future.",
          preview: null,
        };
      }
      return {
        expirationSeconds: seconds,
        error: null,
        preview: new Date(seconds * 1000).toLocaleString(),
      };
    }

    const parsedDuration = Number.parseInt(duration, 10);
    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      return {
        expirationSeconds: null,
        error: "Choose a valid listing duration.",
        preview: null,
      };
    }
    const seconds = nowSeconds + parsedDuration;
    return {
      expirationSeconds: seconds,
      error: null,
      preview: new Date(seconds * 1000).toLocaleString(),
    };
  }, [customExpiration, duration]);

  useEffect(() => {
    if (!open) {
      setEstimatedFee(null);
      setFeeError(null);
      return;
    }
    if (
      !account?.address ||
      !beast ||
      priceBigInt === null ||
      !expirationDetails.expirationSeconds
    ) {
      setEstimatedFee(null);
      setFeeError(null);
      return;
    }

    let cancelled = false;
    setEstimatingFee(true);
    setFeeError(null);

    const timeoutId = window.setTimeout(async () => {
      try {
        const rawTokenId = (beast.id.split(":").pop() || beast.id).trim();
        const tokenIdBigInt = toBigInt(rawTokenId);
        const expirationBigInt = BigInt(expirationDetails.expirationSeconds!);

        const [approvalCall, dojoCall] = buildListCalls(
          BEASTS_COLLECTION_ADDRESS,
          tokenIdBigInt,
          1n,
          priceBigInt,
          currencyAddress,
          expirationBigInt
        );

        const parsedListCall = parseDojoCall(
          provider.manifest,
          NAMESPACE,
          dojoCall
        );

        const calls = [approvalCall, parsedListCall];

        const accountWithEstimate = account as any;
        if (typeof accountWithEstimate?.estimateInvokeFee !== "function") {
          throw new Error("Connected wallet cannot estimate fees");
        }

        let fee: any = null;
        let lastError: unknown = null;
        const estimationOptions = [
          { blockIdentifier: "latest" } as const,
          undefined,
        ];
        for (const options of estimationOptions) {
          try {
            fee = await accountWithEstimate.estimateInvokeFee(
              calls,
              options
            );
            lastError = null;
            break;
          } catch (estimateErr) {
            const message = String(
              (estimateErr as Error)?.message ?? estimateErr ?? ""
            ).toLowerCase();
            if (
              message.includes("invalid block id") ||
              message.includes("invalid params")
            ) {
              lastError = estimateErr;
              continue;
            }
            throw estimateErr;
          }
        }

        if (!fee) {
          const fallbackError =
            lastError instanceof Error
              ? lastError
              : new Error("Unable to estimate fee");
          throw fallbackError;
        }
        if (!cancelled) {
          const value =
            fee?.suggestedMaxFee ??
            fee?.overall_fee ??
            (typeof fee === "bigint" ? fee : null);
          setEstimatedFee(value ?? null);
        }
      } catch (estimateError) {
        console.error("Failed to estimate listing fee", estimateError);
        if (!cancelled) {
          setEstimatedFee(null);
          setFeeError(
            estimateError instanceof Error
              ? estimateError.message
              : "Unable to estimate fee"
          );
        }
      } finally {
        if (!cancelled) {
          setEstimatingFee(false);
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    open,
    account?.address,
    beast,
    priceBigInt,
    currencyAddress,
    expirationDetails.expirationSeconds,
    buildListCalls,
    provider,
  ]);

  const canSubmit = useMemo(() => {
    return (
      !!account &&
      !!beast &&
      priceBigInt !== null &&
      !expirationDetails.error &&
      expirationDetails.expirationSeconds != null
    );
  }, [account, beast, priceBigInt, expirationDetails.error, expirationDetails.expirationSeconds]);

  const onSubmit = async () => {
    if (!account || !beast) return;
    if (priceBigInt === null) {
      setError("Enter a valid price");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const rawTokenId = (beast.id.split(":").pop() || beast.id).trim();
      const tokenIdBigInt = toBigInt(rawTokenId);
      const expirationSeconds = expirationDetails.expirationSeconds;
      if (!expirationSeconds) {
        throw new Error("Invalid expiration selected");
      }
      const expirationBigInt = BigInt(expirationSeconds);

      await list(
        account as any,
        BEASTS_COLLECTION_ADDRESS,
        tokenIdBigInt,
        1n,
        priceBigInt,
        currencyAddress,
        expirationBigInt
      );
      onOpenChange(false);
      setPrice("");
      setEstimatedFee(null);
      setFeeError(null);
      onListed?.();
    } catch (e) {
      setError((e as Error).message || "Failed to list beast");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0b0b0f] border-gray-800">
        <DialogHeader>
          <DialogTitle>List Beast for Sale</DialogTitle>
          <DialogDescription>
            Choose a price and expiration for your listing. Prices must be entered in the
            payment token's base units (wei for STRK).
          </DialogDescription>
        </DialogHeader>
        {!beast ? (
          <p className="text-sm text-gray-400">No beast selected.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-400">Beast</p>
              <p className="text-sm font-medium">{beast.name}</p>
            </div>
            <div>
              <label className="text-sm text-gray-400">Price</label>
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Enter price"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400">Currency</label>
              <Select value={tokenSym} onValueChange={setTokenSym}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select token" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TOKENS.map((t) => (
                    <SelectItem key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-gray-400">Listing duration</label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_SELECT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {duration === CUSTOM_DURATION_VALUE ? (
                <div className="mt-3 space-y-1">
                  <Input
                    type="datetime-local"
                    value={customExpiration}
                    onChange={(event) => setCustomExpiration(event.target.value)}
                    min={minCustomExpiration}
                    className="w-full"
                  />
                  <p className="text-[11px] text-gray-500">
                    Times are interpreted in your local timezone.
                  </p>
                </div>
              ) : null}
              {expirationDetails.preview ? (
                <p className="mt-2 text-xs text-gray-400">
                  Expires {expirationDetails.preview}
                </p>
              ) : null}
              {expirationDetails.error ? (
                <p className="mt-2 text-xs text-red-400">{expirationDetails.error}</p>
              ) : null}
            </div>
            <div className="rounded-md border border-gray-800 bg-black/30 px-3 py-2 text-xs text-gray-300">
              {estimatingFee ? (
                <span>Estimating network fee…</span>
              ) : estimatedFee != null ? (
                <span>
                  Estimated network fee: ~{formatFee(estimatedFee)} STRK
                </span>
              ) : feeError ? (
                <span className="text-red-400">Fee unavailable: {feeError}</span>
              ) : (
                <span>Enter a price to view the estimated network fee.</span>
              )}
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
                {submitting ? "Submitting..." : "List"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
