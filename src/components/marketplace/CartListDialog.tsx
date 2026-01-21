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
  CLIENT_FEE_RECEIVER,
} from "../../services/marketplace/constants";
import { NAMESPACE, useMarketplace, useMarketplaceActions } from "@cartridge/marketplace";
import { parseDojoCall } from "@dojoengine/core";
import { toWei, fromWei } from "../../utils/price";
import { X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Listing } from "../../services/marketplace/types";
import TokenSelect from "./TokenSelect";
import { useSelectedToken } from "../../hooks/useEkuboTokens";

const CUSTOM_DURATION_VALUE = "custom";

const DURATION_SELECT_OPTIONS = [
  ...LISTING_DURATION_OPTIONS.map((option) => ({
    label: option.label,
    value: String(option.value),
  })),
  { label: "Custom date…", value: CUSTOM_DURATION_VALUE },
] as const;

const DEFAULT_DURATION_VALUE = String(DEFAULT_LISTING_DURATION_SECONDS);

type ListingResult = {
  tokenId: string;
  beastName: string;
  price: string;
  currency: string;
  txHash?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beasts: Beast[];
  onListed?: (results: ListingResult[]) => void;
  onRemoveBeast?: (beastId: string) => void;
  onClearCart?: () => void;
  existingListings?: Listing[]; // Pass current listings to check for duplicates
};

export default function CartListDialog({
  open,
  onOpenChange,
  beasts,
  onListed,
  onRemoveBeast,
  onClearCart,
  existingListings = [],
}: Props) {
  const { account } = useAccount();
  const [beastPrices, setBeastPrices] = useState<Map<string, string>>(new Map());
  const [currencyAddress, setCurrencyAddress] = useState<string>(DEFAULT_PAYMENT_TOKEN.address);
  const [duration, setDuration] = useState<string>(DEFAULT_DURATION_VALUE);
  const [customExpiration, setCustomExpiration] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const marketplace = useMarketplace();
  const { buildListCalls } = useMarketplaceActions();

  // Get token info from Ekubo
  const { decimals: tokenDecimals, symbol: tokenSymbol } = useSelectedToken(currencyAddress);

  // Check which beasts are already listed
  const alreadyListedTokenIds = useMemo(() => {
    const activeListings = existingListings.filter(l => l.status === 'active');
    return new Set(activeListings.map(l => l.tokenId));
  }, [existingListings]);

  // Separate beasts into already listed and available to list
  const { alreadyListed, availableToList } = useMemo(() => {
    const listed: Beast[] = [];
    const available: Beast[] = [];

    beasts.forEach(beast => {
      const tokenId = beast.id.split(':').pop() || beast.id;
      if (alreadyListedTokenIds.has(tokenId)) {
        listed.push(beast);
      } else {
        available.push(beast);
      }
    });

    return { alreadyListed: listed, availableToList: available };
  }, [beasts, alreadyListedTokenIds]);

  useEffect(() => {
    if (open) {
      setDuration(DEFAULT_DURATION_VALUE);
      setCustomExpiration("");
      // Default to the primary currency
      setCurrencyAddress(DEFAULT_PAYMENT_TOKEN.address);
      setError(null);
      // Initialize empty prices for all beasts
      const initialPrices = new Map<string, string>();
      beasts.forEach((beast) => {
        if (!beastPrices.has(beast.id)) {
          initialPrices.set(beast.id, "");
        } else {
          initialPrices.set(beast.id, beastPrices.get(beast.id) || "");
        }
      });
      setBeastPrices(initialPrices);
    }
  }, [open, beasts]);

  useEffect(() => {
    if (duration !== CUSTOM_DURATION_VALUE) {
      setCustomExpiration("");
    }
  }, [duration]);

  const toBigInt = (value: string) => {
    const trimmed = value.trim();
    return BigInt(trimmed.startsWith("0x") ? trimmed : trimmed);
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

  const handlePriceChange = (beastId: string, price: string) => {
    setBeastPrices((prev) => new Map(prev).set(beastId, price));
  };

  const canSubmit = useMemo(() => {
    if (!account || availableToList.length === 0 || expirationDetails.error) {
      return false;
    }
    // All available beasts must have a valid price
    return availableToList.every((beast) => {
      const price = beastPrices.get(beast.id);
      return price && price.trim().length > 0 && Number.parseFloat(price) > 0;
    });
  }, [account, availableToList, beastPrices, expirationDetails.error]);

  const onSubmit = async () => {
    if (!account || availableToList.length === 0) return;

    // Final check: don't allow listing if any beasts are already listed
    if (alreadyListed.length > 0) {
      toast.error(`Cannot list: ${alreadyListed.length} beast(s) already listed. Remove them from cart first.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    const toastId = toast.loading(`Listing ${availableToList.length} beasts...`);
    const successfulBeasts: Beast[] = [];
    const listingResults: ListingResult[] = [];
    const failedBeasts: Array<{ beast: Beast; error: string }> = [];

    try {
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

      // Build all calls for batching into a single multicall transaction
      const allCalls: any[] = [];
      const beastCallMap: Map<number, Beast> = new Map(); // Track which calls belong to which beast

      for (let i = 0; i < availableToList.length; i++) {
        const beast = availableToList[i];
        try {
          const priceStr = beastPrices.get(beast.id);
          if (!priceStr || priceStr.trim().length === 0) {
            throw new Error(`Missing price for ${beast.name}`);
          }
          // Convert to smallest units (wei)
          const numeric = Number.parseFloat(priceStr);
          if (!Number.isFinite(numeric) || numeric <= 0) {
            throw new Error(`Invalid price for ${beast.name}`);
          }
          const decimals = tokenDecimals;
          const priceBigInt = toWei(priceStr, decimals);
          const rawTokenId = (beast.id.split(":").pop() || beast.id).trim();
          const tokenIdBigInt = toBigInt(rawTokenId);

          console.log('📝 Preparing to list beast:', {
            name: beast.name,
            tokenId: tokenIdBigInt.toString(),
            price: priceBigInt.toString(),
            priceFormatted: priceStr,
            currency: tokenSymbol,
            currencyAddress,
            expiration: expirationBigInt.toString(),
            expirationDate: new Date(Number(expirationBigInt) * 1000).toLocaleString(),
            collection: BEASTS_COLLECTION_ADDRESS,
          });

          // Use buildListCalls with quantity=0 for ERC721
          const [approvalCall, listCall] = buildListCalls(
            BEASTS_COLLECTION_ADDRESS,
            tokenIdBigInt,
            0n, // quantity = 0 for ERC721 (non-fungible)
            priceBigInt,
            currencyAddress,
            expirationBigInt
          );

          // Parse the list call through Dojo
          const parsedListCall = (parseDojoCall as any)(marketplace.provider.manifest, NAMESPACE, listCall);

          // Calculate platform fee (2% of listing price)
          const feeAmount = (priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n;
          const UINT128_MASK = (1n << 128n) - 1n;
          const feeLow = feeAmount & UINT128_MASK;
          const feeHigh = feeAmount >> 128n;

          // Build ERC20 transfer call for platform fee
          const feeTransferCall = {
            contractAddress: currencyAddress,
            entrypoint: "transfer",
            calldata: [
              CLIENT_FEE_RECEIVER,
              feeLow.toString(),
              feeHigh.toString(),
            ],
          };

          console.log(`Adding calls for ${beast.name} (${i}):`, { approvalCall, feeTransferCall, parsedListCall });

          // Add to batch - track the index for this beast's calls (3 calls per beast: approve, fee, list)
          const callIndex = allCalls.length;
          beastCallMap.set(callIndex, beast);
          beastCallMap.set(callIndex + 1, beast);
          beastCallMap.set(callIndex + 2, beast);

          allCalls.push(approvalCall, feeTransferCall, parsedListCall);

          // Pre-populate success for validation
          successfulBeasts.push(beast);
          listingResults.push({
            tokenId: rawTokenId,
            beastName: beast.name || `Beast #${rawTokenId}`,
            price: priceStr,
            currency: tokenSymbol,
          });
        } catch (beastError) {
          console.error('❌ Failed to prepare listing for beast:', beast.name, beastError);
          failedBeasts.push({
            beast,
            error: (beastError as Error).message || "Failed to prepare listing"
          });
        }
      }

      // Execute all listings in a single multicall transaction
      if (allCalls.length > 0) {
        try {
          console.log(`🚀 Executing multicall with ${allCalls.length} calls for ${successfulBeasts.length} beasts...`);
          const result = await (account as any).execute(allCalls);

          // Extract transaction hash
          const extractTxHash = (res: any): string | undefined =>
            res?.transaction_hash || res?.hash || res?.txHash || res?.transactionHash;
          const txHash = extractTxHash(result);

          console.log('✅ Successfully executed multicall! TX:', txHash);

          // Update all listing results with the transaction hash
          listingResults.forEach(lr => {
            lr.txHash = txHash;
          });
        } catch (error) {
          console.error('❌ Multicall transaction failed:', error);
          // If the batch fails, mark all as failed
          failedBeasts.push(...successfulBeasts.map(b => ({
            beast: b,
            error: (error as Error).message || "Batch transaction failed"
          })));
          successfulBeasts.length = 0;
          listingResults.length = 0;
        }
      }

      // Show results
      if (successfulBeasts.length === availableToList.length) {
        toast.success(`Successfully listed all ${availableToList.length} beasts!`, { id: toastId });
        toast.info("Your listings will appear in the marketplace shortly...", { duration: 5000 });
        onOpenChange(false);
        setBeastPrices(new Map());
        onClearCart?.();
      } else if (successfulBeasts.length > 0) {
        toast.warning(
          `Listed ${successfulBeasts.length} of ${availableToList.length} beasts. ${failedBeasts.length} failed.`,
          { id: toastId }
        );
        // Remove only successful beasts from cart
        if (onRemoveBeast) {
          successfulBeasts.forEach(b => onRemoveBeast(b.id));
        }
        setError(`Failed to list: ${failedBeasts.map(f => f.beast.name).join(", ")}`);
      } else {
        toast.error("Failed to list any beasts", { id: toastId });
        setError(failedBeasts[0]?.error || "Failed to list beasts");
      }

      // Pass listing results back to parent
      if (listingResults.length > 0) {
        onListed?.(listingResults);
      }
    } catch (e) {
      const errorMessage = (e as Error).message || "Failed to list beasts";
      setError(errorMessage);
      toast.error(errorMessage, { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0b0b0f] border-gray-800 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>List Multiple Beasts</DialogTitle>
          <DialogDescription>
            Set prices for {beasts.length} beast{beasts.length !== 1 ? "s" : ""} to list them all at once.
          </DialogDescription>
        </DialogHeader>
        {beasts.length === 0 ? (
          <p className="text-sm text-gray-400">No beasts in cart.</p>
        ) : (
          <div className="space-y-4">
            {/* Warning for already listed beasts */}
            {alreadyListed.length > 0 && (
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-orange-200">
                    <p className="font-semibold">Already Listed ({alreadyListed.length})</p>
                    <p className="mt-1">
                      {alreadyListed.map(b => b.name).join(', ')} {alreadyListed.length === 1 ? 'is' : 'are'} already listed on the marketplace.
                      Remove {alreadyListed.length === 1 ? 'it' : 'them'} from cart to continue.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Beast price inputs */}
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {beasts.map((beast) => {
                const tokenId = beast.id.split(':').pop() || beast.id;
                const isAlreadyListed = alreadyListedTokenIds.has(tokenId);

                return (
                  <div
                    key={beast.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      isAlreadyListed
                        ? 'border-orange-500/30 bg-orange-500/10'
                        : 'border-gray-800 bg-gray-900/50'
                    }`}
                  >
                    {beast.image && (
                      <img
                        src={beast.image}
                        alt={beast.name}
                        className="w-16 h-16 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{beast.name}</p>
                        {isAlreadyListed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 uppercase font-bold whitespace-nowrap">
                            Listed
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">ID: {beast.numericId}</p>
                      {!isAlreadyListed && beastPrices.get(beast.id) && (() => {
                        const priceStr = beastPrices.get(beast.id) || "";
                        const priceNum = Number.parseFloat(priceStr);
                        if (Number.isFinite(priceNum) && priceNum > 0) {
                          const priceBigInt = toWei(priceStr, tokenDecimals);
                          const platformFeeBigInt = (priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n;
                          return (
                            <div className="text-[10px] space-y-0.5">
                              <div className="text-amber-300">
                                You pay 2% fee: {fromWei(platformFeeBigInt, tokenDecimals)} {tokenSymbol}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    {!isAlreadyListed && (
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={beastPrices.get(beast.id) || ""}
                        onChange={(e) => handlePriceChange(beast.id, e.target.value)}
                        placeholder={`Price in ${tokenSymbol}`}
                        className="w-32"
                      />
                    )}
                    {onRemoveBeast && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => onRemoveBeast(beast.id)}
                        title={isAlreadyListed ? "Remove already-listed beast from cart" : "Remove from cart"}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Currency selector */}
            <div>
              <label className="text-sm text-gray-400">Payment Currency</label>
              <TokenSelect
                value={currencyAddress}
                onValueChange={setCurrencyAddress}
                className="mt-1"
              />
            </div>

            {/* Duration selector */}
            <div>
              <label className="text-sm text-gray-400">Listing duration</label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="mt-1 bg-black/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0b0b0f] border-gray-800">
                  {DURATION_SELECT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="focus:bg-gray-800/50">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {duration === CUSTOM_DURATION_VALUE && (
                <Input
                  type="datetime-local"
                  min={minCustomExpiration}
                  value={customExpiration}
                  onChange={(e) => setCustomExpiration(e.target.value)}
                  className="mt-2"
                />
              )}
              {expirationDetails.preview && (
                <p className="mt-1 text-xs text-gray-400">
                  Expires: {expirationDetails.preview}
                </p>
              )}
              {expirationDetails.error && (
                <p className="mt-1 text-xs text-red-400">{expirationDetails.error}</p>
              )}
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                onClick={onSubmit}
                disabled={!canSubmit || submitting || alreadyListed.length > 0}
                className="flex-1"
              >
                {submitting
                  ? "Listing..."
                  : alreadyListed.length > 0
                    ? `Remove ${alreadyListed.length} Listed Beast${alreadyListed.length !== 1 ? 's' : ''} First`
                    : `List ${availableToList.length} Beast${availableToList.length !== 1 ? "s" : ""}`
                }
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
