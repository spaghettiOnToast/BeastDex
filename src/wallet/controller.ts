import { ControllerConnector } from "@cartridge/connector";
import type { Connector } from "@starknet-react/core";
import { mainnet } from "@starknet-react/chains";

export const controllerConnector = new ControllerConnector({
  chains: [{ rpcUrl: mainnet.rpcUrls.cartridge.http[0] }],
  defaultChainId: "0x534e5f4d41494e",
  slot:
    (import.meta.env.VITE_CONTROLLER_SLOT as string | undefined)?.trim() ||
    "pg-mainnet-7",
});

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

export const connectors: Connector[] = [withCompat as unknown as Connector];
