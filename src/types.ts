/**
 * 后端与链上的 `price` / `quantity` 都是 **u64**：
 * - `quantity` 是纯整数，前端不做任何 decimal 换算，原样提交/展示
 * - `price`    需要按两个 mint 的精度差换算（见 lib/amount 的 parsePrice/formatPrice）
 *
 * 链上结算按 quote = price × quantity 计算。
 */
export type Side = "Bid" | "Ask";

export interface DepthLevel {
  price: number;
  quantity: number;
  order_count: number;
}

export interface Trade {
  taker_order_id: number;
  maker_order_id: number;
  price: number;
  quantity: number;
  taker_side: Side;
  taker_user: string;
  maker_user: string;
}

export interface Orderbook {
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export interface LocalOrder {
  id: number;
  side: Side;
  price: number;
  remaining: number;
  user: string;
}

export type SettlementStatus =
  | "pending"
  | "simulated"
  | "submitted"
  | "confirmed"
  | "failed";

export interface SettlementJob {
  id: number;
  status: SettlementStatus;
  trade: Trade;
  ix_data_hex: string;
  accounts: {
    authority: string;
    market: string;
    maker_vault: string;
    taker_vault: string;
  };
  signature: string | null;
  error: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface PlaceOrderResponse {
  order_id: number | null;
  trades: Trade[];
  remaining: number | null;
  settlements: SettlementJob[];
}

export type WsEvent =
  | { type: "OrderbookUpdate"; data: Orderbook }
  | { type: "Trade"; data: Trade }
  | {
      type: "OrderPlaced";
      data: {
        order_id: number;
        side: Side;
        price: number;
        remaining: number;
        user: string;
      };
    }
  | { type: "OrderCancelled"; data: { order_id: number } }
  | {
      type: "SettlementUpdate";
      data: {
        settlement_id: number;
        status: SettlementStatus;
        signature: string | null;
        trade_price: number;
        trade_quantity: number;
      };
    };
