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
  MARKETPLACE_ADDRESS,
  ROYALTIES_ENABLED,
  CREATOR_ROYALTY_BP,
} from "../../services/marketplace/constants";
import { useArcadeBookConfig } from "../../hooks/useArcadeBookConfig";
import { getCollectionApprovalCallIfNeeded, getProvider } from "../../services/marketplace/approvals";
import { toWei, fromWei } from "../../utils/price";
import { X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Listing } from "../../services/marketplace/types";
import TokenSelect from "./TokenSelect";
import { useSelectedToken, tokenAmountToUsd } from "../../hooks/useEkuboTokens";
import { isUserRejection } from "../../utils/transaction";
import { toUint256Hex } from "../../utils/uint256";
import {
  useExpirationDetails,
  DURATION_SELECT_OPTIONS,
} from "../../hooks/useExpirationDetails";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get token info from Ekubo
  const { decimals: tokenDecimals, symbol: tokenSymbol, usdPrice } = useSelectedToken(currencyAddress);

  // Fetch dynamic platform fee from Arcade Book config
  const { platformFeeBP } = useArcadeBookConfig();

  // Use shared expiration hook with max expiration enforcement
  const {
    duration,
    setDuration,
    customExpiration,
    setCustomExpiration,
    minCustomExpiration,
    expirationDetails,
    isCustomDuration,
    reset: resetExpiration,
  } = useExpirationDetails({ enforceMaxExpiration: true });

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
      resetExpiration();
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
  }, [open, beasts, resetExpiration]);

  const toBigInt = (value: string) => {
    const trimmed = value.trim();
    return BigInt(trimmed.startsWith("0x") ? trimmed : trimmed);
  };

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

      // Check if we need approval (will be added to multicall if needed)
      toast.loading("Checking NFT approval...", { id: toastId });
      const approvalCall = await getCollectionApprovalCallIfNeeded(account);

      // Build all calls for batching into a single multicall transaction
      const allCalls: Array<{
        contractAddress: string;
        entrypoint: string;
        calldata: string[];
      }> = [];

      // Add approval call first if needed
      if (approvalCall) {
        allCalls.push({
          contractAddress: approvalCall.contractAddress,
          entrypoint: approvalCall.entrypoint,
          calldata: approvalCall.calldata as string[],
        });
      }

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
          const priceBigInt = toWei(priceStr, tokenDecimals);
          const rawTokenId = (beast.id.split(":").pop() || beast.id).trim();
          const tokenIdBigInt = toBigInt(rawTokenId);

          // Build token ID as Uint256
          const tokenIdU256 = toUint256Hex(tokenIdBigInt);

          console.log('📝 Preparing to list beast:', {
            name: beast.name,
            tokenId: tokenIdBigInt.toString(),
            price: priceBigInt.toString(),
            priceFormatted: priceStr,
            currency: tokenSymbol,
            currencyAddress,
            expiration: expirationSeconds.toString(),
            expirationDate: new Date(expirationSeconds * 1000).toLocaleString(),
            collection: BEASTS_COLLECTION_ADDRESS,
          });

          // Build list call (free to list - buyer pays fees on purchase)
          // Contract signature: list(collection, token_id: u256, quantity: u128, price: u128, currency, expiration: u64, royalties: bool)
          const listCall = {
            contractAddress: MARKETPLACE_ADDRESS,
            entrypoint: "list",
            calldata: [
              BEASTS_COLLECTION_ADDRESS,
              ...tokenIdU256, // token_id as Uint256
              "0", // quantity: u128 = 0 for ERC721 (non-fungible)
              priceBigInt.toString(), // price: u128 (single felt, not u256!)
              currencyAddress,
              expirationSeconds.toString(), // expiration: u64
              ROYALTIES_ENABLED ? "1" : "0", // royalties: bool
            ],
          };

          console.log(`Adding list call for ${beast.name} (${i}):`, { listCall });

          // Add to batch (1 call per beast - free to list)
          allCalls.push(listCall);

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
          const hasApproval = approvalCall !== null;
          toast.loading(hasApproval ? "Approving & listing..." : "Submitting listings...", { id: toastId });
          console.log(`🚀 Executing multicall with ${allCalls.length} calls (${hasApproval ? 'incl. approval' : 'no approval'}) for ${successfulBeasts.length} beasts...`);
          const result = await account.execute(allCalls);

          // Extract transaction hash
          const txHash = result?.transaction_hash;

          if (txHash) {
            const provider = getProvider(account);
            await provider.waitForTransaction(txHash, {
              retryInterval: 2000,
            });
          }

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
      if (isUserRejection(e)) {
        toast.info("Listing cancelled", { id: toastId });
      } else {
        const errorMessage = (e as Error).message || "Failed to list beasts";
        setError(errorMessage);
        toast.error(errorMessage, { id: toastId });
      }
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
                          // Seller fees (deducted from proceeds)
                          // platformFeeBP is fetched dynamically from Arcade Book config
                          const platformFee = (priceBigInt * BigInt(platformFeeBP)) / 10000n;
                          const creatorRoyalty = (priceBigInt * BigInt(CREATOR_ROYALTY_BP)) / 10000n;
                          const sellerReceives = priceBigInt - platformFee - creatorRoyalty;
                          return (
                            <div className="text-[10px] space-y-0.5">
                              {usdPrice && (
                                <div className="text-gray-400">
                                  ≈ ${tokenAmountToUsd(priceBigInt, tokenDecimals, usdPrice).toFixed(2)} USD
                                </div>
                              )}
                              <div className="text-green-300">
                                You receive: {fromWei(sellerReceives, tokenDecimals)} {tokenSymbol}
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

            {/* Fee Summary */}
            {availableToList.length > 0 && (() => {
              // Calculate totals for all beasts with valid prices
              let totalListingPrice = 0n;
              let validCount = 0;
              for (const beast of availableToList) {
                const priceStr = beastPrices.get(beast.id) || "";
                const priceNum = Number.parseFloat(priceStr);
                if (Number.isFinite(priceNum) && priceNum > 0) {
                  totalListingPrice += toWei(priceStr, tokenDecimals);
                  validCount++;
                }
              }

              if (validCount === 0) return null;

              // platformFeeBP is fetched dynamically from Arcade Book config
              const totalPlatformFee = (totalListingPrice * BigInt(platformFeeBP)) / 10000n;
              const totalCreatorRoyalty = (totalListingPrice * BigInt(CREATOR_ROYALTY_BP)) / 10000n;
              const totalYouReceive = totalListingPrice - totalPlatformFee - totalCreatorRoyalty;

              return (
                <div className="border-t border-gray-700 pt-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-400">Total Listing Price:</span>
                    <span className="text-sm font-medium">{fromWei(totalListingPrice, tokenDecimals)} {tokenSymbol}</span>
                  </div>
                  {platformFeeBP > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-400">Platform Fee ({platformFeeBP / 100}%):</span>
                      <span className="text-sm font-medium text-gray-400">-{fromWei(totalPlatformFee, tokenDecimals)} {tokenSymbol}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-400">Creator Royalty ({CREATOR_ROYALTY_BP / 100}%) (Survivor DAO):</span>
                    <span className="text-sm font-medium text-gray-400">-{fromWei(totalCreatorRoyalty, tokenDecimals)} {tokenSymbol}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-700 pt-2">
                    <span className="text-sm font-semibold text-white">You Receive:</span>
                    <span className="text-sm font-semibold text-lsGold">{fromWei(totalYouReceive, tokenDecimals)} {tokenSymbol}</span>
                  </div>
                </div>
              );
            })()}

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
              {isCustomDuration && (
                <Input
                  type="date"
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
                className="flex-1 bg-lsGold/20 text-lsGold border border-lsGold hover:bg-lsGold/30"
              >
                {submitting
                  ? "Listing..."
                  : alreadyListed.length > 0
                    ? `Remove ${alreadyListed.length} Listed Beast${alreadyListed.length !== 1 ? 's' : ''} First`
                    : `List ${availableToList.length} Beast${availableToList.length !== 1 ? "s" : ""}`
                }
              </Button>
              {beasts.length > 1 && onClearCart && (
                <Button
                  variant="outline"
                  onClick={onClearCart}
                  disabled={submitting}
                  className="border-gray-600 hover:border-gray-500"
                >
                  Clear All
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="border-gray-600 hover:border-gray-500"
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
