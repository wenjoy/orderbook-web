/** 前端写死的可交易对列表（当前仅一对，默认选中） */
export type MarketPair = {
  id: string;
  symbol: string;
  baseMint: string;
  quoteMint: string;
  baseSymbol: string;
  quoteSymbol: string;
};

