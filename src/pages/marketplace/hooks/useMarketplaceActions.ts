import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { AccountInterface, BigNumberish } from "starknet";
import type { Beast } from "../../../services/beast";
import type { Listing } from "../../../services/marketplace/types";
import type { OrderModel } from "@cartridge/marketplace";
import {
  useMarketplaceActions as useCartridgeMarketplaceActions,
  useMarketplace,
} from "@cartridge/marketplace";
import {
  checkSufficientBalance,
  ensureErc20Allowance,
  ensureCollectionApproval,
  executePurchaseWithApproval,
  validateListingOwnership,
  getProvider,
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

const toBigInt = toBigIntSafe;

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
  const { executeListing, cancel, list, executeOffer, buildListCalls } =
    useCartridgeMarketplaceActions();
  const marketplaceCtx = useMarketplace();

  // Action state
  const [buyingListingId, setBuyingListingId] = useState<string | null>(null);
  const [acceptingOfferId, setAcceptingOfferId] = useState<string | null>(null);
  const [purchasingBatch, setPurchasingBatch] = useState(false);
  const [listingBatch, setListingBatch] = useState(false);

  /**
   * Edit a listing atomically (cancel + relist in single transaction)
   * This ensures the user only needs to approve one transaction.
   */
  const editListing = useCallback(
    async (
      snAccount: AccountInterface,
      orderId: BigNumberish,
      collection: string,
      tokenId: BigNumberish,
      quantity: BigNumberish,
      newPrice: BigNumberish,
      currency: string,
      expiration: BigNumberish
    ) => {
      try {
        // Build cancel call using the marketplace provider
        const cancelCall = marketplaceCtx.provider.marketplace.buildCancelCalldata(
          orderId,
          collection,
          tokenId
        );

        // Build list calls (includes approval + list)
        const listCalls = buildListCalls(
          collection,
          tokenId,
          quantity,
          newPrice,
          currency,
          expiration
        );

        // Combine all calls into a single multicall
        const allCalls = [cancelCall, ...listCalls];

        // Execute as a single transaction
        // Cast to any to handle starknet.js Account vs AccountInterface typing
        return await marketplaceCtx.provider.execute(
          snAccount as any,
          allCalls,
          "MARKETPLACE"
        );
      } catch (error) {
        console.error("Edit listing error:", error);
        throw error;
      }
    },
    [marketplaceCtx, buildListCalls]
  );

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

        // Validate listing ownership
        toast.loading("Validating listing...", { id: toastId });
        const provider = getProvider(account);
        const isValidListing = await validateListingOwnership(
          provider,
          BEASTS_COLLECTION_ADDRESS,
          tokenIdBigInt,
          listing.seller
        );

        if (!isValidListing) {
          toast.error("This listing is no longer valid. The seller may not own the token anymore.", { id: toastId });
          setBuyingListingId(null);
          return;
        }

        // Check balance
        toast.loading("Checking balance...", { id: toastId });
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
    async (
      purchaseCart: Listing[],
      handleRemoveFromPurchaseCart: (id: string) => void
    ) => {
      if (!account || purchaseCart.length === 0 || purchasingBatch) return;

      setPurchasingBatch(true);
      const toastId = toast.loading(
        `Processing ${purchaseCart.length} purchases...`
      );
      let successCount = 0;
      let failCount = 0;

      try {
        const provider = getProvider(account);

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

            // Validate listing ownership
            const isValidListing = await validateListingOwnership(
              provider,
              BEASTS_COLLECTION_ADDRESS,
              tokenIdBigInt,
              listing.seller
            );

            if (!isValidListing) {
              failCount++;
              continue;
            }

            // Calculate total amount including platform fee
            const feeAmount = (priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n;
            const totalAmount = priceBigInt + feeAmount;

            // Check balance (including fee)
            const { sufficient } = await checkSufficientBalance(
              account,
              currency,
              totalAmount
            );
            if (!sufficient) {
              failCount++;
              continue;
            }

            // Ensure approval for total amount (price + fee)
            await ensureErc20Allowance(
              account,
              currency,
              totalAmount.toString()
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
        const errorMessage =
          (error as Error).message || "Batch purchase failed";
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
   * When a seller accepts a buyer's offer:
   * 1. Validate seller still owns the NFT (prevents wasted gas)
   * 2. Seller must approve marketplace to transfer their NFT
   * 3. Execute the offer (transfers NFT to buyer, payment to seller)
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
      const toastId = toast.loading("Validating ownership...");

      try {
        const tokenIdBigInt = toBigInt(order.tokenId);
        const priceBigInt = toBigInt(order.price);
        const currency = order.currency;
        const orderId = toBigInt(order.id);

        // Step 1: Validate that the current user (seller) still owns the NFT
        // This prevents wasted gas fees if they no longer own it
        const provider = getProvider(account);
        const isOwner = await validateListingOwnership(
          provider,
          BEASTS_COLLECTION_ADDRESS,
          tokenIdBigInt,
          account.address
        );

        if (!isOwner) {
          toast.error("You no longer own this beast. Cannot accept offer.", { id: toastId });
          setAcceptingOfferId(null);
          return false;
        }

        // Step 2: Ensure the seller has approved the marketplace to transfer their NFT
        toast.loading("Approving NFT transfer...", { id: toastId });
        await ensureCollectionApproval(account);

        // Step 3: Execute the offer (seller accepts buyer's offer)
        toast.loading("Accepting offer...", { id: toastId });
        await executeOffer(
          account as any,
          orderId,
          BEASTS_COLLECTION_ADDRESS,
          tokenIdBigInt,
          BigInt(order.quantity ?? 1),
          true, // royalties enabled
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
        const lowerError = errorMessage.toLowerCase();

        // Check for user rejection - cover multiple patterns
        const isUserRejection =
          (lowerError.includes("user") && (
            lowerError.includes("reject") ||
            lowerError.includes("cancel") ||
            lowerError.includes("abort") ||
            lowerError.includes("denied")
          )) ||
          lowerError.includes("user rejected") ||
          lowerError.includes("user cancelled") ||
          lowerError.includes("user denied") ||
          lowerError.includes("rejected by user") ||
          lowerError.includes("cancelled by user") ||
          lowerError.includes("transaction was rejected");

        if (isUserRejection) {
          toast.info("Transaction cancelled", { id: toastId });
        } else if (lowerError.includes("invalid value")) {
          toast.error("Offer rejected by marketplace contract", { id: toastId });
        } else {
          toast.error(errorMessage, { id: toastId });
        }
        return false;
      } finally {
        setAcceptingOfferId(null);
      }
    },
    [account, acceptingOfferId, executeOffer, refetchOrders, reloadUserBeasts]
  );

  /**
   * Execute unified cart (listings + purchases)
   * @param cartBeasts - Beasts to list
   * @param purchaseCart - All listings in cart
   * @param beastPrices - Prices for beasts to list
   * @param validBuyItems - Optional: only valid buy items (if validation found invalid items)
   */
  const handleExecuteUnifiedCart = useCallback(
    async (
      cartBeasts: Beast[],
      purchaseCart: Listing[],
      beastPrices: Map<string, string>,
      validBuyItems?: Listing[]
    ) => {
      if (!account?.address) {
        toast.error("Please connect your wallet");
        return;
      }

      // Use validBuyItems if provided (from cart validation), otherwise use all purchaseCart items
      const itemsToPurchase = validBuyItems ?? purchaseCart;

      // Check if we have items to process
      const hasListings = cartBeasts.length > 0;
      const hasPurchases = itemsToPurchase.length > 0;

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
          const provider = getProvider(account);

          let successCount = 0;
          for (const listing of itemsToPurchase) {
            try {
              if (!listing.active) {
                continue;
              }

              const tokenIdBigInt = toBigInt(listing.tokenId);
              const priceBigInt = toBigInt(listing.price);
              const currency =
                listing.paymentToken ?? DEFAULT_PAYMENT_TOKEN.address;
              const orderId = toBigInt(listing.orderId ?? 0);

              // Validate listing ownership
              const isValidListing = await validateListingOwnership(
                provider,
                BEASTS_COLLECTION_ADDRESS,
                tokenIdBigInt,
                listing.seller
              );

              if (!isValidListing) {
                continue;
              }

              // Calculate total amount including platform fee
              const feeAmount = (priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n;
              const totalAmount = priceBigInt + feeAmount;

              // Check balance (including fee)
              const { sufficient } = await checkSufficientBalance(
                account,
                currency,
                totalAmount
              );
              if (!sufficient) {
                continue;
              }

              // Ensure approval for total amount (price + fee)
              await ensureErc20Allowance(
                account,
                currency,
                totalAmount.toString()
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
    editListing,
  };
}
