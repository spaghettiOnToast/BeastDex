import { SUMMIT_TABLE_NAME } from "./constants";

export function buildSummitBeastQuery(tokenId: number) {
  return `
    SELECT *
    FROM "${SUMMIT_TABLE_NAME}"
    WHERE token_id = ${tokenId}
    ORDER BY internal_executed_at DESC
    LIMIT 1;
  `;
}
