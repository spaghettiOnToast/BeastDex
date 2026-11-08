import { useEffect, useRef } from "react";
import { useAccount } from "@starknet-react/core";
import { useNavigate } from "react-router-dom";
import { normaliseStarknetAddress } from "../utils/address";

/**
 * On a page showing the connected wallet's own profile, follow wallet switches:
 * when a different wallet connects (e.g. log out of one and connect another),
 * go to the new wallet's page instead of staying on the previous one's.
 * Other people's profiles are left alone, and so is logging out.
 */
export function useFollowConnectedWallet(viewedAddress: string | null | undefined, basePath: "/collection" | "/account") {
  const { address } = useAccount();
  const navigate = useNavigate();
  // Last wallet that was connected; survives the gap between log-out and log-in.
  const lastConnectedRef = useRef<string | null>(normaliseStarknetAddress(address));

  useEffect(() => {
    const current = normaliseStarknetAddress(address);
    if (!current) return; // logged out: keep showing the page
    const previous = lastConnectedRef.current;
    lastConnectedRef.current = current;
    if (!previous || previous === current) return;
    const viewed = normaliseStarknetAddress(viewedAddress ?? null);
    if (viewed && viewed === previous) {
      navigate(`${basePath}/${current}`, { replace: true });
    }
  }, [address, viewedAddress, basePath, navigate]);
}
