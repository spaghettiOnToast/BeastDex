import { useCallback, useEffect, useMemo, useState, useRef } from "react";
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
} from "../../services/marketplace/constants";
import { toWei, fromWei } from "../../utils/price";
import { toast } from "sonner";
import type { AccountInterface, BigNumberish } from "starknet";
import TokenSelect from "./TokenSelect";
import { useSelectedToken, tokenAmountToUsd } from "../../hooks/useEkuboTokens";
import { isUserRejection } from "../../utils/transaction";
import {
  useExpirationDetails,
  DURATION_SELECT_OPTIONS,
} from "../../hooks/useExpirationDetails";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toastIdRef = useRef<string | number | null>(null);
  const submittingRef = useRef(false);

  // Get token info from Ekubo
  const { decimals: tokenDecimals, symbol: tokenSymbol, usdPrice } = useSelectedToken(currencyAddress);

  // Use shared expiration hook
  const {
    duration,
    setDuration,
    customExpiration,
    setCustomExpiration,
    minCustomExpiration,
    expirationDetails,
    isCustomDuration,
    reset: resetExpiration,
  } = useExpirationDetails();

  useEffect(() => {
    if (open && listing) {
      // Pre-fill with current listing data
      if (listing.paymentToken) {
        setCurrencyAddress(listing.paymentToken);
      }
      // Format price using the listing's token decimals (will update when tokenDecimals loads)
      const priceFormatted = fromWei(listing.price, tokenDecimals);
      setPrice(priceFormatted);
      resetExpiration();
      setError(null);
    }
  }, [open, listing, tokenDecimals, resetExpiration]);

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

  const canSubmit = useMemo(() => {
    return (
      !!account &&
      !!listing &&
      priceBigInt !== null &&
      !expirationDetails.error &&
      expirationDetails.expirationSeconds != null
    );
  }, [account, listing, priceBigInt, expirationDetails.error, expirationDetails.expirationSeconds]);

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
      <DialogContent className="bg-surface-overlay border border-white/[0.06]">
        <DialogHeader>
          <DialogTitle>Edit Listing</DialogTitle>
          <DialogDescription>
            Update the price and expiration for your listing.
          </DialogDescription>
        </DialogHeader>
        {!listing ? (
          <p className="text-sm text-zinc-400">No listing selected.</p>
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
              <p className="text-sm text-zinc-400">Beast</p>
              <p className="text-sm font-medium">{listing.beast?.name || `#${listing.tokenId}`}</p>
            </div>
            <div>
              <label className="text-sm text-zinc-400">New Price</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={`e.g., 1.5 ${tokenSymbol}`}
                className="mt-1"
              />
              {priceBigInt && priceBigInt > 0n && usdPrice && (
                <p className="text-xs text-zinc-400 mt-1">
                  ≈ ${tokenAmountToUsd(priceBigInt, tokenDecimals, usdPrice).toFixed(2)} USD
                </p>
              )}
            </div>
            <div>
              <label className="text-sm text-zinc-400">Currency</label>
              <TokenSelect
                value={currencyAddress}
                onValueChange={setCurrencyAddress}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Listing duration</label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="mt-1 bg-surface/50">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent className="bg-surface-overlay border border-white/[0.06]">
                  {DURATION_SELECT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="focus:bg-white/[0.06]">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isCustomDuration ? (
                <div className="mt-3">
                  <Input
                    type="date"
                    value={customExpiration}
                    onChange={(event) => setCustomExpiration(event.target.value)}
                    min={minCustomExpiration}
                    className="w-full"
                  />
                </div>
              ) : null}
              {expirationDetails.preview ? (
                <p className="mt-2 text-xs text-zinc-400">
                  Expires {expirationDetails.preview}
                </p>
              ) : null}
              {expirationDetails.error ? (
                <p className="mt-2 text-xs text-red-400">{expirationDetails.error}</p>
              ) : null}
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
                className="border-white/[0.10] hover:border-white/[0.15]"
              >
                Cancel
              </Button>
              <Button
                onClick={onSubmit}
                disabled={!canSubmit || submitting}
                className="bg-gold/15 text-gold border border-gold hover:bg-gold/20"
              >
                {submitting ? "Updating..." : "Update Listing"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
