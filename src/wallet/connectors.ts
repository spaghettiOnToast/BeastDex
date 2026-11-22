import { useMemo, useSyncExternalStore } from "react";
import { braavos, ready, useInjectedConnectors, type Connector } from "@starknet-react/core";
import { controllerCompatConnector, controllerConnector } from "./controller";
import { GameAccountConnector, GAME_ACCOUNT_ID_PREFIX, isGameAccountConnectorId } from "./gameAccount";
import { getEvmWallets, subscribeEvmWallets } from "./eip6963";
import controllerIcon from "../assets/cartridge-icon.svg";

/** Rabby is always offered for Game Accounts (with an install link when missing). */
const RABBY_RDNS = "io.rabby";

/** Where to get a recommended wallet that isn't installed. */
export const WALLET_INSTALL_URLS: Record<string, string> = {
  argentX: "https://www.ready.co/ready-wallet",
  braavos: "https://braavos.app/download-braavos-wallet/",
  [`${GAME_ACCOUNT_ID_PREFIX}${RABBY_RDNS}`]: "https://rabby.io/",
};

/** Display names (Argent X rebranded to Ready X; its connector id stays `argentX`). */
export const WALLET_NAMES: Record<string, string> = {
  argentX: "Ready X",
  braavos: "Braavos",
  controller: "Cartridge Controller",
};

export function walletName(connector: Pick<Connector, "id" | "name">): string {
  if (connector.id === controllerConnector.id) return WALLET_NAMES.controller;
  if (isGameAccountConnectorId(connector.id)) return "Game Account";
  return WALLET_NAMES[connector.id] ?? connector.name;
}

const gameAccountConnectors = new Map<string, GameAccountConnector>();
function gameAccountConnector(rdns: string, name: string): GameAccountConnector {
  let c = gameAccountConnectors.get(rdns);
  if (!c) gameAccountConnectors.set(rdns, (c = new GameAccountConnector(rdns, name)));
  return c;
}

/** The last Game Account wallet used, so autoConnect finds its connector on the first render. */
function lastGameAccountRdns(): string | null {
  try {
    const id = localStorage.getItem("lastUsedConnector");
    return id && isGameAccountConnectorId(id) ? id.slice(GAME_ACCOUNT_ID_PREFIX.length) : null;
  } catch {
    return null;
  }
}

/** Game Account connectors: Rabby, the last one used, and every EVM wallet announced via EIP-6963. */
function useGameAccountConnectors(): GameAccountConnector[] {
  const wallets = useSyncExternalStore(subscribeEvmWallets, getEvmWallets, getEvmWallets);
  return useMemo(() => {
    const list = [gameAccountConnector(RABBY_RDNS, "Rabby")];
    const last = lastGameAccountRdns();
    if (last && last !== RABBY_RDNS) list.push(gameAccountConnector(last, last));
    for (const w of wallets) if (!list.some((c) => c.rdns === w.info.rdns)) list.push(gameAccountConnector(w.info.rdns, w.info.name));
    return list;
  }, [wallets]);
}

/**
 * Every wallet the app offers: Cartridge Controller (passkey, Google, Discord,
 * password, or an EVM wallet: MetaMask / Rabby / WalletConnect), then every
 * injected Starknet wallet found in the browser (Ready X, Braavos, Keplr, OKX,
 * Fordefi, ...), then a Loot Survivor Game Account per EVM wallet (Rabby,
 * MetaMask, ...). Ready X, Braavos and Rabby are always listed, with an
 * install link when missing.
 */
export function useWalletConnectors(): Connector[] {
  const { connectors: injected } = useInjectedConnectors({
    recommended: [ready(), braavos()],
    includeRecommended: "always",
    order: "alphabetical",
  });
  const gameAccounts = useGameAccountConnectors();
  const key = [...injected, ...gameAccounts].map((c) => c.id).join(",");
  return useMemo(
    () => [controllerCompatConnector, ...injected.filter((c) => c.id !== controllerConnector.id), ...gameAccounts],
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
