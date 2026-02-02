import { useState, useCallback, lazy, Suspense } from "react";
import { useAccount } from "@starknet-react/core";
import { useGlobalCart } from "../../contexts/GlobalCartContext";
import { useTermsOfService } from "../../contexts/TermsOfServiceContext";
import { toast } from "sonner";
import {
  MARKETPLACE_ADDRESS,
  BEASTS_COLLECTION_ADDRESS,
  CLIENT_FEE_BP,
  CLIENT_FEE_RECEIVER,
} from "../../services/marketplace/constants";
import { getErc20ApprovalCallIfNeeded, getProvider } from "../../services/marketplace/approvals";
import { toBigIntSafe } from "../../utils/bigint";
import { toUint256Hex } from "../../utils/uint256";
import { isUserRejection } from "../../utils/transaction";
import type { Listing } from "../../services/marketplace/types";

const CartListDialog = lazy(() => import("./CartListDialog"));
const PurchaseCartDialog = lazy(() => import("./PurchaseCartDialog"));

export function GlobalCartDialogs() {
  const { account } = useAccount();
  const globalCart = useGlobalCart();
  const { hasAcceptedToS, openToSDialog } = useTermsOfService();
  const {
    listDialogOpen,
    purchaseDialogOpen,
    closeListDialog,
    closePurchaseDialog,
  } = globalCart;
  const [isPurchasing, setIsPurchasing] = useState(false);

  // Helper to check ToS acceptance before allowing marketplace actions
  const requireToS = useCallback((action: () => void | Promise<void>) => {
    if (!hasAcceptedToS) {
      toast.error("Please accept the Terms of Service to use the marketplace", {
        action: {
          label: "View Terms",
          onClick: openToSDialog,
        },
      });
      return;
    }
    action();
  }, [hasAcceptedToS, openToSDialog]);

  /**
   * Handle batch purchase of listings
   */
  const handlePurchaseAll = useCallback(
    async (validListings?: Listing[]) => {
      const listings = validListings ?? globalCart.purchaseCart;
      if (!account || listings.length === 0) return;

      setIsPurchasing(true);
      const toastId = toast.loading(
        `Purchasing ${listings.length} beast${listings.length > 1 ? "s" : ""}...`
      );

      try {
        const provider = getProvider(account);
        const calls: Array<{
          contractAddress: string;
          entrypoint: string;
          calldata: string[];
        }> = [];

        // Group listings by payment token for approval
        const listingsByToken = new Map<string, Listing[]>();
        for (const listing of listings) {
          const tokenAddr = listing.paymentToken || "0x0";
          if (!listingsByToken.has(tokenAddr)) {
            listingsByToken.set(tokenAddr, []);
          }
          listingsByToken.get(tokenAddr)!.push(listing);
        }

        // Calculate total needed per token and add approval calls
        for (const [tokenAddr, tokenListings] of listingsByToken) {
          let totalNeeded = 0n;
          for (const listing of tokenListings) {
            const price = toBigIntSafe(listing.price);
            const fee = (price * BigInt(CLIENT_FEE_BP)) / 10000n;
            totalNeeded += price + fee;
          }

          // Get approval call if needed
          const approvalCall = await getErc20ApprovalCallIfNeeded(
            account,
            tokenAddr,
            totalNeeded.toString()
          );
          if (approvalCall) {
            calls.push(approvalCall);
          }
        }

        // Build buy calls for each listing
        for (const listing of listings) {
          const tokenIdBigInt = BigInt(listing.tokenId);
          const tokenIdU256 = toUint256Hex(tokenIdBigInt);
          const priceBigInt = toBigIntSafe(listing.price);
          const priceU256 = toUint256Hex(priceBigInt);
          const fee = (priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n;
          const feeU256 = toUint256Hex(fee);

          calls.push({
            contractAddress: MARKETPLACE_ADDRESS,
            entrypoint: "buy",
            calldata: [
              listing.orderId?.toString() || "0",
              BEASTS_COLLECTION_ADDRESS,
              tokenIdU256[0],
              tokenIdU256[1],
              listing.paymentToken || "0x0",
              priceU256[0],
              priceU256[1],
              CLIENT_FEE_RECEIVER,
              feeU256[0],
              feeU256[1],
            ],
          });
        }

        // Execute multicall
        const result = await account.execute(calls);
        await provider.waitForTransaction(result.transaction_hash);

        toast.dismiss(toastId);
        toast.success(
          `Successfully purchased ${listings.length} beast${listings.length > 1 ? "s" : ""}!`
        );

        // Clear purchase cart and close dialog
        globalCart.clearPurchaseCart();
        closePurchaseDialog();
      } catch (err) {
        toast.dismiss(toastId);
        if (isUserRejection(err)) {
          toast.error("Transaction cancelled");
        } else {
          console.error("Purchase error:", err);
          toast.error("Failed to complete purchase");
        }
      } finally {
        setIsPurchasing(false);
      }
    },
    [account, globalCart, closePurchaseDialog]
  );

  /**
   * Handle successful listing
   */
  const handleListed = useCallback(() => {
    globalCart.clearListCart();
    closeListDialog();
  }, [globalCart, closeListDialog]);

  return (
    <Suspense fallback={null}>
      {listDialogOpen && (
        <CartListDialog
          open={listDialogOpen}
          onOpenChange={(open) => !open && closeListDialog()}
          beasts={globalCart.listCart}
          onRemoveBeast={globalCart.removeFromListCart}
          onListed={handleListed}
          onClearCart={globalCart.clearListCart}
        />
      )}

      {purchaseDialogOpen && (
        <PurchaseCartDialog
          open={purchaseDialogOpen}
          onOpenChange={(open) => !open && closePurchaseDialog()}
          listings={globalCart.purchaseCart}
          onRemove={globalCart.removeFromPurchaseCart}
          onClearAll={globalCart.clearPurchaseCart}
          onPurchaseAll={(validListings) => requireToS(() => handlePurchaseAll(validListings))}
          isProcessing={isPurchasing || !hasAcceptedToS}
        />
      )}
    </Suspense>
  );
}
