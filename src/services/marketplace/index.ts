import type { OrderModel } from "@cartridge/marketplace";
import { CategoryType, StatusType } from "@cartridge/marketplace";
import { fetchBeastById } from "../beast";
import type { Listing } from "./types";

function isActiveOrder(order: OrderModel) {
  return (
    order.category.value === CategoryType.Sell &&
    order.status.value === StatusType.Placed
  );
}

function toListingSkeleton(order: OrderModel): Listing {
  return {
    listingId: order.identifier,
    tokenId: order.tokenId.toString(),
    seller: order.owner,
    price: order.price.toString(),
    paymentToken: order.currency,
    active: isActiveOrder(order),
    quantity: order.quantity,
    expiration: order.expiration,
    beast: null,
    orderId: order.id,
  };
}

export async function hydrateOrders(orders: OrderModel[]): Promise<Listing[]> {
  if (orders.length === 0) {
    return [];
  }

  const skeletons = orders.map(toListingSkeleton);
  const uniqueTokenIds = Array.from(
    new Set(skeletons.map((listing) => listing.tokenId))
  );

  const beasts = await Promise.all(
    uniqueTokenIds.map(async (tokenId) => {
      try {
        const beast = await fetchBeastById(tokenId);
        return [tokenId, beast] as const;
      } catch (error) {
        console.error(`Failed to fetch beast metadata for token ${tokenId}`, error);
        return [tokenId, null] as const;
      }
    })
  );

  const beastMap = new Map(beasts);

  return skeletons.map((listing) => ({
    ...listing,
    beast: beastMap.get(listing.tokenId) ?? null,
  }));
}
