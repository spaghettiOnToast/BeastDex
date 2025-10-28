import { RpcProvider } from 'starknet';

export type TxFinalOutcome = 'success' | 'reverted' | 'rejected' | 'timeout' | 'unknown';

function resolveRpcUrl(): string {
  const envUrl = (import.meta as any)?.env?.VITE_RPC_URL as string | undefined;
  return envUrl || 'https://api.cartridge.gg/x/starknet/mainnet';
}

export async function waitForTx(
  txHash: string,
  {
    timeoutMs = 120_000,
    pollIntervalMs = 3_000,
  }: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<TxFinalOutcome> {
  const provider = new RpcProvider({ nodeUrl: resolveRpcUrl() });
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const receipt: any = await provider.getTransactionReceipt(txHash);
      const finality = receipt?.finality_status || receipt?.status;
      const exec = receipt?.execution_status;

      // Handle execution reverted
      if (exec === 'REVERTED') return 'reverted';

      // Finalized / accepted on L2/L1
      if (finality === 'ACCEPTED_ON_L2' || finality === 'ACCEPTED_ON_L1') {
        if (exec === 'SUCCEEDED' || !exec) return 'success';
        if (exec === 'REVERTED') return 'reverted';
        return 'success';
      }

      if (finality === 'REJECTED') return 'rejected';
      // NOT_RECEIVED/RECEIVED -> keep polling
    } catch (err) {
      // If not found yet, keep polling
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  return 'timeout';
}

