import { describe, expect, it, vi } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { hash, transaction, ETransactionVersion, EDataAvailabilityMode, type Call } from "starknet";
import {
  ESTIMATE_SIGNATURE,
  GameAccountSigner,
  executionTypedData,
  gameAccountAddress,
  packEvmSignature,
} from "../src/wallet/gameAccount";

// --- an independent EIP-712 encoder (string / bytes32 fields only), for checking ---
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const bytes = (h: string) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ""), "hex"));
const utf8 = (s: string) => Uint8Array.from(Buffer.from(s, "utf8"));
const concat = (parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]));
type Fields = Array<{ name: string; type: string }>;
function structHash(name: string, fields: Fields, value: Record<string, string>): Uint8Array {
  const typeHash = keccak_256(utf8(`${name}(${fields.map((f) => `${f.type} ${f.name}`).join(",")})`));
  const enc = fields.map((f) => (f.type === "string" ? keccak_256(utf8(value[f.name])) : bytes(value[f.name])));
  return keccak_256(concat([typeHash, ...enc]));
}
function digestOf(data: { types: Record<string, Fields>; primaryType: string; domain: Record<string, string>; message: Record<string, string> }) {
  const domain = structHash("EIP712Domain", data.types.EIP712Domain, data.domain);
  const msg = structHash(data.primaryType, data.types[data.primaryType], data.message);
  return keccak_256(concat([Uint8Array.of(0x19, 0x01), domain, msg]));
}

const PRIV = "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
const OWNER = `0x${hex(keccak_256(Uint8Array.from(secp256k1.getPublicKey(PRIV, false).subarray(1))).subarray(12))}`;

function walletSig(digest: Uint8Array, highS = false): string {
  const sig = secp256k1.sign(digest, PRIV);
  let s = sig.s;
  let v = sig.recovery;
  if (highS) {
    s = secp256k1.CURVE.n - s;
    v = 1 - v;
  }
  return `0x${sig.r.toString(16).padStart(64, "0")}${s.toString(16).padStart(64, "0")}${(27 + v).toString(16)}`;
}

/** The EVM address the packed felts recover to for `digest`. */
function recover(felts: string[], digest: Uint8Array): string {
  const [rl, rh, sl, sh, p] = felts.map((f) => BigInt(f));
  const sig = new secp256k1.Signature(rl + (rh << 128n), sl + (sh << 128n)).addRecoveryBit(Number(p));
  return `0x${hex(keccak_256(Uint8Array.from(sig.recoverPublicKey(digest).toRawBytes(false).subarray(1))).subarray(12))}`;
}

function mockWallet(account = OWNER) {
  const request = vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
    if (method === "eth_accounts") return [account];
    if (method === "eth_signTypedData_v4") return walletSig(digestOf(JSON.parse((params as string[])[1])));
    throw new Error(method);
  });
  return { request };
}

const calls: Call[] = [{ contractAddress: "0x123", entrypoint: "transfer", calldata: ["0x1", "0x2", "0x0"] }];
const DETAILS = {
  walletAddress: "",
  cairoVersion: "1" as const,
  chainId: "0x534e5f4d41494e" as const,
  nonce: 3,
  version: ETransactionVersion.V3,
  resourceBounds: {
    l1_gas: { max_amount: "0x10", max_price_per_unit: "0x20" },
    l2_gas: { max_amount: "0x30", max_price_per_unit: "0x40" },
    l1_data_gas: { max_amount: "0x50", max_price_per_unit: "0x60" },
  },
  tip: 0,
  paymasterData: [],
  accountDeploymentData: [],
  nonceDataAvailabilityMode: EDataAvailabilityMode.L1,
  feeDataAvailabilityMode: EDataAvailabilityMode.L1,
};

describe("Game Account", () => {
  it("derives the account address from the EVM owner (case-insensitive)", () => {
    const a = gameAccountAddress(OWNER);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(gameAccountAddress(OWNER.toUpperCase().replace("0X", "0x"))).toBe(a);
    expect(() => gameAccountAddress("0x1234")).toThrow();
  });

  it("builds Loot Survivor's GameAccountExecution typed data", () => {
    const data = executionTypedData("0xabc", "0x1");
    expect(data.domain).toEqual({ name: "Game Account", version: "1" });
    expect(data.primaryType).toBe("GameAccountExecution");
    expect(data.types.GameAccountExecution.map((f) => f.type)).toEqual(["string", "bytes32", "bytes32"]);
    expect(data.message).toEqual({
      network: "Mainnet",
      gameAccount: `0x${"abc".padStart(64, "0")}`,
      executionHash: `0x${"1".padStart(64, "0")}`,
    });
  });

  it("packs a wallet signature as [r.low, r.high, s.low, s.high, parity] that recovers to the owner", () => {
    const digest = digestOf(executionTypedData(gameAccountAddress(OWNER), "0x1234"));
    const felts = packEvmSignature(walletSig(digest));
    expect(felts).toHaveLength(5);
    expect(recover(felts, digest)).toBe(OWNER);
    // a high-s signature is normalised to the same low-s felts
    expect(packEvmSignature(walletSig(digest, true))).toEqual(felts);
    expect(() => packEvmSignature("0x1234")).toThrow();
  });

  it("signs a V3 invoke through the EVM wallet, and estimates with the placeholder", async () => {
    const wallet = mockWallet();
    const signer = new GameAccountSigner(wallet, OWNER);
    const details = { ...DETAILS, walletAddress: signer.account };

    const estimate = await signer.signTransaction(calls, { ...details, version: ETransactionVersion.F3 });
    expect(estimate).toEqual(ESTIMATE_SIGNATURE);
    expect(wallet.request).not.toHaveBeenCalled();

    const sig = (await signer.signTransaction(calls, details)) as string[];
    const txHash = hash.calculateInvokeTransactionHash({
      ...details,
      senderAddress: details.walletAddress,
      compiledCalldata: transaction.getExecuteCalldata(calls, "1"),
      nonceDataAvailabilityMode: 0,
      feeDataAvailabilityMode: 0,
    });
    expect(recover(sig, digestOf(executionTypedData(signer.account, txHash)))).toBe(OWNER);
  });

  it("refuses to sign when the wallet has switched to another address", async () => {
    const signer = new GameAccountSigner(mockWallet("0x000000000000000000000000000000000000dead"), OWNER);
    await expect(signer.signTransaction(calls, { ...DETAILS, walletAddress: signer.account })).rejects.toThrow(
      /Switch your wallet back/,
    );
  });
});
