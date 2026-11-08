import { ControllerConnector } from "@cartridge/connector";
import type { Connector } from "@starknet-react/core";
import { mainnet } from "@starknet-react/chains";

export const controllerConnector = new ControllerConnector({
  chains: [{ rpcUrl: mainnet.rpcUrls.cartridge.http[0] }],
  defaultChainId: "0x534e5f4d41494e",
  // Sign-in methods offered inside Controller. The EVM wallets (MetaMask,
  // Rabby, WalletConnect) sign in to a Starknet Controller account.
  signupOptions: ["webauthn", "google", "discord", "password", "metamask", "rabby", "walletconnect"],
});

// Cartridge's RPC now refuses calls from other sites (401 "Unauthorized"; it only
// serves requests from its own keychain origin), yet the Controller answers
// `wallet_requestChainId` by asking that RPC from our page, which breaks connect.
// BeastDex is mainnet-only and Controller only allows Cartridge's RPC, so answer
// the chain id locally. (Signing and execution still go through the keychain.)
const SN_MAIN = "0x534e5f4d41494e";
type ControllerRequest = (call: { type: string; params?: unknown }) => Promise<unknown>;
const controllerProvider = (controllerConnector as unknown as { controller: { request: ControllerRequest; account?: unknown } }).controller;
const originalRequest = controllerProvider.request.bind(controllerProvider);
controllerProvider.request = async (call) => {
  if (call?.type === "wallet_requestChainId" && controllerProvider.account) return SN_MAIN;
  return originalRequest(call);
};

// The current @starknet-react release expects additional methods.
// Add them if they don't exist
const withCompat = controllerConnector as ControllerConnector & {
  externalDetectWallets?: () => Promise<unknown[]>;
  request?: <T extends any>(call: any) => Promise<T>;
};

if (typeof withCompat.externalDetectWallets !== "function") {
  withCompat.externalDetectWallets = async () => [];
}

if (typeof withCompat.request !== "function") {
  withCompat.request = async <T extends any>(call: any): Promise<T> => {
    // Delegate to the controller's request method if available, or return a dummy response
    if (
      "request" in controllerConnector &&
      typeof controllerConnector.request === "function"
    ) {
      return await (controllerConnector as any).request(call);
    }
    throw new Error(`Request method not implemented: ${call.type}`);
  };
}

export const controllerCompatConnector = withCompat as unknown as Connector;

/** @deprecated use `useWalletConnectors()` (Controller + injected wallets). */
export const connectors: Connector[] = [controllerCompatConnector];
