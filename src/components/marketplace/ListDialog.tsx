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
  BEASTS_COLLECTION_ADDRESS,
  DEFAULT_LISTING_DURATION_SECONDS,
  LISTING_DURATION_OPTIONS,
  CLIENT_FEE_BP,
} from "../../services/marketplace/constants";
import { NAMESPACE, useMarketplace, useMarketplaceActions } from "@cartridge/marketplace";
import { getContractByName, parseDojoCall } from "@dojoengine/core";
import { toWei, fromWei, TOKEN_DECIMALS, formatPriceInSymbol } from "../../utils/price";
import { toast } from "sonner";
import { usePriceRates } from "../../services/marketplace/rates";

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
  const [duration, setDuration] = useState<string>(DEFAULT_DURATION_VALUE);
  const [customExpiration, setCustomExpiration] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { buildListCalls } = useMarketplaceActions();
  const [estimatedFee, setEstimatedFee] = useState<bigint | null>(null);
  const [estimatingFee, setEstimatingFee] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);
  const { data: priceRates } = usePriceRates();

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

  // Lock currency to the fee token (Cartridge default)
  const selectedToken = DEFAULT_PAYMENT_TOKEN;
  const currencyAddress = selectedToken.address;

  const toBigInt = (value: string) => {
    const trimmed = value.trim();
    return BigInt(trimmed.startsWith("0x") ? trimmed : trimmed);
  };

  // Convert human input to smallest units (wei) expected by marketplace
  const priceBigInt = useMemo(() => {
    const trimmed = price.trim();
    if (!trimmed) return null;
    const numericValue = Number.parseFloat(trimmed);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
    try {
      const decimals = TOKEN_DECIMALS[selectedToken.symbol] ?? 18;
      const wei = toWei(trimmed, decimals);
      return wei > 0n ? wei : null;
    } catch {
      return null;
    }
  }, [price, selectedToken]);

  const formatFee = (feeWei: bigint) => {
    return fromWei(feeWei, 18);
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
      // Enforce a maximum listing horizon (aligns with marketplace policies)
      const maxSeconds = nowSeconds + DEFAULT_LISTING_DURATION_SECONDS;
      if (seconds > maxSeconds) {
        return {
          expirationSeconds: null,
          error: `Max expiration is ${Math.floor(
            DEFAULT_LISTING_DURATION_SECONDS / (60 * 60 * 24)
          )} days from now.`,
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

        // Use Cartridge SDK's buildListCalls with quantity=0 for ERC721
        const [approvalCall, dojoCall] = buildListCalls(
          BEASTS_COLLECTION_ADDRESS,
          tokenIdBigInt,
          0n, // quantity = 0 for ERC721 (non-fungible)
          priceBigInt!,
          currencyAddress,
          expirationBigInt
        );
        const parsedListCall = (parseDojoCall as any)(provider.manifest, NAMESPACE, dojoCall);
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
      toast.error("Please enter a valid price greater than 0");
      return;
    }

    setSubmitting(true);
    setError(null);
    const toastId = toast.loading("Listing beast...");

    try {
      const rawTokenId = (beast.id.split(":").pop() || beast.id).trim();
      const tokenIdBigInt = toBigInt(rawTokenId);
      const expirationSeconds = expirationDetails.expirationSeconds;
      if (!expirationSeconds) {
        throw new Error("Invalid expiration selected");
      }
      const expirationBigInt = BigInt(expirationSeconds);
      const nowSeconds = Math.floor(Date.now() / 1000);
      const maxSeconds = nowSeconds + DEFAULT_LISTING_DURATION_SECONDS;
      if (expirationSeconds > maxSeconds) {
        throw new Error(
          `Max expiration is ${Math.floor(
            DEFAULT_LISTING_DURATION_SECONDS / (60 * 60 * 24)
          )} days from now.`
        );
      }

      // Use buildListCalls with quantity=0 for ERC721 (Cartridge mentioned "value" needs to be 0 for ERC721)
      const [approvalCall, listCall] = buildListCalls(
        BEASTS_COLLECTION_ADDRESS,
        tokenIdBigInt,
        0n, // quantity = 0 for ERC721 (non-fungible)
        priceBigInt,
        currencyAddress,
        expirationBigInt
      );

      // Parse the list call through Dojo
      const parsedListCall = (parseDojoCall as any)(provider.manifest, NAMESPACE, listCall);

      console.log('List calldata (quantity=0):', parsedListCall.calldata);

      await (account as any).execute([approvalCall, parsedListCall]);

      toast.success("Beast listed successfully!", { id: toastId });
      toast.info("Your listing will appear in the marketplace shortly...", { duration: 5000 });
      onOpenChange(false);
      setPrice("");
      setEstimatedFee(null);
      setFeeError(null);
      onListed?.();
    } catch (e) {
      const errorMessage = (e as Error).message || "Failed to list beast";

      // Check if user cancelled the transaction
      if (errorMessage.toLowerCase().includes("user") &&
          (errorMessage.toLowerCase().includes("reject") ||
           errorMessage.toLowerCase().includes("cancel") ||
           errorMessage.toLowerCase().includes("abort"))) {
        toast.info("Listing cancelled", { id: toastId });
      } else {
        setError(errorMessage);
        toast.error(errorMessage, { id: toastId });
      }
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
            Set your listing price and expiration for your beast.
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
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={`e.g., 1.5 ${selectedToken.symbol}`}
                className="mt-1"
              />
              {priceBigInt && priceBigInt > 0n && (
                <div className="mt-2 space-y-1">
                  {/* USDC Conversion */}
                  {priceRates && selectedToken.symbol.toUpperCase() !== 'USDC' && (
                    <div className="text-xs text-gray-400">
                      ≈ {formatPriceInSymbol(priceBigInt, selectedToken.symbol, 'USDC', priceRates)}
                    </div>
                  )}
                  {/* Listing Fee (Seller Pays) */}
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2 space-y-1">
                    <p className="text-xs text-amber-200 font-medium">Listing fee (paid by you):</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Platform fee (2%):</span>
                      <span className="text-white">{fromWei((priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n, TOKEN_DECIMALS[selectedToken.symbol] ?? 18)} {selectedToken.symbol}</span>
                    </div>
                    <div className="border-t border-amber-500/20 pt-1">
                      <p className="text-[10px] text-amber-200/80">Buyer will pay exactly your listing price ({fromWei(priceBigInt, TOKEN_DECIMALS[selectedToken.symbol] ?? 18)} {selectedToken.symbol}) - no additional fees.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-400">Currency</label>
              <div className="mt-1 text-sm">{selectedToken.symbol}</div>
              <div className="mt-1 text-[10px] text-gray-500 break-all">{currencyAddress}</div>
            </div>
            <div>
              <label className="text-sm text-gray-400">Listing duration</label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="mt-1 bg-black/50">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent className="bg-[#0b0b0f] border-gray-800">
                  {DURATION_SELECT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="focus:bg-gray-800/50">
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
            <div className="text-[10px] text-gray-500 break-all">
              Marketplace: {getContractByName(provider.manifest, NAMESPACE, "Marketplace").address}
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
