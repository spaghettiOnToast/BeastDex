import { useMemo } from "react";
import { braavos, ready, useInjectedConnectors, type Connector } from "@starknet-react/core";
import { controllerCompatConnector, controllerConnector } from "./controller";
import controllerIcon from "../assets/cartridge-icon.svg";

/** Where to get a recommended wallet that isn't installed. */
export const WALLET_INSTALL_URLS: Record<string, string> = {
  argentX: "https://www.ready.co/ready-wallet",
  braavos: "https://braavos.app/download-braavos-wallet/",
};

/** Display names (Argent X rebranded to Ready X; its connector id stays `argentX`). */
export const WALLET_NAMES: Record<string, string> = {
  argentX: "Ready X",
  braavos: "Braavos",
  controller: "Cartridge Controller",
};

export function walletName(connector: Pick<Connector, "id" | "name">): string {
  if (connector.id === controllerConnector.id) return WALLET_NAMES.controller;
  return WALLET_NAMES[connector.id] ?? connector.name;
}

/**
 * Every wallet the app offers: Cartridge Controller (passkey, Google, Discord,
 * password, or an EVM wallet: MetaMask / Rabby / WalletConnect), then every
 * injected Starknet wallet found in the browser (Ready X, Braavos, Keplr, OKX,
 * Fordefi, ...). Ready X and Braavos are always listed, with an install link
 * when missing.
 */
export function useWalletConnectors(): Connector[] {
  const { connectors: injected } = useInjectedConnectors({
    recommended: [ready(), braavos()],
    includeRecommended: "always",
    order: "alphabetical",
  });
  const key = injected.map((c) => c.id).join(",");
  return useMemo(
    () => [controllerCompatConnector, ...injected.filter((c) => c.id !== controllerConnector.id)],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-memo only when the wallet set changes
    [key],
  );
}

/** Connector icon (string, or {dark, light}) as an <img src>. */
export function connectorIconSrc(connector: Connector): string | null {
  if (connector.id === controllerConnector.id) return controllerIcon;
  const icon = connector.icon as string | { dark?: string; light?: string } | undefined;
  const raw = typeof icon === "string" ? icon : icon?.dark ?? icon?.light;
  if (!raw) return null;
  return raw.trimStart().startsWith("<svg") ? `data:image/svg+xml;utf8,${encodeURIComponent(raw)}` : raw;
}
