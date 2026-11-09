/**
 * Network fee comparison across Starknet wallets for marketplace actions.
 *
 * fee ≈ (gas used by the calls + the wallet's own overhead) × current gas price
 *
 * The calls cost the same whichever wallet sends them; wallets differ only in
 * their overhead (signature check, account wrapper, signature data). Both were
 * measured from execution traces of mainnet transactions on 2026-11-09:
 *  - calls: median L2 gas of each marketplace entrypoint over ~270 traced
 *    marketplace / Ekubo transactions; NFT transfers simulated on the game core
 *    and Beasts contracts
 *  - overhead: (total L2 gas − gas of the calls) per wallet class
 *    · Ready / Argent X (v0.4/0.5): ~1.4–1.9M (median 1.66M on 79 single-call txs)
 *    · Braavos (v1.0.0): ~2.1M (41 txs; its signature check costs twice Argent's)
 *    · Cartridge Controller, session already used: ~4.4M
 *    · Controller, first tx of a session (verifies the sign-in once, then caches):
 *      ~26M with a Google/Discord/EVM-wallet sign-in, ~58M with a passkey
 *  Checked against receipts: Controller listing (cached session) modelled at
 *  9.72M L2 gas vs 9,726,000 actual.
 */
import { withReadProvider } from "../tx";

export const FEES_MEASURED_ON = "2026-11-09";

/** Median L2 gas of each call type. */
export const ACTION_L2_GAS = {
  list: 5_291_840,
  buy: 10_682_240, // marketplace `execute`
  offer: 4_051_840,
  cancel: 4_822_400,
  approveToken: 200_960, // ERC20 approve
  approveCollection: 155_840, // set_approval_for_all
  nftTransfer: 1_171_200, // Beasts transfer_from (games ~971k)
  /** one Ekubo swap: transfer in + multihop + clear_minimum + clear */
  swap: 440_960 + 8_199_360 + 800_960 + 200_000,
} as const;

export type ActionKind = keyof typeof ACTION_L2_GAS;
export type ActionCounts = Partial<Record<ActionKind, number>>;

export type WalletProfile = "ready" | "braavos" | "controller" | "controllerFirstSocial" | "controllerFirstPasskey";

/** Per-transaction overhead of each wallet, L2 gas. */
export const WALLET_OVERHEAD_L2: Record<WalletProfile, number> = {
  ready: 1_600_000,
  braavos: 2_130_000,
  controller: 4_430_000,
  controllerFirstSocial: 26_000_000,
  controllerFirstPasskey: 58_000_000,
};

export const WALLET_LABELS: Record<WalletProfile, string> = {
  ready: "Ready X",
  braavos: "Braavos",
  controller: "Controller",
  controllerFirstSocial: "Controller, 1st tx after login (Google/Discord/EVM)",
  controllerFirstPasskey: "Controller, 1st tx after login (passkey)",
};

/** Median L1 data gas per marketplace tx (state diffs; tiny next to L2 gas). */
const L1_DATA_GAS = 832;

export type GasPrices = { l2Fri: bigint; l1DataFri: bigint; block: number };

export async function fetchGasPrices(): Promise<GasPrices> {
  const block = (await withReadProvider((p) => p.getBlockWithTxHashes("latest"))) as {
    block_number: number;
    l2_gas_price?: { price_in_fri: string };
    l1_data_gas_price?: { price_in_fri: string };
  };
  return {
    l2Fri: BigInt(block.l2_gas_price?.price_in_fri ?? "0x0"),
    l1DataFri: BigInt(block.l1_data_gas_price?.price_in_fri ?? "0x0"),
    block: block.block_number,
  };
}

/** L2 gas used by the calls of a transaction. */
export function callsL2Gas(actions: ActionCounts): number {
  return (Object.entries(actions) as Array<[ActionKind, number | undefined]>).reduce(
    (sum, [kind, n]) => sum + ACTION_L2_GAS[kind] * (n ?? 0),
    0,
  );
}

/** Estimated fee in fri (1e-18 STRK) for a wallet sending these calls as one transaction. */
export function estimateFeeFri(actions: ActionCounts, wallet: WalletProfile, prices: GasPrices): bigint {
  const l2 = BigInt(callsL2Gas(actions) + WALLET_OVERHEAD_L2[wallet]);
  return l2 * prices.l2Fri + BigInt(L1_DATA_GAS) * prices.l1DataFri;
}

/** Which profile the connected wallet is (by starknet-react connector id), if known. */
export function profileForConnector(connectorId: string | undefined, controllerId: string): WalletProfile | null {
  if (!connectorId) return null;
  if (connectorId === controllerId) return "controller";
  if (connectorId === "argentX" || connectorId === "ready") return "ready";
  if (connectorId === "braavos") return "braavos";
  return null;
}
