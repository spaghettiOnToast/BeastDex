import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { Listing } from "../../services/marketplace/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  DEFAULT_PAYMENT_TOKEN,
  PAYMENT_TOKENS,
  BEASTS_COLLECTION_ADDRESS,
  DEFAULT_LISTING_DURATION_SECONDS,
  LISTING_DURATION_OPTIONS,
  CLIENT_FEE_BP,
} from "../../services/marketplace/constants";
import { toWei, fromWei, TOKEN_DECIMALS, formatPriceInSymbol } from "../../utils/price";
import { toast } from "sonner";
import { editListingFlow } from "../../services/marketplace/flows";
import type { AccountInterface } from "starknet";
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
  listing: Listing | null;
  account: AccountInterface | undefined;
  cancel: any;
  list: any;
  onEdited?: () => void;
};

export default function EditListingDialog({
  open,
  onOpenChange,
  listing,
  account,
  cancel,
  list,
  onEdited,
}: Props) {
  const [price, setPrice] = useState("");
  const [tokenSym, setTokenSym] = useState<string>(DEFAULT_PAYMENT_TOKEN.symbol);
  const [duration, setDuration] = useState<string>(DEFAULT_DURATION_VALUE);
  const [customExpiration, setCustomExpiration] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: priceRates } = usePriceRates();

  useEffect(() => {
    if (open && listing) {
      // Pre-fill with current listing data
      const currentToken = PAYMENT_TOKENS.find(
        t => t.address.toLowerCase() === listing.paymentToken?.toLowerCase()
      );
      if (currentToken) {
        setTokenSym(currentToken.symbol);
        const decimals = TOKEN_DECIMALS[currentToken.symbol] ?? 18;
        const priceFormatted = fromWei(listing.price, decimals);
        setPrice(priceFormatted);
      }
      setDuration(DEFAULT_DURATION_VALUE);
      setCustomExpiration("");
      setError(null);
    }
  }, [open, listing]);

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

  const priceBigInt = useMemo(() => {
    const trimmed = price.trim();
    if (!trimmed) return null;

    const numericValue = Number.parseFloat(trimmed);
    if (Number.isNaN(numericValue) || numericValue <= 0) {
      return null;
    }

    try {
      const decimals = TOKEN_DECIMALS[selectedToken.symbol] ?? 18;
      const wei = toWei(trimmed, decimals);
      return wei > 0n ? wei : null;
    } catch {
      return null;
    }
  }, [price, selectedToken]);

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

  const canSubmit = useMemo(() => {
    return (
      !!account &&
      !!listing &&
      priceBigInt !== null &&
      !expirationDetails.error &&
      expirationDetails.expirationSeconds != null
    );
  }, [account, listing, priceBigInt, expirationDetails.error, expirationDetails.expirationSeconds]);

  const onSubmit = async () => {
    if (!account || !listing) return;
    if (priceBigInt === null) {
      toast.error("Please enter a valid price greater than 0");
      return;
    }

    setSubmitting(true);
    setError(null);
    const toastId = toast.loading("Updating listing...");

    try {
      const expirationSeconds = expirationDetails.expirationSeconds;
      if (!expirationSeconds) {
        throw new Error("Invalid expiration selected");
      }
      const expiration = BigInt(expirationSeconds);
      const quantity = listing.quantity ?? 1;

      await editListingFlow(
        { cancel, list },
        {
          account: account as any,
          collectionAddress: BEASTS_COLLECTION_ADDRESS,
          tokenId: listing.tokenId,
          orderId: listing.orderId ?? 0,
          newPrice: priceBigInt.toString(),
          currencyAddress,
          quantity,
          expiration,
        }
      );

      toast.success("Listing updated successfully!", { id: toastId });
      onOpenChange(false);
      setPrice("");
      onEdited?.();
    } catch (e) {
      const errorMessage = (e as Error).message || "Failed to update listing";
      setError(errorMessage);
      toast.error(errorMessage, { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0b0b0f] border-gray-800">
        <DialogHeader>
          <DialogTitle>Edit Listing</DialogTitle>
          <DialogDescription>
            Update the price and expiration for your listing.
          </DialogDescription>
        </DialogHeader>
        {!listing ? (
          <p className="text-sm text-gray-400">No listing selected.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-400">Beast</p>
              <p className="text-sm font-medium">{listing.beast?.name || `#${listing.tokenId}`}</p>
            </div>
            <div>
              <label className="text-sm text-gray-400">New Price</label>
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
                  {/* Buyer's Total Cost */}
                  <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-2 space-y-1">
                    <p className="text-xs text-blue-200 font-medium">Buyer will pay:</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Your listing:</span>
                      <span className="text-white">{fromWei(priceBigInt, TOKEN_DECIMALS[selectedToken.symbol] ?? 18)} {selectedToken.symbol}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Platform fee (2.5%):</span>
                      <span className="text-white">{fromWei((priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n, TOKEN_DECIMALS[selectedToken.symbol] ?? 18)} {selectedToken.symbol}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold border-t border-blue-500/20 pt-1">
                      <span className="text-blue-200">Total:</span>
                      <span className="text-blue-200">{fromWei(priceBigInt + (priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n, TOKEN_DECIMALS[selectedToken.symbol] ?? 18)} {selectedToken.symbol}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-400">Currency</label>
              <Select value={tokenSym} onValueChange={setTokenSym}>
                <SelectTrigger className="mt-1 bg-black/50">
                  <SelectValue placeholder="Select token" />
                </SelectTrigger>
                <SelectContent className="bg-[#0b0b0f] border-gray-800">
                  {PAYMENT_TOKENS.map((t) => (
                    <SelectItem key={t.symbol} value={t.symbol} className="focus:bg-gray-800/50">
                      <div className="flex items-center gap-2">
                        {t.logo && (
                          <img src={t.logo} alt={t.symbol} className="w-5 h-5 rounded-full" />
                        )}
                        <span>{t.symbol}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
                {submitting ? "Updating..." : "Update Listing"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
