/**
 * 可交易对（市场）
 *
 * 市场列表由后端 `GET /markets` 提供，前端不再写死任何 mint。
 * 后端返回 snake_case，这里统一归一化成前端的 camelCase `MarketPair`。
 */
export type MarketPair = {
  id: string;
  symbol: string;
  baseMint: string;
  quoteMint: string;
  baseSymbol: string;
  quoteSymbol: string;
};

/** 后端 `GET /markets` 的原始返回结构 */
export type ApiMarket = {
  id: number | string;
  symbol: string;
  base_symbol: string;
  quote_symbol: string;
  base_mint: string;
  quote_mint: string;
};

/** 把后端 snake_case 记录归一化为前端 `MarketPair` */
export function toMarketPair(m: ApiMarket): MarketPair {
  return {
    id: String(m.id),
    symbol: m.symbol,
    baseMint: m.base_mint,
    quoteMint: m.quote_mint,
    baseSymbol: m.base_symbol,
    quoteSymbol: m.quote_symbol,
  };
}
