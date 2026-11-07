/**
 * Arcade marketplace order types (replaces the proprietary `@cartridge/arcade`
 * SDK, from which only these were used). Values mirror the on-chain
 * `ARCADE-Order` model: category/status are stored as enum indices.
 */

export const CategoryType = { None: "None", Buy: "Buy", Sell: "Sell" } as const;
export type CategoryType = (typeof CategoryType)[keyof typeof CategoryType];

export const StatusType = { None: "None", Placed: "Placed", Canceled: "Canceled", Executed: "Executed" } as const;
export type StatusType = (typeof StatusType)[keyof typeof StatusType];

/** Index order of the Cairo enums (`ARCADE-Order.category` / `.status`). */
export const CATEGORY_BY_INDEX = [CategoryType.None, CategoryType.Buy, CategoryType.Sell] as const;
export const STATUS_BY_INDEX = [StatusType.None, StatusType.Placed, StatusType.Canceled, StatusType.Executed] as const;

/** An Arcade order (listing = Sell, offer = Buy). */
export interface OrderModel {
  identifier: string;
  id: number;
  category: { value: CategoryType; into?: () => number };
  status: { value: StatusType; into?: () => number };
  expiration: number;
  collection: string;
  /** v3 beast ids are 251-bit: keep as bigint/decimal string, never a JS number */
  tokenId: bigint | string | number;
  quantity: number;
  price: bigint | string | number;
  currency: string;
  owner: string;
}
