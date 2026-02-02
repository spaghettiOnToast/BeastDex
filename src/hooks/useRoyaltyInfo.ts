import { useState, useEffect } from "react";
import { useAccount } from "@starknet-react/core";
import { getProvider, queryRoyaltyInfo, getRoyaltyPercentage } from "../services/marketplace/approvals";
import { BEASTS_COLLECTION_ADDRESS } from "../services/marketplace/constants";

interface RoyaltyInfo {
  percentage: number | null;
  loading: boolean;
  error: string | null;
  // Calculate royalty amount for a given price
  calculateRoyalty: (price: bigint) => bigint;
}

// Cache the royalty percentage since it's typically constant for a collection
let cachedPercentage: number | null = null;
let cachePromise: Promise<number | null> | null = null;

/**
 * Hook to fetch and use royalty information for the Beasts collection
 */
export function useRoyaltyInfo(): RoyaltyInfo {
  const { account } = useAccount();
  const [percentage, setPercentage] = useState<number | null>(cachedPercentage);
  const [loading, setLoading] = useState(cachedPercentage === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedPercentage !== null) {
      setPercentage(cachedPercentage);
      setLoading(false);
      return;
    }

    if (!account) {
      setLoading(false);
      return;
    }

    const fetchRoyalty = async () => {
      // Use existing promise if already fetching
      if (cachePromise) {
        const result = await cachePromise;
        setPercentage(result);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      cachePromise = (async () => {
        try {
          const provider = getProvider(account);
          const pct = await getRoyaltyPercentage(provider, BEASTS_COLLECTION_ADDRESS);
          cachedPercentage = pct;
          return pct;
        } catch (err) {
          console.error("Failed to fetch royalty info:", err);
          return null;
        }
      })();

      const result = await cachePromise;
      setPercentage(result);
      setLoading(false);
    };

    fetchRoyalty();
  }, [account]);

  const calculateRoyalty = (price: bigint): bigint => {
    if (percentage === null || percentage === 0) return 0n;
    // Calculate: price * percentage / 100
    return (price * BigInt(Math.round(percentage * 100))) / 10000n;
  };

  return {
    percentage,
    loading,
    error,
    calculateRoyalty,
  };
}

/**
 * Hook to get detailed royalty info for a specific token and price
 */
export function useRoyaltyForPrice(tokenId: string | null, price: bigint | null) {
  const { account } = useAccount();
  const [royaltyAmount, setRoyaltyAmount] = useState<bigint | null>(null);
  const [receiver, setReceiver] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account || !tokenId || !price || price <= 0n) {
      setRoyaltyAmount(null);
      setReceiver(null);
      return;
    }

    const fetchRoyalty = async () => {
      setLoading(true);
      try {
        const provider = getProvider(account);
        const tokenIdBigInt = BigInt(tokenId);
        const info = await queryRoyaltyInfo(provider, BEASTS_COLLECTION_ADDRESS, tokenIdBigInt, price);

        if (info) {
          setRoyaltyAmount(info.royaltyAmount);
          setReceiver(info.receiver);
        } else {
          setRoyaltyAmount(null);
          setReceiver(null);
        }
      } catch (err) {
        console.error("Failed to fetch royalty for price:", err);
        setRoyaltyAmount(null);
        setReceiver(null);
      } finally {
        setLoading(false);
      }
    };

    fetchRoyalty();
  }, [account, tokenId, price?.toString()]);

  return { royaltyAmount, receiver, loading };
}
