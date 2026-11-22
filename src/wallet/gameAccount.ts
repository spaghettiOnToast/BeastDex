/**
 * Loot Survivor "Game Account" (shown as "EVM" in its sign-in): a Starknet
 * account whose owner is an EVM wallet (Rabby, MetaMask, ...). The owner signs
 * every Starknet transaction as EIP-712 typed data, so the same account and
 * wallet work on BeastDex.
 *
 * Ported from lootsurvivor.io (not published as a package):
 * - address = contract address of CLASS_HASH, salt APP_SALT, constructor [owner],
 *   deployer 0 (the account is deployed on first use on Loot Survivor);
 * - signature = [r.low, r.high, s.low, s.high, y_parity] with low-s;
 * - fee estimates run validation with a placeholder signature on the query
 *   version, so the secp256k1 check is priced in.
 *
 * Gas is self-paid in STRK from the Game Account: Loot Survivor's paymaster only
 * sponsors gameplay, and its session keys live on lootsurvivor.io.
 */
import {
  Account,
  ETransactionVersion,
  Signer,
  hash,
  num,
  typedData as snTypedData,
  type AllowArray,
  type BigNumberish,
  type Call,
  type CairoVersion,
  type InvocationsSignerDetails,
  type ProviderInterface,
  type Signature,
  type TypedData,
  type UniversalDetails,
} from "starknet";
import { Connector, ConnectorNotConnectedError, UserRejectedRequestError } from "@starknet-react/core";
import { getEvmWallet, waitForEvmWallet, type Eip1193Provider } from "./eip6963";
import { resolveRpcUrl } from "../services/tx";

type ConnectorData = { account?: string; chainId?: bigint };

export const GAME_ACCOUNT_CLASS_HASH = "0x5b73fb61b1d43327bf6bc8eb5ba1f83ae5ff8a798edcb575a04e6d6f365aed7";
export const GAME_ACCOUNT_SALT = "0x28c0d654fe3920e7ad3c57ec34c195476b373ecd1537a37f5c4fb5234987ed0";
const SN_MAIN = "0x534e5f4d41494e";
const NETWORK = "Mainnet";
/** Placeholder signature Loot Survivor signs fee-estimate (query) transactions with. */
export const ESTIMATE_SIGNATURE = ["0x1", "0x0", "0x1", "0x0", "0x0"];
/** Loot Survivor sends owner-signed transactions with a 1 FRI tip; match it. */
const GAME_ACCOUNT_TIP = 1n;
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const U128 = 1n << 128n;

const pad64 = (v: BigNumberish) => `0x${BigInt(v).toString(16).padStart(64, "0")}`;

/** The Game Account address an EVM owner controls (same on every site). */
export function gameAccountAddress(owner: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner) || BigInt(owner) === 0n) throw new Error("Not an EVM address");
  return pad64(hash.calculateContractAddressFromHash(GAME_ACCOUNT_SALT, GAME_ACCOUNT_CLASS_HASH, [owner.toLowerCase()], 0));
}

type Eip712 = {
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  domain: { name: string; version: string };
  message: Record<string, string>;
};

function gameAccountTypedData(primaryType: string, field: string, account: string, value: string): Eip712 {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
      ],
      [primaryType]: [
        { name: "network", type: "string" },
        { name: "gameAccount", type: "bytes32" },
        { name: field, type: "bytes32" },
      ],
    },
    primaryType,
    domain: { name: "Game Account", version: "1" },
    message: { network: NETWORK, gameAccount: pad64(account), [field]: pad64(value) },
  };
}

/** What the owner signs for a transaction (`executionHash` = the Starknet tx hash). */
export const executionTypedData = (account: string, executionHash: string) =>
  gameAccountTypedData("GameAccountExecution", "executionHash", account, executionHash);

/** What the owner signs for a SNIP-12 message (`messageHash` = its Starknet hash). */
export const messageTypedData = (account: string, messageHash: string) =>
  gameAccountTypedData("GameAccountMessage", "messageHash", account, messageHash);

/** A 65-byte wallet signature as the account's felts: r and s split into u128 halves, low-s, y parity. */
export function packEvmSignature(sig: string): string[] {
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) throw new Error("The wallet did not return a supported signature.");
  const r = BigInt(`0x${sig.slice(2, 66)}`);
  let s = BigInt(`0x${sig.slice(66, 130)}`);
  const v = Number.parseInt(sig.slice(130), 16);
  if (![0, 1, 27, 28].includes(v) || r === 0n || r >= SECP256K1_N || s === 0n || s >= SECP256K1_N) {
    throw new Error("The wallet did not return a supported signature.");
  }
  let parity = v >= 27 ? v - 27 : v;
  if (s > SECP256K1_N / 2n) {
    s = SECP256K1_N - s;
    parity = 1 - parity;
  }
  return [r % U128, r / U128, s % U128, s / U128, BigInt(parity)].map((x) => num.toHex(x));
}

const isQueryVersion = (version: string | undefined) => !!version && BigInt(version) >= 1n << 128n;

/** starknet.js signer that asks the EVM owner for an EIP-712 signature. */
export class GameAccountSigner extends Signer {
  readonly owner: string;
  readonly account: string;
  private readonly wallet: Eip1193Provider;

  constructor(wallet: Eip1193Provider, owner: string) {
    super("0x1"); // unused stark key; every signature comes from the EVM wallet
    this.wallet = wallet;
    this.owner = owner.toLowerCase();
    this.account = gameAccountAddress(owner);
  }

  async getPubKey(): Promise<string> {
    return this.owner;
  }

  async signTransaction(transactions: Call[], details: InvocationsSignerDetails): Promise<Signature> {
    if (BigInt(details.walletAddress) !== BigInt(this.account)) throw new Error("This wallet only signs for its own Game Account.");
    if (isQueryVersion(details.version)) return [...ESTIMATE_SIGNATURE];
    if (BigInt(details.version) !== 3n) throw new Error("Game Accounts only sign V3 transactions.");
    return super.signTransaction(transactions, details);
  }

  async signMessage(data: TypedData, accountAddress: string): Promise<Signature> {
    if (BigInt(accountAddress) !== BigInt(this.account)) throw new Error("This wallet only signs for its own Game Account.");
    return this.ownerSign(messageTypedData(this.account, snTypedData.getMessageHash(data, accountAddress)));
  }

  /** Invoke hashes from `Signer.signTransaction` land here. */
  protected async signRaw(msgHash: string): Promise<Signature> {
    return this.ownerSign(executionTypedData(this.account, msgHash));
  }

  async signDeployAccountTransaction(): Promise<Signature> {
    throw new Error("Set up your Game Account by playing on Loot Survivor first.");
  }

  async signDeclareTransaction(): Promise<Signature> {
    throw new Error("Game Accounts never declare classes.");
  }

  private async ownerSign(data: Eip712): Promise<string[]> {
    const accounts = (await this.wallet.request({ method: "eth_accounts" })) as string[];
    if (String(accounts?.[0] ?? "").toLowerCase() !== this.owner) {
      throw new Error(`Switch your wallet back to ${this.owner} to sign for this Game Account.`);
    }
    let sig: unknown;
    try {
      sig = await this.wallet.request({ method: "eth_signTypedData_v4", params: [this.owner, JSON.stringify(data)] });
    } catch (err) {
      if ((err as { code?: number })?.code === 4001) throw new Error("You rejected the request in your wallet.");
      throw err;
    }
    return packEvmSignature(String(sig));
  }
}

/** Account whose fee estimates include signature validation (like Loot Survivor's). */
export class GameAccount extends Account {
  /**
   * Uses its own RPC client on the "latest" block: the app's RPC (Provable)
   * rejects starknet.js's default "pending" tag, which would break the nonce,
   * fee estimates and the deployment check. Injected wallets and Controller
   * never hit this because they send through their own RPC.
   */
  constructor(signer: GameAccountSigner, cairoVersion: CairoVersion = "1") {
    super({ nodeUrl: resolveRpcUrl(), blockIdentifier: "latest", specVersion: "0.8.1" }, signer.account, signer, cairoVersion, ETransactionVersion.V3);
  }

  estimateInvokeFee(calls: AllowArray<Call>, details: UniversalDetails = {}) {
    return super.estimateInvokeFee(calls, { tip: GAME_ACCOUNT_TIP, ...details, skipValidate: false, version: ETransactionVersion.V3 });
  }

  estimateFeeBulk(...args: Parameters<Account["estimateFeeBulk"]>) {
    const [invocations, details = {}] = args;
    return super.estimateFeeBulk(invocations, { ...details, skipValidate: false, version: ETransactionVersion.V3 });
  }

  async execute(transactions: AllowArray<Call>, details: UniversalDetails = {}) {
    if (!(await isDeployed(this, this.address))) {
      throw new Error("This Game Account isn't set up yet. Play a game on Loot Survivor with this wallet first.");
    }
    return super.execute(transactions, { tip: GAME_ACCOUNT_TIP, ...details });
  }
}

/** False only when the RPC says no contract lives there (code 20); other RPC errors surface as-is. */
async function isDeployed(provider: ProviderInterface, address: string): Promise<boolean> {
  try {
    await provider.getClassHashAt(address, "latest");
    return true;
  } catch (err) {
    if (/\b20\b|contract not found/i.test(err instanceof Error ? err.message : String(err))) return false;
    throw err;
  }
}

/** A generic wallet glyph for an EVM wallet that hasn't announced itself (not installed). */
const FALLBACK_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#d4a017" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12.5h2M3 9h18"/></svg>`,
  );

export const GAME_ACCOUNT_ID_PREFIX = "game-account:";
export const isGameAccountConnectorId = (id: string | undefined) => !!id && id.startsWith(GAME_ACCOUNT_ID_PREFIX);

/** One connector per EVM wallet (by EIP-6963 rdns): connecting signs in to that wallet's Game Account. */
export class GameAccountConnector extends Connector {
  readonly rdns: string;
  private readonly fallbackName: string;
  private owner?: string;
  private provider?: Eip1193Provider;
  private onAccountsChanged = (accounts: unknown) => {
    const next = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0].toLowerCase() : undefined;
    if (!next) {
      this.detach();
      this.emit("disconnect");
      return;
    }
    if (next === this.owner) return;
    this.owner = next;
    this.emit("change", { account: gameAccountAddress(next), chainId: BigInt(SN_MAIN) });
  };

  constructor(rdns: string, fallbackName: string) {
    super();
    this.rdns = rdns;
    this.fallbackName = fallbackName;
  }

  get id() {
    return `${GAME_ACCOUNT_ID_PREFIX}${this.rdns}`;
  }

  get name() {
    return getEvmWallet(this.rdns)?.info.name ?? this.fallbackName;
  }

  get icon() {
    const icon = getEvmWallet(this.rdns)?.info.icon || FALLBACK_ICON;
    return { dark: icon, light: icon };
  }

  available(): boolean {
    return !!getEvmWallet(this.rdns);
  }

  async ready(): Promise<boolean> {
    const wallet = await waitForEvmWallet(this.rdns);
    if (!wallet) return false;
    try {
      const accounts = (await wallet.provider.request({ method: "eth_accounts" })) as string[];
      return Array.isArray(accounts) && accounts.length > 0;
    } catch {
      return false;
    }
  }

  async connect(): Promise<ConnectorData> {
    const wallet = await waitForEvmWallet(this.rdns);
    if (!wallet) throw new Error(`${this.fallbackName} isn't installed.`);
    let accounts: string[];
    try {
      accounts = (await wallet.provider.request({ method: "eth_requestAccounts" })) as string[];
    } catch (err) {
      if ((err as { code?: number })?.code === 4001) throw new UserRejectedRequestError();
      throw err;
    }
    const owner = accounts?.[0]?.toLowerCase();
    if (!owner) throw new Error("No account selected in your wallet.");
    this.detach();
    this.provider = wallet.provider;
    this.owner = owner;
    wallet.provider.on?.("accountsChanged", this.onAccountsChanged);
    const data = { account: gameAccountAddress(owner), chainId: BigInt(SN_MAIN) };
    this.emit("connect", data);
    return data;
  }

  async disconnect(): Promise<void> {
    this.detach();
    this.emit("disconnect");
  }

  async account() {
    if (!this.owner || !this.provider) throw new ConnectorNotConnectedError();
    return new GameAccount(new GameAccountSigner(this.provider, this.owner));
  }

  /** The EVM wallet address that owns the connected Game Account. */
  get ownerAddress(): string | undefined {
    return this.owner;
  }

  async chainId(): Promise<bigint> {
    return BigInt(SN_MAIN);
  }

  // starknet-react's wallet API: what its hooks (useSendTransaction, useSignTypedData) ask for.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async request(call: any): Promise<any> {
    if (!this.owner || !this.provider) throw new ConnectorNotConnectedError();
    const address = gameAccountAddress(this.owner);
    switch (call?.type) {
      case "wallet_getPermissions":
        return ["accounts"];
      case "wallet_requestAccounts":
        return [address];
      case "wallet_requestChainId":
        return SN_MAIN;
      case "wallet_addInvokeTransaction": {
        const account = new GameAccount(new GameAccountSigner(this.provider, this.owner));
        const calls = (call.params?.calls ?? []).map((c: { contract_address: string; entry_point: string; calldata?: string[] }) => ({
          contractAddress: c.contract_address,
          entrypoint: c.entry_point,
          calldata: c.calldata ?? [],
        }));
        return account.execute(calls);
      }
      case "wallet_signTypedData": {
        const signer = new GameAccountSigner(this.provider, this.owner);
        return signer.signMessage(call.params as TypedData, address);
      }
      default:
        throw new Error(`Game Accounts don't support ${call?.type}.`);
    }
  }

  private detach() {
    this.provider?.removeListener?.("accountsChanged", this.onAccountsChanged);
    this.provider = undefined;
    this.owner = undefined;
  }
}
