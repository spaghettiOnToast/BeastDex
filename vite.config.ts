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
  optimizeDeps: {
    // Pre-bundle heavy dependencies to avoid 504 timeouts
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'starknet',
      '@starknet-react/core',
      '@cartridge/connector',
      '@cartridge/controller',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'starknet-vendor': ['starknet', '@starknet-react/core', '@starknet-react/chains'],
          'cartridge-vendor': ['@cartridge/connector', '@cartridge/controller'],
          'radix-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-avatar',
            '@radix-ui/react-progress',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
          ],
          'ui-vendor': ['lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
        },
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 600,
    // Enable minification
    minify: 'esbuild',
    // Source maps for debugging (can be disabled in production for smaller builds)
    sourcemap: false,
  },
  server: {
    https: {},
    proxy: {
      "/torii": {
        target: "https://api.cartridge.gg/x/pg-beasts/torii",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/torii/, ""),
      },
      "/arcade": {
        target: "https://api.cartridge.gg/x/arcade-main/torii",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/arcade/, ""),
      },
      "/summit-torii": {
        target: "https://api.cartridge.gg/x/pg-mainnet-10/torii",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/summit-torii/, ""),
      },
    },
  },
});
