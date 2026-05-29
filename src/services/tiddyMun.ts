import { byteArray } from "starknet";
import { getPublicProvider } from "./marketplace/approvals";

export const TIDDY_MUN_CONTRACT = "0x0202d78ebda24bde4e44434bcfd2b329d6c0dde25eb2b713a8e7c3e8f4e1a8bb";

export interface TiddyMunMeta {
  tokenId: bigint;
  name: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
}

function decodeByteArrayString(raw: string[]): string {
  const dataLen = Number(BigInt(raw[0] ?? "0x0"));
  const data = raw.slice(1, 1 + dataLen);
  const pending_word = raw[1 + dataLen] ?? "0x0";
  const pending_word_len = Number(BigInt(raw[2 + dataLen] ?? "0x0"));
  return byteArray.stringFromByteArray({ data, pending_word, pending_word_len });
}

export async function fetchTiddyMunTotalSupply(): Promise<number> {
  const provider = getPublicProvider();
  const response = await provider.callContract(
    { contractAddress: TIDDY_MUN_CONTRACT, entrypoint: "total_supply", calldata: [] },
    "latest"
  );
  const raw = Array.isArray(response) ? response : (response as any).result ?? [];
  return Number(BigInt(raw[0] ?? "0x0"));
}

export async function fetchTiddyMunMeta(tokenId: bigint): Promise<TiddyMunMeta | null> {
  const provider = getPublicProvider();
  const response = await provider.callContract(
    {
      contractAddress: TIDDY_MUN_CONTRACT,
      entrypoint: "token_uri",
      calldata: [`0x${tokenId.toString(16)}`, "0x0"],
    },
    "latest"
  );
  const raw: string[] = Array.isArray(response) ? response : (response as any).result ?? [];
  if (!raw.length) return null;

  const uri = decodeByteArrayString(raw);
  const commaIdx = uri.indexOf(",");
  if (commaIdx === -1) return null;

  let json: Record<string, unknown>;
  try {
    if (uri.slice(0, commaIdx).includes("base64")) {
      json = JSON.parse(atob(uri.slice(commaIdx + 1)));
    } else {
      json = JSON.parse(uri.slice(commaIdx + 1));
    }
  } catch {
    return null;
  }

  return {
    tokenId,
    name: (json.name as string) ?? "Tiddy Mun",
    image: (json.image as string) ?? "",
    attributes: (json.attributes as TiddyMunMeta["attributes"]) ?? [],
  };
}

export async function fetchTiddyMunOwner(tokenId: bigint): Promise<string | null> {
  const provider = getPublicProvider();
  try {
    const response = await provider.callContract(
      {
        contractAddress: TIDDY_MUN_CONTRACT,
        entrypoint: "owner_of",
        calldata: [`0x${tokenId.toString(16)}`, "0x0"],
      },
      "latest"
    );
    const raw = Array.isArray(response) ? response : (response as any).result ?? [];
    return (raw[0] as string) ?? null;
  } catch {
    return null;
  }
}

export async function fetchTiddyMunTokenIdForOwner(ownerAddress: string): Promise<bigint | null> {
  const provider = getPublicProvider();
  const balanceResponse = await provider.callContract(
    { contractAddress: TIDDY_MUN_CONTRACT, entrypoint: "balance_of", calldata: [ownerAddress] },
    "latest"
  );
  const balRaw = Array.isArray(balanceResponse) ? balanceResponse : (balanceResponse as any).result ?? [];
  if (BigInt(balRaw[0] ?? "0x0") === 0n) return null;

  try {
    const idResponse = await provider.callContract(
      {
        contractAddress: TIDDY_MUN_CONTRACT,
        entrypoint: "token_of_owner_by_index",
        calldata: [ownerAddress, "0x0", "0x0"],
      },
      "latest"
    );
    const idRaw = Array.isArray(idResponse) ? idResponse : (idResponse as any).result ?? [];
    return BigInt(idRaw[0] ?? "0x1");
  } catch {
    return 1n;
  }
}
