import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { AccountInterface, BigNumberish } from "starknet";
import type { Beast } from "../../../services/beast";
import type { Listing } from "../../../services/marketplace/types";
import type { OrderModel } from "@cartridge/arcade";
import {
  checkSufficientBalance,
  ensureCollectionApproval,
  executePurchaseWithApproval,
  validateListingOwnership,
  getProvider,
  buildMarketplaceExecuteCall,
} from "../../../services/marketplace/approvals";
import {
  BEASTS_COLLECTION_ADDRESS,
  CLIENT_FEE_BP,
  CLIENT_FEE_RECEIVER,
  DEFAULT_PAYMENT_TOKEN,
  getPaymentTokenByAddress,
  MARKETPLACE_ADDRESS,
} from "../../../services/marketplace/constants";
import { fromWei, TOKEN_DECIMALS } from "../../../utils/price";
import { toBigIntSafe } from "../../../utils/bigint";
import { isUserRejection } from "../../../utils/transaction";
import { toUint256Hex } from "../../../utils/uint256";
import { VOYAGER_BASE } from "../types";

const toBigInt = toBigIntSafe;

export interface UseMarketplaceActionsProps {
  account: AccountInterface | undefined;
  refetchOrders: () => Promise<any>;
  reloadUserBeasts: () => Promise<void>;
  invalidateSales?: () => Promise<void>;
  /** Optimistically mark a listing as sold */
  markListingAsSold?: (listingId: string) => void;
}

/**
 * Hook for managing marketplace actions (buy, sell, list, cancel, offers)
 * Uses direct contract calls without SDK context
 */
export function useMarketplaceActions({
  account,
  refetchOrders,
  reloadUserBeasts,
  invalidateSales,
  markListingAsSold,
}: UseMarketplaceActionsProps) {
  // Helper to poll for sales updates after a transaction
  const pollForSalesUpdates = useCallback(async (attempts = 3, delayMs = 3000) => {
    if (!invalidateSales) return;
    for (let i = 0; i < attempts; i++) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      await invalidateSales();
    }
  }, [invalidateSales]);

  // Action state
  const [buyingListingId, setBuyingListingId] = useState<string | null>(null);
  const [acceptingOfferId, setAcceptingOfferId] = useState<string | null>(null);
  const [purchasingBatch, setPurchasingBatch] = useState(false);
  const [listingBatch, setListingBatch] = useState(false);

  /**
   * Handle successful listing
   */
  const handleListed = useCallback(async () => {
    const pollForUpdates = async (attempts = 3, delay = 2000) => {
      for (let i = 0; i < attempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        await refetchOrders();
      }
    };

    await refetchOrders();
    await reloadUserBeasts();
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
      if (buyingListingId) return;

      const listingId = listing.listingId;
      setBuyingListingId(listingId);
      const toastId = toast.loading("Validating listing...");

      try {
        if (!listing.active) {
          toast.error("This listing is no longer available", { id: toastId });
          setBuyingListingId(null);
          return;
        }

        const tokenIdBigInt = toBigInt(listing.tokenId);
        const priceBigInt = toBigInt(listing.price);
        const currency = listing.paymentToken ?? DEFAULT_PAYMENT_TOKEN.address;
        const orderId = toBigInt(listing.orderId);

        // Validate listing ownership
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

        // Calculate total amount including platform fee
        const feeAmount = (priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n;
        const totalAmount = priceBigInt + feeAmount;

        // Check balance
        toast.loading("Checking balance...", { id: toastId });
        const { sufficient, balance } = await checkSufficientBalance(
          account,
          currency,
          totalAmount
        );

        if (!sufficient) {
          const token = getPaymentTokenByAddress(currency);
          const symbol = token?.symbol ?? "tokens";
          const decimals = TOKEN_DECIMALS[symbol] ?? 18;
          const requiredFormatted = fromWei(totalAmount, decimals);
          const balanceFormatted = fromWei(balance, decimals);
          toast.error(
            `Insufficient balance. Required: ${requiredFormatted} ${symbol}, Available: ${balanceFormatted} ${symbol}`,
            { id: toastId }
          );
          setBuyingListingId(null);
          return;
        }

        // Execute purchase with approval in one transaction
        toast.loading("Processing purchase...", { id: toastId });

        const result = await executePurchaseWithApproval(
          account,
          orderId,
          BEASTS_COLLECTION_ADDRESS,
          tokenIdBigInt,
          BigInt(listing.quantity ?? 1),
          false, // royalties disabled
          currency,
          priceBigInt,
          BigInt(CLIENT_FEE_BP),
          CLIENT_FEE_RECEIVER
        );

        const txHash = result?.transaction_hash;

        if (txHash) {
          toast.success(
            `Purchase successful! Tx: ${txHash.slice(0, 8)}…${txHash.slice(-6)}`,
            {
              id: toastId,
              action: {
                label: "View",
                onClick: () => window.open(`${VOYAGER_BASE}/tx/${txHash}`, "_blank"),
              },
            }
          );
        } else {
          toast.success("Purchase successful!", { id: toastId });
        }

        // Optimistically remove listing from UI before indexer catches up
        markListingAsSold?.(listingId);

        await refetchOrders();
        await reloadUserBeasts();
        void pollForSalesUpdates();
      } catch (error) {
        if (isUserRejection(error)) {
          toast.info("Purchase cancelled", { id: toastId });
        } else {
          const errorMessage = (error as Error).message || "Purchase failed";
          toast.error(errorMessage, { id: toastId });
        }
      } finally {
        setBuyingListingId(null);
      }
    },
    [account, buyingListingId, refetchOrders, reloadUserBeasts, pollForSalesUpdates, markListingAsSold]
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
            const currency = listing.paymentToken ?? DEFAULT_PAYMENT_TOKEN.address;
            const orderId = toBigInt(listing.orderId);

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

            // Check balance
            const { sufficient } = await checkSufficientBalance(
              account,
              currency,
              totalAmount
            );
            if (!sufficient) {
              failCount++;
              continue;
            }

            // Execute purchase with approval
            await executePurchaseWithApproval(
              account,
              orderId,
              BEASTS_COLLECTION_ADDRESS,
              tokenIdBigInt,
              BigInt(listing.quantity ?? 1),
              false, // royalties disabled
              currency,
              priceBigInt,
              BigInt(CLIENT_FEE_BP),
              CLIENT_FEE_RECEIVER
            );

            successCount++;
            handleRemoveFromPurchaseCart(listing.listingId);
          } catch {
            failCount++;
          }
        }

        if (successCount > 0) {
          toast.success(
            `Successfully purchased ${successCount} beast${successCount > 1 ? "s" : ""}!`,
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

        return successCount > 0 && failCount === 0;
      } catch (error) {
        if (isUserRejection(error)) {
          toast.info("Batch purchase cancelled", { id: toastId });
        } else {
          const errorMessage = (error as Error).message || "Batch purchase failed";
          toast.error(errorMessage, { id: toastId });
        }
        return false;
      } finally {
        setPurchasingBatch(false);
      }
    },
    [account, purchasingBatch, refetchOrders, reloadUserBeasts]
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
      if (acceptingOfferId) return;

      const offerId = order.id?.toString() || "";
      setAcceptingOfferId(offerId);
      const toastId = toast.loading("Validating ownership...");

      try {
        const tokenIdBigInt = toBigInt(order.tokenId);
        const orderId = toBigInt(order.id);

        // Validate that the seller still owns the NFT
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

        // Ensure collection approval
        toast.loading("Approving NFT transfer...", { id: toastId });
        await ensureCollectionApproval(account);

        // Execute the offer
        toast.loading("Accepting offer...", { id: toastId });

        const executeCall = buildMarketplaceExecuteCall(
          orderId,
          BEASTS_COLLECTION_ADDRESS,
          tokenIdBigInt,
          BigInt(order.quantity ?? 1),
          false, // royalties disabled
          order.currency,
          toBigInt(order.price),
          BigInt(CLIENT_FEE_BP),
          CLIENT_FEE_RECEIVER
        );

        const result = await account.execute([executeCall]);

        if (result?.transaction_hash) {
          await provider.waitForTransaction(result.transaction_hash, {
            retryInterval: 2000,
          });
        }

        const txHash = result?.transaction_hash;

        if (txHash) {
          toast.success(
            `Offer accepted! Tx: ${txHash.slice(0, 8)}…${txHash.slice(-6)}`,
            {
              id: toastId,
              action: {
                label: "View",
                onClick: () => window.open(`${VOYAGER_BASE}/tx/${txHash}`, "_blank"),
              },
            }
          );
        } else {
          toast.success("Offer accepted successfully!", { id: toastId });
        }

        await refetchOrders();
        await reloadUserBeasts();
        void pollForSalesUpdates();
        return true;
      } catch (error) {
        if (isUserRejection(error)) {
          toast.info("Offer acceptance cancelled", { id: toastId });
        } else {
          const errorMessage = (error as Error).message || "Failed to accept offer";
          const lowerError = errorMessage.toLowerCase();

          if (lowerError.includes("invalid value")) {
            toast.error("Offer rejected by marketplace contract", { id: toastId });
          } else {
            toast.error(errorMessage, { id: toastId });
          }
        }
        return false;
      } finally {
        setAcceptingOfferId(null);
      }
    },
    [account, acceptingOfferId, refetchOrders, reloadUserBeasts, pollForSalesUpdates]
  );

  /**
   * Cancel a listing
   */
  const cancel = useCallback(
    async (
      snAccount: AccountInterface,
      orderId: BigNumberish,
      collection: string,
      tokenId: BigNumberish
    ) => {
      const tokenIdBigInt = typeof tokenId === 'bigint' ? tokenId : BigInt(tokenId.toString());
      const tokenIdU256 = toUint256Hex(tokenIdBigInt);

      const call = {
        contractAddress: MARKETPLACE_ADDRESS,
        entrypoint: "cancel",
        calldata: [
          orderId.toString(),
          collection,
          ...tokenIdU256,
        ],
      };

      const result = await snAccount.execute([call]);

      if (result?.transaction_hash) {
        const provider = getProvider(snAccount);
        await provider.waitForTransaction(result.transaction_hash, {
          retryInterval: 2000,
        });
      }

      return result;
    },
    []
  );

  /**
   * Batch cancel multiple listings in a single transaction
   */
  const batchCancel = useCallback(
    async (
      snAccount: AccountInterface,
      listings: Array<{
        orderId: BigNumberish;
        collection: string;
        tokenId: BigNumberish;
      }>
    ) => {
      if (listings.length === 0) return null;

      const calls = listings.map((listing) => {
        const tokenIdBigInt = typeof listing.tokenId === 'bigint'
          ? listing.tokenId
          : BigInt(listing.tokenId.toString());
        const tokenIdU256 = toUint256Hex(tokenIdBigInt);

        return {
          contractAddress: MARKETPLACE_ADDRESS,
          entrypoint: "cancel",
          calldata: [
            listing.orderId.toString(),
            listing.collection,
            ...tokenIdU256,
          ],
        };
      });

      const result = await snAccount.execute(calls);

      if (result?.transaction_hash) {
        const provider = getProvider(snAccount);
        await provider.waitForTransaction(result.transaction_hash, {
          retryInterval: 2000,
        });
      }

      return result;
    },
    []
  );

  /**
   * List a beast for sale
   */
  const list = useCallback(
    async (
      snAccount: AccountInterface,
      collection: string,
      tokenId: BigNumberish,
      _quantity: BigNumberish, // Unused - ERC721 always uses 0
      price: BigNumberish,
      currency: string,
      expiration: BigNumberish
    ) => {
      // First ensure collection approval
      await ensureCollectionApproval(snAccount);

      const tokenIdBigInt = typeof tokenId === 'bigint' ? tokenId : BigInt(tokenId.toString());
      const tokenIdU256 = toUint256Hex(tokenIdBigInt);

      // Contract signature: list(collection, token_id: u256, quantity: u128, price: u128, currency, expiration: u64, royalties: bool)
      // Note: For ERC721, quantity must be 0 (non-fungible)
      const call = {
        contractAddress: MARKETPLACE_ADDRESS,
        entrypoint: "list",
        calldata: [
          collection,
          ...tokenIdU256, // token_id as Uint256
          "0", // quantity: u128 = 0 for ERC721 (non-fungible)
          price.toString(), // price: u128 (single felt!)
          currency,
          expiration.toString(), // expiration: u64
          "0", // royalties: bool = false
        ],
      };

      const result = await snAccount.execute([call]);

      if (result?.transaction_hash) {
        const provider = getProvider(snAccount);
        await provider.waitForTransaction(result.transaction_hash, {
          retryInterval: 2000,
        });
      }

      return result;
    },
    []
  );

  /**
   * Batch list multiple beasts in a single transaction
   */
  const batchList = useCallback(
    async (
      snAccount: AccountInterface,
      listings: Array<{
        collection: string;
        tokenId: BigNumberish;
        price: BigNumberish;
        currency: string;
        expiration: BigNumberish;
      }>
    ) => {
      if (listings.length === 0) return null;

      // First ensure collection approval
      await ensureCollectionApproval(snAccount);

      const UINT128_MASK = (1n << 128n) - 1n;
      const calls: Array<{
        contractAddress: string;
        entrypoint: string;
        calldata: string[];
      }> = [];

      for (const listing of listings) {
        const tokenIdBigInt = typeof listing.tokenId === 'bigint'
          ? listing.tokenId
          : BigInt(listing.tokenId.toString());
        const priceBigInt = typeof listing.price === 'bigint'
          ? listing.price
          : BigInt(listing.price.toString());
        const tokenIdU256 = toUint256Hex(tokenIdBigInt);

        // Calculate platform fee
        const feeAmount = (priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n;
        const feeLow = feeAmount & UINT128_MASK;
        const feeHigh = feeAmount >> 128n;

        // Build ERC20 transfer call for platform fee
        const feeTransferCall = {
          contractAddress: listing.currency,
          entrypoint: "transfer",
          calldata: [
            CLIENT_FEE_RECEIVER,
            feeLow.toString(),
            feeHigh.toString(),
          ],
        };

        // Build list call
        const listCall = {
          contractAddress: MARKETPLACE_ADDRESS,
          entrypoint: "list",
          calldata: [
            listing.collection,
            ...tokenIdU256,
            "0", // quantity: u128 = 0 for ERC721
            priceBigInt.toString(),
            listing.currency,
            listing.expiration.toString(),
            "0", // royalties: bool = false
          ],
        };

        // Add fee transfer then list (2 calls per beast)
        calls.push(feeTransferCall, listCall);
      }

      const result = await snAccount.execute(calls);

      if (result?.transaction_hash) {
        const provider = getProvider(snAccount);
        await provider.waitForTransaction(result.transaction_hash, {
          retryInterval: 2000,
        });
      }

      return result;
    },
    []
  );

  /**
   * Edit a listing (cancel + relist)
   */
  const editListing = useCallback(
    async (
      snAccount: AccountInterface,
      orderId: BigNumberish,
      collection: string,
      tokenId: BigNumberish,
      _quantity: BigNumberish, // Unused - ERC721 always uses 0
      newPrice: BigNumberish,
      currency: string,
      expiration: BigNumberish
    ) => {
      const tokenIdBigInt = typeof tokenId === 'bigint' ? tokenId : BigInt(tokenId.toString());
      const tokenIdU256 = toUint256Hex(tokenIdBigInt);

      // Build cancel call
      const cancelCall = {
        contractAddress: MARKETPLACE_ADDRESS,
        entrypoint: "cancel",
        calldata: [
          orderId.toString(),
          collection,
          ...tokenIdU256,
        ],
      };

      // Contract signature: list(collection, token_id: u256, quantity: u128, price: u128, currency, expiration: u64, royalties: bool)
      // Note: For ERC721, quantity must be 0 (non-fungible)
      const listCall = {
        contractAddress: MARKETPLACE_ADDRESS,
        entrypoint: "list",
        calldata: [
          collection,
          ...tokenIdU256, // token_id as Uint256
          "0", // quantity: u128 = 0 for ERC721 (non-fungible)
          newPrice.toString(), // price: u128 (single felt!)
          currency,
          expiration.toString(), // expiration: u64
          "0", // royalties: bool = false
        ],
      };

      // Execute both in a single transaction
      const result = await snAccount.execute([cancelCall, listCall]);

      if (result?.transaction_hash) {
        const provider = getProvider(snAccount);
        await provider.waitForTransaction(result.transaction_hash, {
          retryInterval: 2000,
        });
      }

      return result;
    },
    []
  );

  /**
   * Execute unified cart (purchases only for now)
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

      const itemsToPurchase = validBuyItems ?? purchaseCart;
      const hasListings = cartBeasts.length > 0;
      const hasPurchases = itemsToPurchase.length > 0;

      if (!hasListings && !hasPurchases) {
        toast.error("Cart is empty");
        return;
      }

      const toastId = toast.loading("Processing cart...");

      try {
        if (hasListings) {
          setListingBatch(true);
          const beastsWithPrices = cartBeasts.filter((beast) => {
            const priceStr = beastPrices.get(beast.id);
            return priceStr && priceStr.trim() !== "" && Number(priceStr) > 0;
          });

          if (beastsWithPrices.length === 0) {
            toast.error("Please set prices for all beasts", { id: toastId });
            setListingBatch(false);
            return;
          }

          toast.error(
            "Unified cart listing is not yet implemented. Please use the List dialog for each beast.",
            { id: toastId }
          );
          setListingBatch(false);
          return;
        }

        if (hasPurchases) {
          setPurchasingBatch(true);
          const provider = getProvider(account);
          let successCount = 0;

          for (const listing of itemsToPurchase) {
            try {
              if (!listing.active) continue;

              const tokenIdBigInt = toBigInt(listing.tokenId);
              const priceBigInt = toBigInt(listing.price);
              const currency = listing.paymentToken ?? DEFAULT_PAYMENT_TOKEN.address;
              const orderId = toBigInt(listing.orderId);

              const isValidListing = await validateListingOwnership(
                provider,
                BEASTS_COLLECTION_ADDRESS,
                tokenIdBigInt,
                listing.seller
              );

              if (!isValidListing) continue;

              const feeAmount = (priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n;
              const totalAmount = priceBigInt + feeAmount;

              const { sufficient } = await checkSufficientBalance(account, currency, totalAmount);
              if (!sufficient) continue;

              await executePurchaseWithApproval(
                account,
                orderId,
                BEASTS_COLLECTION_ADDRESS,
                tokenIdBigInt,
                BigInt(listing.quantity ?? 1),
                false, // royalties disabled
                currency,
                priceBigInt,
                BigInt(CLIENT_FEE_BP),
                CLIENT_FEE_RECEIVER
              );

              successCount++;
            } catch {
              // Continue with next purchase
            }
          }

          if (successCount > 0) {
            toast.success(`Purchased ${successCount} beast(s)!`, { id: toastId });
          }
        }

        await refetchOrders();
        await reloadUserBeasts();
        return true;
      } catch (error) {
        if (isUserRejection(error)) {
          toast.info("Cart operations cancelled", { id: toastId });
        } else {
          const errorMessage = (error as Error).message || "Failed to execute cart operations";
          toast.error(errorMessage, { id: toastId });
        }
        return false;
      } finally {
        setListingBatch(false);
        setPurchasingBatch(false);
      }
    },
    [account, refetchOrders, reloadUserBeasts]
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

    // Direct marketplace actions
    cancel,
    batchCancel,
    list,
    batchList,
    editListing,
  };
}
