/**
 * Loot Survivor buyback pools: Loot Dungeon beasts sell instantly for
 * Starknet ETH (lootsurvivor.io/lootbag → "sell immediately for ETH").
 *
 * Ten GDA pools, one per tier (1-5) for normal beasts and one per tier for
 * Megas, each covering six species. A pool's `get_sell_nft_quote(id, 1)`
 * returns an NFTQuote whose `amount` is what the seller receives (the same
 * figure lootsurvivor.io shows); the quote depends on the pool, not the token.
 * Pool list mirrors lootsurvivor.io's config (factory 0x03c541…1337).
 */
import { beastsV3 } from "@provable-games/collectables";
import { batchCall } from "./lootDungeon";

export const BUYBACK_TOKEN = {
  symbol: "ETH",
  address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  decimals: 18,
};

export type BuybackPool = { pair: string; tier: number; mega: boolean; species: number[] };

const TIER_SPECIES = [
  [78, 79, 88, 89, 98, 99],
  [80, 81, 90, 91, 100, 101],
  [82, 83, 92, 93, 102, 103],
  [84, 85, 94, 95, 104, 105],
  [86, 87, 96, 97, 106, 107],
];

const BEAST_PAIRS = [
  "0x045b30f28826bb61f85b2d357c0aeacb6543e8f88e797ad1728224e99e87ae7f",
  "0x04d1ae4abc19f75aa4d79e0c5a830850f464a40eca1ec18861bc9774d58bb3ef",
  "0x06ad78117e48b13b9733da751c12c7dabb936d50dc78f410ee380799c956c1e3",
  "0x0765cb969d1b875df19b8e766442214efe4cef4551988c2b751d75c797f7b5fd",
  "0x05559044a0123b38e2f0f5c830d8c2cdd3077ae94e15f77b80bb68ae6129d28c",
];

const MEGA_PAIRS = [
  "0x0621bde4b28ed47c402e81f510bff6258438da3931ea714e9191b5fcc11a5baa",
  "0x00194be6400b870901bff7ddc84aa3a83cc50c9d75aa8220658a88a4ed4c4df2",
  "0x06b449b0bec31bf33615ca2efd0482404726efb068082bbc2d1640907da67030",
  "0x0757dcc3913df8302ea87308f79377f6a3401281047fa7d804d76cb63a5dc6f0",
  "0x07b469185ae44e31e37eaca7649e8ba9dea5f58fc591492733afe64342a68c71",
];

export const BUYBACK_POOLS: BuybackPool[] = [
  ...BEAST_PAIRS.map((pair, i) => ({ pair, tier: i + 1, mega: false, species: TIER_SPECIES[i] })),
  ...MEGA_PAIRS.map((pair, i) => ({ pair, tier: i + 1, mega: true, species: TIER_SPECIES[i] })),
];

export function buybackPoolFor(speciesId: number, mega: boolean): BuybackPool | undefined {
  return BUYBACK_POOLS.find((p) => p.mega === mega && p.species.includes(speciesId));
}

export type SellQuote = {
  /** ETH (wei) the seller receives */
  amount: bigint;
  /** the pool holds enough ETH to pay it */
  liquid: boolean;
  tier: number;
};

export type SellQuotes = { beast: SellQuote | null; mega: SellQuote | null };

/** NFTQuote felts: [error, new_spot_price, new_delta, amount.lo, amount.hi, protocol_fee(2), royalty(2)]. */
export function quoteAmount(r: string[] | undefined): bigint | null {
  if (!r || r.length < 5 || BigInt(r[0]) !== 0n) return null;
  return BigInt(r[3]) + (BigInt(r[4]) << 128n);
}

const QUOTE_TTL_MS = 30_000;
let quoteCache: { at: number; quotes: Promise<Map<string, SellQuote | null>> } | null = null;

/** Current sell quote and ETH balance of every pool (keyed by pair), cached briefly. */
async function poolQuotes(sampleTokenId: string): Promise<Map<string, SellQuote | null>> {
  if (quoteCache && Date.now() - quoteCache.at < QUOTE_TTL_MS) return quoteCache.quotes;
  const id = BigInt(sampleTokenId);
  const idCalldata = [`0x${(id & ((1n << 128n) - 1n)).toString(16)}`, `0x${(id >> 128n).toString(16)}`];
  const quotes = (async () => {
    const res = await batchCall([
      ...BUYBACK_POOLS.map((p) => ({ contract: p.pair, entrypoint: "get_sell_nft_quote", calldata: [...idCalldata, "0x1", "0x0"] })),
      ...BUYBACK_POOLS.map((p) => ({ contract: BUYBACK_TOKEN.address, entrypoint: "balance_of", calldata: [p.pair] })),
    ]);
    const n = BUYBACK_POOLS.length;
    return new Map(
      BUYBACK_POOLS.map((p, i) => {
        const amount = quoteAmount(res[i]);
        const [lo = "0x0", hi = "0x0"] = res[n + i] ?? [];
        const balance = BigInt(lo) + (BigInt(hi) << 128n);
        return [p.pair, amount === null ? null : { amount, liquid: balance >= amount, tier: p.tier }];
      }),
    );
  })();
  quoteCache = { at: Date.now(), quotes };
  quotes.catch(() => {
    if (quoteCache?.quotes === quotes) quoteCache = null;
  });
  return quotes;
}

/** Instant-sell price per token: as a normal beast now, and once it's a Mega. */
export async function fetchSellQuotes(tokenIds: readonly string[]): Promise<Map<string, SellQuotes>> {
  const out = new Map<string, SellQuotes>();
  if (tokenIds.length === 0) return out;
  const quotes = await poolQuotes(tokenIds[0]);
  for (const tokenId of tokenIds) {
    const species = Number(beastsV3.speciesOfTokenId(BigInt(tokenId)));
    const beastPool = buybackPoolFor(species, false);
    const megaPool = buybackPoolFor(species, true);
    out.set(tokenId, {
      beast: beastPool ? quotes.get(beastPool.pair) ?? null : null,
      mega: megaPool ? quotes.get(megaPool.pair) ?? null : null,
    });
  }
  return out;
}

/** "0.012", "0.000056": two significant digits below 1 ETH. */
export function formatEth(wei: bigint): string {
  const eth = Number(wei) / 10 ** BUYBACK_TOKEN.decimals;
  if (eth === 0) return "0";
  if (eth >= 1) return eth.toFixed(3).replace(/\.?0+$/, "");
  return eth.toPrecision(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** USD value of an ETH (wei) amount: "$0.17", "<$0.01", or null without a price. */
export function formatEthUsd(wei: bigint, ethUsd: number | null | undefined): string | null {
  if (!ethUsd || !Number.isFinite(ethUsd)) return null;
  const usd = (Number(wei) / 10 ** BUYBACK_TOKEN.decimals) * ethUsd;
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
