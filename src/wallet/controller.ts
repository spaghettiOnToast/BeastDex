import ControllerConnector from "@cartridge/connector";
import type { Connector } from "@starknet-react/core";
import { mainnet } from "@starknet-react/chains";
import { bigintToHex } from "../utils/hex";

const chainRpcUrls = [{ rpcUrl: mainnet.rpcUrls.cartridge.http[0] }];

export const controllerConnector = new ControllerConnector({
  chains: chainRpcUrls,
  defaultChainId: bigintToHex(mainnet.id),
  preset: "loot-survivor",
  slot: "pg-mainnet-3",
});

// The current @starknet-react release expects an externalDetectWallets hook.
// Cartridge's connector does not expose it, so provide a harmless stub.
const withDetection = controllerConnector as ControllerConnector & {
  externalDetectWallets?: () => Promise<unknown[]>;
};
if (typeof withDetection.externalDetectWallets !== "function") {
  withDetection.externalDetectWallets = async () => [];
}

export const connectors: Connector[] = [controllerConnector];
