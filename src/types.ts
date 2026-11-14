/**
 * 后端与链上的 `price` / `quantity` 一律是**最小单位（u64）**：
 * - `quantity` = base 最小单位
 * - `price`    = quote 最小单位 / base 最小单位（链上 quote = price × quantity）
 *
 * 展示用 lib/amount 的 formatPrice / formatQty，
 * 提交前用 parsePrice / parseQty 从人类输入换算。
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
