import { useCallback, useEffect, useState } from "react";
import { useAccount, useDisconnect } from "@starknet-react/core";

import { AtSign, ChevronDown, LogOut, User, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { controllerConnector } from "../../wallet/controller";
import { connectorIconSrc, walletName } from "../../wallet/connectors";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ControllerConnector } from "@cartridge/connector";
import { useTermsOfService } from "../../contexts/TermsOfServiceContext";
import { WalletConnectDialog } from "./WalletConnectDialog";
import { MarketplaceApprovals } from "./MarketplaceApprovals";
import { WalletBalances } from "./WalletBalances";
import { MARKETPLACE_ENABLED } from "../../services/marketplace/constants";
import { BROTHER_ID_URL, lookupWalletNames } from "../../services/walletNames";
import { normaliseStarknetAddress } from "../../utils/address";

type ControllerProfile = {
  username?: string | null;
  controller?: { username?: string | null } | null;
  handle?: string | null;
  account?: { name?: string | null } | null;
};

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function WalletButton() {
  const { address, connector } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const [username, setUsername] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { promptToSAcceptance, hasAcceptedToS } = useTermsOfService();
  const navigate = useNavigate();

  const isController = connector?.id === controllerConnector.id;

  // Controller accounts have a username; other wallets show their address.
  useEffect(() => {
    let cancelled = false;
    if (!address || !isController || !connector) {
      setUsername(null);
      return;
    }
    (async () => {
      try {
        const profile = (connector as unknown as ControllerConnector & { controller?: { profile?: ControllerProfile } })
          .controller?.profile;
        const resolved =
          profile?.username ??
          profile?.controller?.username ??
          profile?.handle ??
          profile?.account?.name ??
          (await (connector as unknown as ControllerConnector).username?.()) ??
          null;
        if (!cancelled) setUsername(resolved);
      } catch (error) {
        console.error("Failed to fetch controller username", error);
        if (!cancelled) setUsername(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, isController, connector]);

  // Other wallets (Ready, Braavos, …): show their .brother name when they have one.
  const [walletName_, setWalletName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setWalletName(null);
    if (!address || isController) return;
    const key = normaliseStarknetAddress(address);
    lookupWalletNames([address])
      .then((names) => {
        if (!cancelled && key) setWalletName(names[key] ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address, isController]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectAsync();
      await (connector as unknown as { disconnect?: () => Promise<void> })?.disconnect?.();
    } catch (error) {
      console.error("Failed to disconnect wallet", error);
    }
    setUsername(null);
  }, [disconnectAsync, connector]);

  // Terms of Service: required for any connected wallet (also on page refresh).
  useEffect(() => {
    if (address && !hasAcceptedToS) {
      promptToSAcceptance(disconnect);
    }
  }, [address, hasAcceptedToS, promptToSAcceptance, disconnect]);

  if (!address) {
    return (
      <>
        <Button
          variant="outline"
          onClick={() => setPickerOpen(true)}
          className="text-xs font-semibold uppercase tracking-wide border-lsGold text-lsGold hover:bg-gray-900 hover:text-lsGold h-8 sm:h-9 px-2 sm:px-3 md:min-w-[120px]"
        >
          <Wallet className="h-4 w-4" />
          <span className="hidden sm:inline">Connect</span>
        </Button>
        <WalletConnectDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      </>
    );
  }

  const label = username ?? walletName_ ?? shortAddress(address);
  const icon = connector ? connectorIconSrc(connector) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="bg-[#fbcb4a] text-black text-xs font-semibold uppercase tracking-wide hover:bg-[#f0b833] hover:text-black h-8 sm:h-9 px-2 sm:px-3 md:min-w-[120px]">
          {icon && (
            <span className="inline-flex h-4 w-4 items-center justify-center">
              <img src={icon} alt={connector ? walletName(connector) : "Wallet"} className="h-4 w-4 rounded-sm" />
            </span>
          )}
          <span className="truncate max-w-[60px] sm:max-w-[80px] normal-case">{label}</span>
          <ChevronDown className="h-3 w-3 text-gray-700 hidden sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-60 text-xs text-zinc-300"
        style={{
          background: "#18181b",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          borderRadius: "0.5rem",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.5)",
        }}
      >
        {connector && (
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
            {walletName(connector)}
          </div>
        )}
        <WalletBalances address={address} />
        <DropdownMenuSeparator className="bg-white/[0.06]" />
        <DropdownMenuItem
          onClick={() => navigate(`/account/${encodeURIComponent(username || address)}`)}
          className="cursor-pointer focus:bg-white/[0.06] focus:text-white"
        >
          <User className="h-4 w-4" />
          Profile
        </DropdownMenuItem>
        {!username && !walletName_ && (
          <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/[0.06] focus:text-white">
            <a href={BROTHER_ID_URL} target="_blank" rel="noreferrer">
              <AtSign className="h-4 w-4" />
              Set username
            </a>
          </DropdownMenuItem>
        )}
        {isController && (
          <DropdownMenuItem
            onClick={() => {
              try {
                (connector as unknown as ControllerConnector).controller?.openProfile();
              } catch (error) {
                console.error("Failed to open wallet dashboard", error);
              }
            }}
            className="cursor-pointer focus:bg-white/[0.06] focus:text-white"
          >
            <Wallet className="h-4 w-4" />
            Wallet Dashboard
          </DropdownMenuItem>
        )}
        {MARKETPLACE_ENABLED && <MarketplaceApprovals />}
        <DropdownMenuSeparator className="bg-white/[0.06]" />
        <DropdownMenuItem
          onClick={disconnect}
          className="cursor-pointer text-red-400 focus:bg-white/[0.06] focus:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default WalletButton;
