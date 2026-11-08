import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { normaliseStarknetAddress } from "../utils/address";
import { lookupProfileAddresses } from "../services/walletNames";
import { config } from "../config";
import { toTokenIdString } from "../utils/tokenId";

function isValidHexAddress(value: string): boolean {
  if (!value.startsWith("0x") || value.length < 3) {
    return false;
  }
  const hexPart = value.slice(2);
  return /^[0-9a-fA-F]+$/.test(hexPart);
}

interface GlobalSearchContextType {
  searchValue: string;
  setSearchValue: (value: string) => void;
  handleSearch: (query?: string) => Promise<void>;
  isSearching: boolean;
  debouncedSearch: (query: string) => void;
}

const GlobalSearchContext = createContext<GlobalSearchContextType | undefined>(undefined);

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [searchValue, setSearchValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Use ref to access searchValue without adding it as a dependency
  const searchValueRef = useRef(searchValue);
  searchValueRef.current = searchValue;

  const handleSearch = useCallback(async (query?: string) => {
    const searchQuery = (query ?? searchValueRef.current).trim();
    if (!searchQuery) return;

    setIsSearching(true);
    try {
      // Clear search value after successful search like normal search bars
      setSearchValue("");
      // Decimal token id (beast search). v3 ids are 251-bit, so match digits
      // rather than parsing into a JS number. Hex input is treated as an address.
      if (/^\d+$/.test(searchQuery)) {
        const tokenId = toTokenIdString(searchQuery);
        if (tokenId) {
          navigate(`/beasts/${tokenId}`);
          return;
        }
      }

      // Check if it's a valid Starknet address (must be hex after 0x)
      const normalizedAddress = normaliseStarknetAddress(searchQuery);
      if (normalizedAddress && normalizedAddress.startsWith("0x") && isValidHexAddress(searchQuery)) {
        navigate(`/collection/${encodeURIComponent(normalizedAddress)}`);
        return;
      }

      // Try to resolve as Cartridge username
      try {
        const addresses = await lookupProfileAddresses([searchQuery]);
        const userAddresses = addresses[searchQuery.toLowerCase()] ?? [];
        if (userAddresses.length > 0) {
          navigate(`/collection/${encodeURIComponent(searchQuery)}`);
          return;
        }
      } catch (error) {
        console.warn("Failed to resolve username:", error);
      }

      // Fall back to beast search on home page
      navigate(`/?search=${encodeURIComponent(searchQuery)}`);
    } catch (error) {
      console.error("Search failed:", error);
      // Fall back to beast search
      navigate(`/?search=${encodeURIComponent(searchQuery)}`);
    } finally {
      setIsSearching(false);
    }
  }, [navigate]);

  const debouncedSearch = useCallback((query: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      handleSearch(query);
    }, config.api.debounceDelay);
  }, [handleSearch]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return (
    <GlobalSearchContext.Provider value={{
      searchValue,
      setSearchValue,
      handleSearch,
      isSearching,
      debouncedSearch,
    }}>
      {children}
    </GlobalSearchContext.Provider>
  );
}

export function useGlobalSearch() {
  const context = useContext(GlobalSearchContext);
  if (context === undefined) {
    throw new Error("useGlobalSearch must be used within a GlobalSearchProvider");
  }
  return context;
}