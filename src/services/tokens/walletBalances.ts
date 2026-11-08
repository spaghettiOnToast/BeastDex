/**
 * Token balances for the wallet menu, matching the Assets list on the Loot
 * Survivor profile (Provable-Games/death-mountain client/src/utils/networkConfig.ts)
 * plus SKULL. Read straight from the token contracts (`balance_of`).
 */
import { withReadProvider } from "../tx";
import { SKULL_ADDRESS } from "../beast/musicActions";

export type WalletToken = {
  symbol: string;
  /** Label shown in the menu (defaults to symbol). */
  label?: string;
  address: string;
  decimals: number;
  /** Max fraction digits shown. */
  displayDecimals: number;
};

export const WALLET_TOKENS: WalletToken[] = [
  { symbol: "LORDS", address: "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49", decimals: 18, displayDecimals: 2 },
  { symbol: "ETH", address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", decimals: 18, displayDecimals: 4 },
  { symbol: "STRK", address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", decimals: 18, displayDecimals: 2 },
  { symbol: "USDC", address: "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb", decimals: 6, displayDecimals: 2 },
  { symbol: "USDC", label: "USDC.e", address: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8", decimals: 6, displayDecimals: 2 },
  { symbol: "SURVIVOR", address: "0x042dd777885ad2c116be96d4d634abc90a26a790ffb5871e037dd5ae7d2ec86b", decimals: 18, displayDecimals: 2 },
  { symbol: "TICKET", address: "0x0452810188c4cb3aebd63711a3b445755bc0d6c4f27b923fdd99b1a118858136", decimals: 18, displayDecimals: 0 },
  // SKULL v2 (Provable-Games/docs lootsurvivor/skull-token.mdx); v1 converts 1:1 via `convert`.
  { symbol: "SKULL", address: SKULL_ADDRESS, decimals: 18, displayDecimals: 2 },
  { symbol: "SKULL", label: "SKULL (V1)", address: "0x01c3c8284d7eed443b42f47e764032a56eaf50a9079d67993b633930e3689814", decimals: 18, displayDecimals: 2 },
];

export type WalletBalance = WalletToken & { raw: bigint };

/** u256 (low, high) felts -> bigint. */
export function u256ToBigInt(res: string[]): bigint {
  const [low = "0", high = "0"] = res;
  return BigInt(low) + (BigInt(high) << 128n);
}

/** Human amount: "21,435.57", "0.004", "< 0.01" for dust. */
export function formatTokenAmount(raw: bigint, decimals: number, displayDecimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const scale = 10n ** BigInt(displayDecimals);
  const frac = ((raw % base) * scale) / base;
  if (whole === 0n && frac === 0n && raw > 0n) {
    return displayDecimals > 0 ? `< 0.${"0".repeat(displayDecimals - 1)}1` : "< 1";
  }
  const wholeStr = whole.toLocaleString("en-US");
  if (displayDecimals === 0 || frac === 0n) return wholeStr;
  const fracStr = frac.toString().padStart(displayDecimals, "0").replace(/0+$/, "");
  return `${wholeStr}.${fracStr}`;
}

/** Non-zero balances for `address`, in WALLET_TOKENS order (unreadable tokens are skipped). */
export async function fetchWalletBalances(address: string): Promise<WalletBalance[]> {
  const results = await Promise.allSettled(
    WALLET_TOKENS.map((t) =>
      withReadProvider((p) =>
        p.callContract({ contractAddress: t.address, entrypoint: "balance_of", calldata: [address] }, "latest"),
      ).then((res) => ({ ...t, raw: u256ToBigInt(res) })),
    ),
  );
  return results.flatMap((r) => (r.status === "fulfilled" && r.value.raw > 0n ? [r.value] : []));
}
