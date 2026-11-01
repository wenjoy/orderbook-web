/** 前端写死的可交易对列表（当前仅一对，默认选中） */
export type MarketPair = {
  id: string;
  symbol: string;
  baseMint: string;
  quoteMint: string;
  baseSymbol: string;
  quoteSymbol: string;
};

/**
 * Demo mints — 本地 validator / 文档用占位；
 * 接真网时改成真实 mint 即可，用户从下拉选择。
 */
export const MARKET_PAIRS: MarketPair[] = [
  {
    id: "base-quote",
    symbol: "BASE/QUOTE",
    baseSymbol: "BASE",
    quoteSymbol: "QUOTE",
    // 固定演示 mint（合法 base58 形态，便于 PDA / API 构造）
    baseMint: "7Nt8adhPuWCBTjbBy3WqJrXrhLctwR9oQMXmuDcUQSFg",
    quoteMint: "8yXFT7zGrFj9iMiQHuXy1qLvn7YNs7q4sUw6tDUYVYmv",
  },
];

export const DEFAULT_MARKET = MARKET_PAIRS[0];

export function findMarket(id: string): MarketPair {
  return MARKET_PAIRS.find((m) => m.id === id) ?? DEFAULT_MARKET;
}
