import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { normaliseStarknetAddress } from "../utils/address";
import { lookupControllerAddresses } from "../services/controller";
import { config } from "../config";

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
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();

  const handleSearch = useCallback(async (query?: string) => {
    const searchQuery = (query ?? searchValue).trim();
    if (!searchQuery) return;

    setIsSearching(true);
    try {
      // Check if it's a numeric ID (beast search)
      const numericId = Number.parseInt(searchQuery, 10);
      if (!Number.isNaN(numericId) && searchQuery === String(numericId)) {
        navigate(`/beasts/${numericId}`);
        return;
      }

      // Check if it's a Starknet address
      const normalizedAddress = normaliseStarknetAddress(searchQuery);
      if (normalizedAddress && normalizedAddress.startsWith("0x")) {
        navigate(`/account/${encodeURIComponent(normalizedAddress)}`);
        return;
      }

      // Try to resolve as username
      try {
        const addresses = await lookupControllerAddresses([searchQuery]);
        const userAddresses = addresses[searchQuery.toLowerCase()] ?? [];
        if (userAddresses.length > 0) {
          navigate(`/account/${encodeURIComponent(searchQuery)}`);
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