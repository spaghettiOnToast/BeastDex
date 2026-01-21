import { useEffect, useMemo, useState, useRef, useCallback } from "react";
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
  BEASTS_COLLECTION_ADDRESS,
  DEFAULT_LISTING_DURATION_SECONDS,
  LISTING_DURATION_OPTIONS,
} from "../../services/marketplace/constants";
import { toWei, fromWei } from "../../utils/price";
import { toast } from "sonner";
import type { AccountInterface, BigNumberish } from "starknet";
import TokenSelect from "./TokenSelect";
import { useSelectedToken } from "../../hooks/useEkuboTokens";

// Error messages that indicate user rejection
const USER_REJECTION_PATTERNS = [
  "user abort",
  "user rejected",
  "user denied",
  "user cancelled",
  "rejected by user",
  "transaction was rejected",
  "cancel",
];

const CUSTOM_DURATION_VALUE = "custom";

const DURATION_SELECT_OPTIONS = [
  ...LISTING_DURATION_OPTIONS.map((option) => ({
    label: option.label,
    value: String(option.value),
  })),
  { label: "Custom date…", value: CUSTOM_DURATION_VALUE },
] as const;

const DEFAULT_DURATION_VALUE = String(DEFAULT_LISTING_DURATION_SECONDS);

type EditListingFn = (
  account: AccountInterface,
  orderId: BigNumberish,
  collection: string,
  tokenId: BigNumberish,
  quantity: BigNumberish,
  newPrice: BigNumberish,
  currency: string,
  expiration: BigNumberish
) => Promise<unknown>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: Listing | null;
  account: AccountInterface | undefined;
  editListing: EditListingFn;
  onEdited?: (result?: { tokenId: string; beastName: string; newPrice: string; currency: string }) => void;
};

export default function EditListingDialog({
  open,
  onOpenChange,
  listing,
  account,
  editListing,
  onEdited,
}: Props) {
  const [price, setPrice] = useState("");
  const [currencyAddress, setCurrencyAddress] = useState<string>(DEFAULT_PAYMENT_TOKEN.address);
  const [duration, setDuration] = useState<string>(DEFAULT_DURATION_VALUE);
  const [customExpiration, setCustomExpiration] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toastIdRef = useRef<string | number | null>(null);
  const submittingRef = useRef(false);

  // Get token info from Ekubo
  const { decimals: tokenDecimals, symbol: tokenSymbol } = useSelectedToken(currencyAddress);

  useEffect(() => {
    if (open && listing) {
      // Pre-fill with current listing data
      if (listing.paymentToken) {
        setCurrencyAddress(listing.paymentToken);
      }
      // Format price using the listing's token decimals (will update when tokenDecimals loads)
      const priceFormatted = fromWei(listing.price, tokenDecimals);
      setPrice(priceFormatted);
      setDuration(DEFAULT_DURATION_VALUE);
      setCustomExpiration("");
      setError(null);
    }
  }, [open, listing, tokenDecimals]);

  useEffect(() => {
    if (duration !== CUSTOM_DURATION_VALUE) {
      setCustomExpiration("");
    }
  }, [duration]);

  const priceBigInt = useMemo(() => {
    const trimmed = price.trim();
    if (!trimmed) return null;

    const numericValue = Number.parseFloat(trimmed);
    if (Number.isNaN(numericValue) || numericValue <= 0) {
      return null;
    }

    try {
      const wei = toWei(trimmed, tokenDecimals);
      return wei > 0n ? wei : null;
    } catch {
      return null;
    }
  }, [price, tokenDecimals]);

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

  const isUserRejection = useCallback((error: Error): boolean => {
    const message = error.message?.toLowerCase() || "";
    return USER_REJECTION_PATTERNS.some(pattern => message.includes(pattern));
  }, []);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    // If closing while submitting, dismiss toast and show cancelled
    if (!newOpen && submittingRef.current) {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toast.info("Update cancelled");
        toastIdRef.current = null;
      }
      setSubmitting(false);
      submittingRef.current = false;
    }
    onOpenChange(newOpen);
  }, [onOpenChange]);

  const onSubmit = async () => {
    if (!account || !listing) return;
    if (priceBigInt === null) {
      toast.error("Please enter a valid price greater than 0");
      return;
    }

    setSubmitting(true);
    submittingRef.current = true;
    setError(null);
    const toastId = toast.loading("Updating listing...");
    toastIdRef.current = toastId;

    try {
      const expirationSeconds = expirationDetails.expirationSeconds;
      if (!expirationSeconds) {
        throw new Error("Invalid expiration selected");
      }
      const expiration = BigInt(expirationSeconds);
      const quantity = listing.quantity ?? 1;

      // Use atomic editListing - combines cancel + list in single transaction
      await editListing(
        account,
        listing.orderId ?? 0,
        BEASTS_COLLECTION_ADDRESS,
        listing.tokenId,
        quantity,
        priceBigInt.toString(),
        currencyAddress,
        expiration
      );

      toast.success("Listing updated successfully!", { id: toastId });
      toastIdRef.current = null;
      onOpenChange(false);
      setPrice("");
      onEdited?.({
        tokenId: listing.tokenId,
        beastName: listing.beast?.name || `Beast #${listing.tokenId}`,
        newPrice: price,
        currency: tokenSymbol,
      });
    } catch (e) {
      const err = e as Error;

      if (isUserRejection(err)) {
        // User rejected the transaction
        toast.info("Transaction cancelled by user", { id: toastId });
      } else {
        const errorMessage = err.message || "Failed to update listing";
        setError(errorMessage);
        toast.error(errorMessage, { id: toastId });
      }
      toastIdRef.current = null;
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            {listing.beast?.image && (
              <div className="flex justify-center">
                <img
                  src={listing.beast.image}
                  alt={listing.beast.name}
                  className="max-w-[200px] w-full rounded-lg"
                />
              </div>
            )}
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
                placeholder={`e.g., 1.5 ${tokenSymbol}`}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400">Currency</label>
              <TokenSelect
                value={currencyAddress}
                onValueChange={setCurrencyAddress}
                className="mt-1"
              />
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
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
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
