import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import type { AccountInterface } from "starknet";
import type { Beast } from "../../../services/beast";
import type { Listing } from "../../../services/marketplace/types";
import type { OrderModel } from "@cartridge/marketplace";
import { useMarketplaceActions as useCartridgeMarketplaceActions } from "@cartridge/marketplace";
import {
  checkSufficientBalance,
  ensureErc20Allowance,
  executePurchaseWithApproval,
} from "../../../services/marketplace/approvals";
import {
  BEASTS_COLLECTION_ADDRESS,
  CLIENT_FEE_BP,
  CLIENT_FEE_RECEIVER,
  DEFAULT_PAYMENT_TOKEN,
  getPaymentTokenByAddress,
} from "../../../services/marketplace/constants";
import { fromWei, TOKEN_DECIMALS } from "../../../utils/price";
import { toBigIntSafe } from "../../../utils/bigint";
import type { TxEntry } from "../types";

const toBigInt = toBigIntSafe;
const ACTIVITY_STORAGE_KEY = "beastdex:my-activity";

export interface UseMarketplaceActionsProps {
  account: AccountInterface | undefined;
  refetchOrders: () => Promise<any>;
  reloadUserBeasts: () => Promise<void>;
}

/**
 * Hook for managing marketplace actions (buy, sell, list, cancel, offers)
 */
export function useMarketplaceActions({
  account,
  refetchOrders,
  reloadUserBeasts,
}: UseMarketplaceActionsProps) {
  const { executeListing, cancel, list, executeOffer } = useCartridgeMarketplaceActions();

  // Action state
  const [buyingListingId, setBuyingListingId] = useState<string | null>(null);
  const [acceptingOfferId, setAcceptingOfferId] = useState<string | null>(null);
  const [purchasingBatch, setPurchasingBatch] = useState(false);
  const [listingBatch, setListingBatch] = useState(false);

  // Activity tracking
  const [myTxs, setMyTxs] = useState<TxEntry[]>([]);

  /**
   * Load saved activity on mount
   */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned: TxEntry[] = parsed
          .filter((e) => e && typeof e === "object")
          .map((e) => ({
            type: e.type,
            tokenId: String(e.tokenId ?? ""),
            txHash: e.txHash ? String(e.txHash) : undefined,
            timestamp: Number(e.timestamp ?? Date.now()),
            note: e.note ? String(e.note) : undefined,
          }))
          .slice(0, 100);
        setMyTxs(cleaned);
      }
    } catch {}
  }, []);

  /**
   * Persist activity when it changes
   */
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(myTxs));
    } catch {}
  }, [myTxs]);

  /**
   * Handle successful listing
   */
  const handleListed = useCallback(async () => {
    // Poll for new listings since indexer takes time to sync
    const pollForUpdates = async (attempts = 3, delay = 2000) => {
      for (let i = 0; i < attempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        await refetchOrders();
      }
    };

    await refetchOrders();
    await reloadUserBeasts();
    // Start polling in background
    void pollForUpdates();
  }, [refetchOrders, reloadUserBeasts]);

  /**
   * Handle purchase of a single listing
   */
  const handlePurchase = useCallback(
    async (listing: Listing) => {
      if (!account) {
        toast.error("Please connect your wallet");
        return;
      }
      if (buyingListingId) return; // Prevent double-click

      const listingId = listing.listingId;
      setBuyingListingId(listingId);
      const toastId = toast.loading("Checking balance...");

      try {
        if (!listing.active) {
          toast.error("This listing is no longer available", { id: toastId });
          setBuyingListingId(null);
          return;
        }
        const tokenIdBigInt = toBigInt(listing.tokenId);
        const priceBigInt = toBigInt(listing.price);
        const currency = listing.paymentToken ?? DEFAULT_PAYMENT_TOKEN.address;
        const orderId = toBigInt(listing.orderId ?? 0);

        // Check balance
        const { sufficient, balance } = await checkSufficientBalance(
          account,
          currency,
          priceBigInt
        );

        if (!sufficient) {
          const token = getPaymentTokenByAddress(currency);
          const symbol = token?.symbol ?? "tokens";
          const decimals = TOKEN_DECIMALS[symbol] ?? 18;
          const requiredFormatted = fromWei(priceBigInt, decimals);
          const balanceFormatted = fromWei(balance, decimals);
          toast.error(
            `Insufficient balance. Required: ${requiredFormatted} ${symbol}, Available: ${balanceFormatted} ${symbol}`,
            { id: toastId }
          );
          setBuyingListingId(null);
          return;
        }

        // Close confirmation dialog and execute purchase with approval in one transaction
        toast.loading("Processing purchase...", { id: toastId });

        const result = await executePurchaseWithApproval(
          account,
          orderId,
          BEASTS_COLLECTION_ADDRESS,
          tokenIdBigInt,
          BigInt(listing.quantity ?? 1),
          true,
          currency,
          priceBigInt,
          BigInt(CLIENT_FEE_BP),
          CLIENT_FEE_RECEIVER
        );

        const extractTxHash = (res: any): string | undefined =>
          res?.transaction_hash ||
          res?.hash ||
          res?.txHash ||
          res?.transactionHash;
        const txHash = extractTxHash(result);

        // Record tx in local activity
        const buyEntry: TxEntry = {
          type: "buy",
          tokenId: listing.tokenId,
          txHash,
          timestamp: Date.now(),
        };
        setMyTxs((prev): TxEntry[] => [buyEntry, ...prev].slice(0, 50));

        toast.success(
          txHash
            ? `Purchase successful! Tx: ${txHash.slice(0, 8)}…${txHash.slice(
                -6
              )}`
            : "Purchase successful!",
          { id: toastId }
        );
        await refetchOrders();
        await reloadUserBeasts();
      } catch (error) {
        const errorMessage = (error as Error).message || "Purchase failed";
        toast.error(errorMessage, { id: toastId });
      } finally {
        setBuyingListingId(null);
      }
    },
    [account, buyingListingId, executeListing, refetchOrders, reloadUserBeasts]
  );

  /**
   * Handle batch purchase of multiple listings
   */
  const handlePurchaseAll = useCallback(
    async (purchaseCart: Listing[], handleRemoveFromPurchaseCart: (id: string) => void) => {
      if (!account || purchaseCart.length === 0 || purchasingBatch) return;

      setPurchasingBatch(true);
      const toastId = toast.loading(
        `Processing ${purchaseCart.length} purchases...`
      );
      let successCount = 0;
      let failCount = 0;

      try {
        for (const listing of purchaseCart) {
          try {
            if (!listing.active) {
              failCount++;
              continue;
            }

            const tokenIdBigInt = toBigInt(listing.tokenId);
            const priceBigInt = toBigInt(listing.price);
            const currency =
              listing.paymentToken ?? DEFAULT_PAYMENT_TOKEN.address;
            const orderId = toBigInt(listing.orderId ?? 0);

            // Check balance
            const { sufficient } = await checkSufficientBalance(
              account,
              currency,
              priceBigInt
            );
            if (!sufficient) {
              failCount++;
              continue;
            }

            // Ensure approval
            await ensureErc20Allowance(account, currency, priceBigInt.toString());

            // Execute purchase
            await executeListing(
              account as any,
              orderId,
              BEASTS_COLLECTION_ADDRESS,
              tokenIdBigInt,
              BigInt(listing.quantity ?? 1),
              true,
              currency,
              priceBigInt,
              BigInt(CLIENT_FEE_BP),
              CLIENT_FEE_RECEIVER
            );

            successCount++;
            handleRemoveFromPurchaseCart(listing.listingId);
          } catch (error) {
            failCount++;
          }
        }

        // Show results
        if (successCount > 0) {
          toast.success(
            `Successfully purchased ${successCount} beast${
              successCount > 1 ? "s" : ""
            }!`,
            { id: toastId }
          );
          await refetchOrders();
          await reloadUserBeasts();
        } else {
          toast.error("Failed to purchase any beasts", { id: toastId });
        }

        if (failCount > 0) {
          toast.warning(
            `${failCount} purchase${failCount > 1 ? "s" : ""} failed or skipped`
          );
        }

        // Return success status for cart dialog to close
        return successCount > 0 && failCount === 0;
      } catch (error) {
        const errorMessage = (error as Error).message || "Batch purchase failed";
        toast.error(errorMessage, { id: toastId });
        return false;
      } finally {
        setPurchasingBatch(false);
      }
    },
    [account, purchasingBatch, executeListing, refetchOrders, reloadUserBeasts]
  );

  /**
   * Handle accepting an offer
   */
  const handleAcceptOffer = useCallback(
    async (order: OrderModel) => {
      if (!account) {
        toast.error("Please connect your wallet");
        return;
      }
      if (acceptingOfferId) return; // Prevent double-click

      const offerId = order.id?.toString() || "";
      setAcceptingOfferId(offerId);
      const toastId = toast.loading("Accepting offer...");

      try {
        const tokenIdBigInt = toBigInt(order.tokenId);
        const priceBigInt = toBigInt(order.price);
        const currency = order.currency;
        const orderId = toBigInt(order.id);

        // Execute the offer (seller accepts buyer's offer)
        await executeOffer(
          account as any,
          orderId,
          BEASTS_COLLECTION_ADDRESS,
          tokenIdBigInt,
          BigInt(order.quantity ?? 1),
          true, // taker fulfills taker
          currency,
          priceBigInt,
          BigInt(CLIENT_FEE_BP),
          CLIENT_FEE_RECEIVER
        );

        toast.success("Offer accepted successfully!", { id: toastId });

        // Refresh data
        await refetchOrders();
        await reloadUserBeasts();
        return true;
      } catch (error) {
        const errorMessage =
          (error as Error).message || "Failed to accept offer";
        toast.error(errorMessage, { id: toastId });
        return false;
      } finally {
        setAcceptingOfferId(null);
      }
    },
    [account, acceptingOfferId, executeOffer, refetchOrders, reloadUserBeasts]
  );

  /**
   * Execute unified cart (listings + purchases)
   */
  const handleExecuteUnifiedCart = useCallback(
    async (
      cartBeasts: Beast[],
      purchaseCart: Listing[],
      beastPrices: Map<string, string>
    ) => {
      if (!account?.address) {
        toast.error("Please connect your wallet");
        return;
      }

      // Check if we have items to process
      const hasListings = cartBeasts.length > 0;
      const hasPurchases = purchaseCart.length > 0;

      if (!hasListings && !hasPurchases) {
        toast.error("Cart is empty");
        return;
      }

      const toastId = toast.loading("Processing cart...");

      try {
        // Process listings first if any
        if (hasListings) {
          setListingBatch(true);

          // Filter beasts with valid prices
          const beastsWithPrices = cartBeasts.filter((beast) => {
            const priceStr = beastPrices.get(beast.id);
            return priceStr && priceStr.trim() !== "" && Number(priceStr) > 0;
          });

          if (beastsWithPrices.length === 0) {
            toast.error("Please set prices for all beasts", { id: toastId });
            setListingBatch(false);
            return;
          }

          // TODO: Implement unified cart listing
          // This feature is currently disabled as buildListCalls is not available in the current marketplace package
          toast.error(
            "Unified cart listing is not yet implemented. Please use the List dialog for each beast.",
            { id: toastId }
          );
          setListingBatch(false);
          return;
        }

        // Process purchases if any
        if (hasPurchases) {
          setPurchasingBatch(true);

          let successCount = 0;
          for (const listing of purchaseCart) {
            try {
              if (!listing.active) {
                continue;
              }

              const tokenIdBigInt = toBigInt(listing.tokenId);
              const priceBigInt = toBigInt(listing.price);
              const currency =
                listing.paymentToken ?? DEFAULT_PAYMENT_TOKEN.address;
              const orderId = toBigInt(listing.orderId ?? 0);

              // Check balance
              const { sufficient } = await checkSufficientBalance(
                account,
                currency,
                priceBigInt
              );
              if (!sufficient) {
                continue;
              }

              // Ensure approval
              await ensureErc20Allowance(
                account,
                currency,
                priceBigInt.toString()
              );

              // Execute purchase
              await executeListing(
                account as any,
                orderId,
                BEASTS_COLLECTION_ADDRESS,
                tokenIdBigInt,
                BigInt(listing.quantity ?? 1),
                true,
                currency,
                priceBigInt,
                BigInt(CLIENT_FEE_BP),
                CLIENT_FEE_RECEIVER
              );

              successCount++;
            } catch (error) {
              // Continue with next purchase
            }
          }

          if (successCount > 0) {
            toast.success(`Purchased ${successCount} beast(s)!`, {
              id: toastId,
            });
          }
        }

        // Refresh data
        await refetchOrders();
        await reloadUserBeasts();
        return true;
      } catch (error) {
        toast.error("Failed to execute cart operations", { id: toastId });
        return false;
      } finally {
        setListingBatch(false);
        setPurchasingBatch(false);
      }
    },
    [account, executeListing, refetchOrders, reloadUserBeasts]
  );

  return {
    // State
    buyingListingId,
    acceptingOfferId,
    purchasingBatch,
    listingBatch,
    myTxs,

    // Setters
    setMyTxs,

    // Actions
    handleListed,
    handlePurchase,
    handlePurchaseAll,
    handleAcceptOffer,
    handleExecuteUnifiedCart,

    // Cartridge marketplace actions
    executeListing,
    cancel,
    list,
    executeOffer,
  };
}
