import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import mkcert from "vite-plugin-mkcert";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), mkcert()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    https: {},
    proxy: {
      "/torii": {
        target: "https://api.cartridge.gg/x/pg-mainnet-4/torii",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/torii/, ""),
      },
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
