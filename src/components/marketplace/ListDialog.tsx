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
  BEASTS_COLLECTION_ADDRESS,
  CLIENT_FEE_BP,
  DEFAULT_PAYMENT_TOKEN,
  MARKETPLACE_ADDRESS,
  ROYALTIES_ENABLED,
  CREATOR_ROYALTY_BP,
} from "../../services/marketplace/constants";
import { useArcadeBookConfig } from "../../hooks/useArcadeBookConfig";
import { toWei, fromWei } from "../../utils/price";
import { toast } from "sonner";
import TokenSelect from "./TokenSelect";
import { useSelectedToken, tokenAmountToUsd } from "../../hooks/useEkuboTokens";
import { getCollectionApprovalCallIfNeeded, getProvider } from "../../services/marketplace/approvals";
import { isUserRejection } from "../../utils/transaction";
import { toUint256Hex } from "../../utils/uint256";
import {
  useExpirationDetails,
  DURATION_SELECT_OPTIONS,
} from "../../hooks/useExpirationDetails";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beast: Beast | null;
  onListed?: () => void;
};

export default function ListDialog({ open, onOpenChange, beast, onListed }: Props) {
  const { account } = useAccount();
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Token selection - default to LORDS
  const [currencyAddress, setCurrencyAddress] = useState(DEFAULT_PAYMENT_TOKEN.address);
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

  useEffect(() => {
    if (open) {
      resetExpiration();
      setError(null);
    }
  }, [open, resetExpiration]);

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
      const wei = toWei(trimmed, tokenDecimals);
      return wei > 0n ? wei : null;
    } catch {
      return null;
    }
  }, [price, tokenDecimals]);

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

      // Build token ID as Uint256
      const tokenIdU256 = toUint256Hex(tokenIdBigInt);

      // Build list call
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

      // Build multicall with approval (if needed) + list
      toast.loading("Checking NFT approval...", { id: toastId });
      const approvalCall = await getCollectionApprovalCallIfNeeded(account);

      const calls = approvalCall ? [approvalCall, listCall] : [listCall];

      toast.loading(approvalCall ? "Approving & listing..." : "Submitting listing...", { id: toastId });

      // Execute in single transaction (approval + list combined if needed)
      const result = await account.execute(calls);

      if (result?.transaction_hash) {
        const provider = getProvider(account);
        await provider.waitForTransaction(result.transaction_hash, {
          retryInterval: 2000,
        });
      }

      toast.success("Beast listed successfully!", { id: toastId });
      toast.info("Your listing will appear in the marketplace shortly...", { duration: 5000 });
      onOpenChange(false);
      setPrice("");
      onListed?.();
    } catch (e) {
      if (isUserRejection(e)) {
        toast.info("Listing cancelled", { id: toastId });
      } else {
        const errorMessage = (e as Error).message || "Failed to list beast";
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
                placeholder={`e.g., 1.5 ${tokenSymbol}`}
                className="mt-1"
              />
              {priceBigInt && priceBigInt > 0n && usdPrice && (
                <p className="text-xs text-gray-400 mt-1">
                  ≈ ${tokenAmountToUsd(priceBigInt, tokenDecimals, usdPrice).toFixed(2)} USD
                </p>
              )}
              {priceBigInt && priceBigInt > 0n && (() => {
                // Calculate seller fees (deducted from proceeds)
                // platformFeeBP is fetched dynamically from Arcade Book config
                const platformFee = (priceBigInt * BigInt(platformFeeBP)) / 10000n;
                const creatorRoyalty = (priceBigInt * BigInt(CREATOR_ROYALTY_BP)) / 10000n;
                const sellerReceives = priceBigInt - platformFee - creatorRoyalty;

                // Calculate buyer fees (added on top)
                const clientFee = (priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n;
                const buyerTotal = priceBigInt + clientFee;

                return (
                  <div className="mt-3 space-y-3">
                    {/* You receive section */}
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-400">Listing Price:</span>
                        <span className="text-sm font-medium">{fromWei(priceBigInt, tokenDecimals)} {tokenSymbol}</span>
                      </div>
                      {platformFeeBP > 0 && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-400">Platform Fee ({platformFeeBP / 100}%):</span>
                          <span className="text-sm font-medium text-gray-400">-{fromWei(platformFee, tokenDecimals)} {tokenSymbol}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-400">Creator Royalty ({CREATOR_ROYALTY_BP / 100}%) (Survivor DAO):</span>
                        <span className="text-sm font-medium text-gray-400">-{fromWei(creatorRoyalty, tokenDecimals)} {tokenSymbol}</span>
                      </div>
                      <div className="flex justify-between border-t border-gray-700 pt-2">
                        <span className="text-sm font-semibold text-white">You Receive:</span>
                        <span className="text-sm font-semibold text-lsGold">{fromWei(sellerReceives, tokenDecimals)} {tokenSymbol}</span>
                      </div>
                    </div>

                    {/* Buyer pays section */}
                    <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 space-y-2">
                      <p className="text-xs text-blue-200 font-medium mb-2">Buyer pays on purchase:</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Listing Price:</span>
                        <span className="text-white">{fromWei(priceBigInt, tokenDecimals)} {tokenSymbol}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Client Fee ({CLIENT_FEE_BP / 100}%):</span>
                        <span className="text-gray-300">+{fromWei(clientFee, tokenDecimals)} {tokenSymbol}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold border-t border-blue-500/30 pt-2">
                        <span className="text-blue-200">Buyer Total:</span>
                        <span className="text-blue-100">{fromWei(buyerTotal, tokenDecimals)} {tokenSymbol}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div>
              <label className="text-sm text-gray-400">Currency</label>
              <TokenSelect
                value={currencyAddress}
                onValueChange={setCurrencyAddress}
                className="mt-1"
                disabled={submitting}
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
                <p className="mt-2 text-xs text-gray-400">
                  Expires {expirationDetails.preview}
                </p>
              ) : null}
              {expirationDetails.error ? (
                <p className="mt-2 text-xs text-red-400">{expirationDetails.error}</p>
              ) : null}
            </div>
            <div className="text-[10px] text-gray-500 break-all">
              Marketplace: {MARKETPLACE_ADDRESS}
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="border-gray-600 hover:border-gray-500"
              >
                Cancel
              </Button>
              <Button
                onClick={onSubmit}
                disabled={!canSubmit || submitting}
                className="bg-lsGold/20 text-lsGold border border-lsGold hover:bg-lsGold/30"
              >
                {submitting ? "Submitting..." : "List"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
