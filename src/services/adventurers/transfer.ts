import type { Call } from "starknet";
import { toUint256Hex } from "../../utils/uint256";
import { GAME_CORE_ADDRESS } from "./constants";

/** ERC721 `transfer_from` of one game token (ids exceed 128 bits: always split as u256). */
export function buildGameTransferCall(from: string, to: string, tokenId: string): Call {
  return {
    contractAddress: GAME_CORE_ADDRESS,
    entrypoint: "transfer_from",
    calldata: [from, to, ...toUint256Hex(BigInt(tokenId))],
  };
}
