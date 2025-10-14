import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import mkcert from "vite-plugin-mkcert";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), mkcert(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    https: {},
    proxy: {
      "/torii": {
        target: "https://api.cartridge.gg/x/pg-mainnet-5/torii",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/torii/, ""),
      },
    },
  },
});
