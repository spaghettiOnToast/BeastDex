import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";


import { ChevronDown, LogOut, Wallet } from "lucide-react";
import { controllerConnector } from "../../wallet/controller";
import controllerIcon from "../../assets/cartridge-icon.svg";
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

type ControllerProfile = {
  username?: string | null;
  controller?: { username?: string | null } | null;
  handle?: string | null;
  account?: { name?: string | null } | null;
};

export function WalletButton() {
  const { address } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const [username, setUsername] = useState<string | null>(null);
  const { promptToSAcceptance, hasAcceptedToS } = useTermsOfService();

  const activeConnector = useMemo(() => {
    return (
      connectors.find((connector) => connector.id === controllerConnector.id) ??
      controllerConnector
    );
  }, [connectors]);

  useEffect(() => {
    let cancelled = false;

    async function fetchUsername() {
      if (!address) {
        setUsername(null);
        return;
      }
      try {
        const profile = (activeConnector as any).controller?.profile as
          | ControllerProfile
          | null
          | undefined;
        const nameFromState =
          profile?.username ??
          profile?.controller?.username ??
          profile?.handle ??
          profile?.account?.name ??
          null;
        const resolved =
          nameFromState ??
          (await (activeConnector as ControllerConnector).username?.()) ??
          null;
        if (!cancelled) {
          setUsername(resolved);
        }
      } catch (error) {
        console.error("Failed to fetch controller username", error);
        if (!cancelled) {
          setUsername(null);
        }
      }
    }

    fetchUsername();
    return () => {
      cancelled = true;
    };
  }, [address, activeConnector]);

  // Show ToS prompt if wallet is connected but ToS not accepted (e.g., on page refresh)
  useEffect(() => {
    if (address && username && !hasAcceptedToS) {
      promptToSAcceptance(async () => {
        try {
          await disconnectAsync();
          await (activeConnector as any).disconnect?.();
        } catch (error) {
          console.error("Failed to disconnect on ToS decline", error);
        }
        setUsername(null);
      });
    }
  }, [address, username, hasAcceptedToS, promptToSAcceptance, disconnectAsync, activeConnector]);

  if (!username) {
    return (
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await connectAsync({ connector: activeConnector as any });
            const name = await (
              activeConnector as ControllerConnector
            ).username?.();
            setUsername(name ?? null);

            promptToSAcceptance(async () => {
              await disconnectAsync();
              await (activeConnector as any).disconnect?.();
              setUsername(null);
            });
          } catch (error) {
            console.error("Failed to connect Starknet wallet", error);
          }
        }}
        className="text-xs font-semibold uppercase tracking-wide border-lsGold text-lsGold hover:bg-gray-900 hover:text-lsGold h-8 sm:h-9 px-2 sm:px-3 md:min-w-[120px]"
      >
        <Wallet className="h-4 w-4" />
        <span className="hidden sm:inline">Connect</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="bg-[#fbcb4a] text-black text-xs font-semibold uppercase tracking-wide hover:bg-[#f0b833] hover:text-black h-8 sm:h-9 px-2 sm:px-3 md:min-w-[120px]">
          <span className="inline-flex h-4 w-4 items-center justify-center">
            <img src={controllerIcon} alt="Controller" className="h-4 w-4" />
          </span>
          <span className="truncate max-w-[60px] sm:max-w-[80px]">{username}</span>
          <ChevronDown className="h-3 w-3 text-gray-700 hidden sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 text-xs text-zinc-300"
        style={{
          background: "#18181b",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          borderRadius: "0.5rem",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.5)",
        }}
      >
        <DropdownMenuItem
          onClick={() => {
            try {
              (
                activeConnector as ControllerConnector
              ).controller?.openProfile();
            } catch (error) {
              console.error("Failed to open wallet dashboard", error);
            }
          }}
          className="cursor-pointer focus:bg-white/[0.06] focus:text-white"
        >
          <Wallet className="h-4 w-4" />
          Wallet Dashboard
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/[0.06]" />
        <DropdownMenuItem
          onClick={async () => {
            try {
              await disconnectAsync();
              await (activeConnector as any).disconnect?.();
            } catch (error) {
              console.error("Failed to disconnect controller", error);
            }
            setUsername(null);
          }}
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
