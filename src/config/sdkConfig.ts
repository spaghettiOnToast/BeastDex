/**
 * SDK Configuration Patching
 *
 * Patches the Cartridge SDK config to fix incorrect values and apply
 * environment-specific overrides before SDK initialization.
 */

import { configs } from "@cartridge/marketplace";
import { constants } from "starknet";

type SdkConfig = (typeof configs)[typeof constants.StarknetChainId.SN_MAIN];

interface ConfigOverrides {
  worldAddress?: string;
  rpcUrl?: string;
  marketplaceAddress?: string;
}

/**
 * Patches the SDK config to fix broken URLs and apply environment overrides.
 * Must be called BEFORE initSDK() to ensure the SDK uses correct values.
 */
export function patchSdkConfig(overrides: ConfigOverrides = {}): SdkConfig {
  const config = configs[constants.StarknetChainId.SN_MAIN];

  // Fix incorrect toriiUrl in Cartridge SDK (arcade-mainnet -> arcade-main)
  if (config?.toriiUrl) {
    const originalUrl = config.toriiUrl;
    config.toriiUrl = config.toriiUrl.replace(/arcade-mainnet/g, "arcade-main");

    if (import.meta.env.DEV && originalUrl !== config.toriiUrl) {
      console.log(`[SDK] Fixed Torii URL: ${originalUrl} -> ${config.toriiUrl}`);
    }
  }

  // Override World address from env or explicit override
  const worldAddress = overrides.worldAddress ?? import.meta.env.VITE_WORLD_ADDRESS?.trim();
  if (worldAddress && config?.manifest?.world?.address) {
    const prevWorld = config.manifest.world.address;
    if (prevWorld?.toLowerCase() !== worldAddress.toLowerCase()) {
      (config.manifest as any).world = { ...(config.manifest as any).world, address: worldAddress };
      if (import.meta.env.DEV) {
        console.log(`[SDK] Overrode World address: ${prevWorld} -> ${worldAddress}`);
      }
    }
  }

  // Override RPC URL from env or explicit override
  const rpcUrl = overrides.rpcUrl ?? import.meta.env.VITE_RPC_URL?.trim();
  if (rpcUrl && config?.rpcUrl && config.rpcUrl !== rpcUrl) {
    const prevRpc = config.rpcUrl;
    (config as any).rpcUrl = rpcUrl;
    if (import.meta.env.DEV) {
      console.log(`[SDK] Overrode RPC URL: ${prevRpc} -> ${rpcUrl}`);
    }
  }

  // Override Marketplace contract address from env or explicit override
  const marketplaceAddress = overrides.marketplaceAddress ?? import.meta.env.VITE_MARKETPLACE_ADDRESS?.trim();
  if (marketplaceAddress && config?.manifest?.contracts && Array.isArray((config.manifest as any).contracts)) {
    const contracts = (config.manifest as any).contracts as Array<{ tag?: string; address?: string }>;
    const idx = contracts.findIndex((c) => (c?.tag || "").toUpperCase() === "MARKETPLACE-MARKETPLACE");
    if (idx >= 0) {
      const prev = contracts[idx].address;
      contracts[idx] = { ...contracts[idx], address: marketplaceAddress };
      if (import.meta.env.DEV) {
        console.log(`[SDK] Overrode Marketplace address: ${prev} -> ${marketplaceAddress}`);
      }
    }
  }

  return config;
}

/**
 * Gets the marketplace contract address from the SDK config.
 */
export function getMarketplaceAddress(config: SdkConfig): string {
  try {
    const contracts = (config?.manifest as any)?.contracts ?? [];
    const entry = Array.isArray(contracts)
      ? contracts.find((c: any) => (c?.tag || "").toUpperCase() === "MARKETPLACE-MARKETPLACE")
      : null;
    return entry?.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Logs SDK configuration for debugging purposes.
 */
export function logSdkConfig(config: SdkConfig): void {
  if (!import.meta.env.DEV) return;

  console.log("[SDK] Configuration:");
  console.log("  Torii URL:", config?.toriiUrl);
  console.log("  World Address:", config?.manifest?.world?.address);
  console.log("  Marketplace Address:", getMarketplaceAddress(config));
}
