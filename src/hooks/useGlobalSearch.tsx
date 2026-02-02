import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { normaliseStarknetAddress } from "../utils/address";
import { lookupControllerAddresses } from "../services/controller";
import { config } from "../config";

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

  const handleSearch = useCallback(async (query?: string) => {
    const searchQuery = (query ?? searchValue).trim();
    if (!searchQuery) return;

    setIsSearching(true);
    try {
      // Clear search value after successful search like normal search bars
      setSearchValue("");
      // Check if it's a numeric ID (beast search)
      const numericId = Number.parseInt(searchQuery, 10);
      if (!Number.isNaN(numericId) && searchQuery === String(numericId)) {
        navigate(`/beasts/${numericId}`);
        return;
      }

      // Check if it's a valid Starknet address (must be hex after 0x)
      const normalizedAddress = normaliseStarknetAddress(searchQuery);
      if (normalizedAddress && normalizedAddress.startsWith("0x") && isValidHexAddress(searchQuery)) {
        navigate(`/collection/${encodeURIComponent(normalizedAddress)}`);
        return;
      }

      // Try to resolve as Cartridge username
      try {
        const addresses = await lookupControllerAddresses([searchQuery]);
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
  }, [searchValue, navigate]);

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