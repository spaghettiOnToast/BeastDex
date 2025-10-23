import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { apiCache } from "./services/apiCache";

// Expose apiCache in dev mode for debugging and clear cache on app start
if (import.meta.env.DEV) {
  (window as any).apiCache = apiCache;
  // Clear cache on app start to ensure fresh data after config changes
  apiCache.clearAll();
  console.log("🧹 API cache cleared on dev mode startup");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
