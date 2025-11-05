import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { apiCache } from "./services/apiCache";

// Expose apiCache in dev mode for debugging
if (import.meta.env.DEV) {
  (window as any).apiCache = apiCache;
  // Only clear cache on hard refresh (Cmd+Shift+R) to improve dev performance
  // Manual clear: window.apiCache.clearAll()
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
