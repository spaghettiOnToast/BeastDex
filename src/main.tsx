import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./index.css";
import App from "./App.tsx";
import { apiCache } from "./services/apiCache";

// Expose apiCache in dev mode for debugging
if (import.meta.env.DEV) {
  (window as any).apiCache = apiCache;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default cache settings for better performance
      staleTime: 60_000, // Consider data fresh for 1 minute
      gcTime: 5 * 60_000, // Keep unused data in cache for 5 minutes
      refetchOnWindowFocus: false, // Don't refetch on tab switch (reduces API calls)
      retry: 2, // Retry failed requests twice
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
);
