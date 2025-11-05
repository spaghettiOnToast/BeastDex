import { StarknetIdNavigator } from "starknetid.js";
import { Provider, constants } from "starknet";

class StarknetIdService {
  private navigator: StarknetIdNavigator | null = null;
  private initPromise: Promise<void> | null = null;

  private async init() {
    if (this.navigator) return;

    try {
      const provider = new Provider();
      this.navigator = new StarknetIdNavigator(
        provider,
        constants.StarknetChainId.SN_MAIN
      );
    } catch (error) {
      console.warn("Failed to initialize Starknet.id service:", error);
    }
  }

  private async ensureInitialized() {
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    await this.initPromise;
  }

  async getStarkName(address: string): Promise<string | null> {
    try {
      await this.ensureInitialized();
      if (!this.navigator) return null;

      const starkName = await this.navigator.getStarkName(address);
      return starkName || null;
    } catch (error) {
      console.warn(`Failed to resolve Starknet.id for address ${address}:`, error);
      return null;
    }
  }

  async getStarkNames(addresses: string[]): Promise<Record<string, string | null>> {
    if (addresses.length === 0) return {};

    try {
      await this.ensureInitialized();
      if (!this.navigator) {
        return addresses.reduce((acc, addr) => ({ ...acc, [addr.toLowerCase()]: null }), {});
      }

      const results = await this.navigator.getStarkNames(addresses);

      // Handle case where results is not an array (API error)
      if (!Array.isArray(results)) {
        console.warn("Starknet.id API returned non-array result:", results);
        return addresses.reduce((acc, addr) => ({ ...acc, [addr.toLowerCase()]: null }), {});
      }

      // Convert to our expected format
      const resolved: Record<string, string | null> = {};
      addresses.forEach((address, index) => {
        resolved[address.toLowerCase()] = results[index] || null;
      });

      return resolved;
    } catch (error) {
      console.warn("Failed to resolve multiple Starknet.id names:", error);
      return addresses.reduce((acc, addr) => ({ ...acc, [addr.toLowerCase()]: null }), {});
    }
  }

  async getAddressFromStarkName(starkName: string): Promise<string | null> {
    try {
      await this.ensureInitialized();
      if (!this.navigator) return null;

      const address = await this.navigator.getAddressFromStarkName(starkName);
      return address || null;
    } catch (error) {
      console.warn(`Failed to resolve address for Starknet.id ${starkName}:`, error);
      return null;
    }
  }
}

export const starknetIdService = new StarknetIdService();