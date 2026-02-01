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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DEFAULT_PAYMENT_TOKEN,
  BEASTS_COLLECTION_ADDRESS,
  CLIENT_FEE_BP,
  MARKETPLACE_ADDRESS,
} from "../../services/marketplace/constants";
import { ensureErc20Allowance, getProvider } from "../../services/marketplace/approvals";
import { toWei, fromWei } from "../../utils/price";
import { toast } from "sonner";
import TokenSelect from "./TokenSelect";
import { useSelectedToken, tokenAmountToUsd } from "../../hooks/useEkuboTokens";
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
  tokenId?: string;
  onOfferMade?: (result?: {
    tokenId: string;
    beastName: string;
    offerPrice: string;
    currency: string;
  }) => void;
};

export default function MakeOfferDialog({
  open,
  onOpenChange,
  beast,
  tokenId,
  onOfferMade,
}: Props) {
  const { account } = useAccount();
  const [price, setPrice] = useState("");
  const [currencyAddress, setCurrencyAddress] = useState<string>(
    DEFAULT_PAYMENT_TOKEN.address
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get token info from Ekubo
  const { decimals: tokenDecimals, symbol: tokenSymbol, usdPrice } = useSelectedToken(currencyAddress);

  // Use shared expiration hook (no max enforcement for offers)
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
    if (open) {
      resetExpiration();
      setError(null);
    }
  }, [open, resetExpiration]);

  const toBigInt = (value: string) => {
    const trimmed = value.trim();
    return BigInt(trimmed.startsWith("0x") ? trimmed : trimmed);
  };

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

  // Calculate fee and total (fee is paid by buyer)
  const feeDetails = useMemo(() => {
    if (!priceBigInt) return null;
    const feeAmount = (priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n;
    const totalAmount = priceBigInt + feeAmount;
    return {
      feeAmount,
      totalAmount,
      feeFormatted: fromWei(feeAmount, tokenDecimals),
      totalFormatted: fromWei(totalAmount, tokenDecimals),
    };
  }, [priceBigInt, tokenDecimals]);

  const canSubmit = useMemo(() => {
    return (
      !!account &&
      (!!beast || !!tokenId) &&
      priceBigInt !== null &&
      !expirationDetails.error &&
      expirationDetails.expirationSeconds != null
    );
  }, [
    account,
    beast,
    tokenId,
    priceBigInt,
    expirationDetails.error,
    expirationDetails.expirationSeconds,
  ]);

  const onSubmit = async () => {
    if (!account || (!beast && !tokenId)) return;
    if (priceBigInt === null || !feeDetails) {
      toast.error("Please enter a valid offer amount greater than 0");
      return;
    }

    setSubmitting(true);
    setError(null);
    const toastId = toast.loading("Preparing offer...");

    try {
      const rawTokenId = beast?.id
        ? (beast.id.split(":").pop() || beast.id).trim()
        : tokenId!;
      const tokenIdBigInt = toBigInt(rawTokenId);
      const expirationSeconds = expirationDetails.expirationSeconds;
      if (!expirationSeconds) {
        throw new Error("Invalid expiration selected");
      }

      // Build token ID as Uint256
      const tokenIdU256 = toUint256Hex(tokenIdBigInt);

      // Ensure ERC20 approval for total amount (price + fee)
      toast.loading("Checking token approval...", { id: toastId });
      await ensureErc20Allowance(account, currencyAddress, feeDetails.totalAmount.toString());

      // Build offer call
      // Contract signature: offer(collection, token_id: u256, quantity: u128, price: u128, currency, expiration: u64)
      // Note: offer does NOT have a royalties parameter
      const offerCall = {
        contractAddress: MARKETPLACE_ADDRESS,
        entrypoint: "offer",
        calldata: [
          BEASTS_COLLECTION_ADDRESS,
          ...tokenIdU256, // token_id as Uint256
          "0", // quantity: u128 = 0 for ERC721 (non-fungible)
          priceBigInt.toString(), // price: u128 (single felt, not u256!)
          currencyAddress,
          expirationSeconds.toString(), // expiration: u64
        ],
      };

      toast.loading("Making offer...", { id: toastId });
      const result = await account.execute([offerCall]);

      if (result?.transaction_hash) {
        const provider = getProvider(account);
        await provider.waitForTransaction(result.transaction_hash, {
          retryInterval: 2000,
        });
      }

      toast.success("Offer made successfully!", { id: toastId });
      onOpenChange(false);
      setPrice("");

      const actualTokenId =
        tokenId || beast?.id.split(":").pop() || beast?.id || "";
      onOfferMade?.({
        tokenId: actualTokenId,
        beastName: beast?.name || `Beast #${actualTokenId}`,
        offerPrice: price,
        currency: tokenSymbol,
      });
    } catch (e) {
      if (isUserRejection(e)) {
        toast.info("Offer cancelled", { id: toastId });
      } else {
        const errorMessage = (e as Error).message || "Failed to make offer";
        const lowerError = errorMessage.toLowerCase();

        if (
          lowerError.includes("insufficient") ||
          lowerError.includes("balance") ||
          lowerError.includes("invalid balance")
        ) {
          toast.error("Insufficient balance to make this offer", { id: toastId });
          setError("Insufficient balance");
        } else if (lowerError.includes("invalid value")) {
          toast.error("Offer rejected: The marketplace contract rejected this offer. The currency may not be supported.", { id: toastId });
          setError("Currency may not be supported for offers");
        } else {
          setError(errorMessage);
          toast.error(errorMessage, { id: toastId });
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const displayName =
    beast?.name ?? (tokenId ? `Beast #${tokenId}` : "Unknown Beast");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0b0b0f] border-gray-800">
        <DialogHeader>
          <DialogTitle>Make an Offer</DialogTitle>
          <DialogDescription>
            Submit an offer for this beast. The owner can accept or reject it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-400">Beast</p>
            <p className="text-sm font-medium">{displayName}</p>
          </div>
          <div>
            <label className="text-sm text-gray-400">Offer Amount</label>
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
            <label className="text-sm text-gray-400">Offer Duration</label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="mt-1 bg-black/50">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent className="bg-[#0b0b0f] border-gray-800">
                {DURATION_SELECT_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="focus:bg-gray-800/50"
                  >
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
              <p className="mt-2 text-xs text-red-400">
                {expirationDetails.error}
              </p>
            ) : null}
          </div>
          {feeDetails && priceBigInt && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide">You pay if accepted</p>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Offer Amount:</span>
                <span className="text-sm font-medium">{price} {tokenSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Client Fee ({CLIENT_FEE_BP / 100}%):</span>
                <span className="text-sm font-medium text-gray-400">+{feeDetails.feeFormatted} {tokenSymbol}</span>
              </div>
              <div className="flex justify-between border-t border-gray-700 pt-2">
                <span className="text-sm font-semibold text-white">Total to Pay:</span>
                <span className="text-sm font-semibold text-lsGold">{feeDetails.totalFormatted} {tokenSymbol}</span>
              </div>
              <p className="text-xs text-gray-500 text-center mt-2">
                Fees are only charged if your offer is accepted.
              </p>
            </div>
          )}
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
              {submitting ? "Submitting..." : "Make Offer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
