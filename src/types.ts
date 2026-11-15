/**
 * 后端与链上的 `price` / `quantity` 都是 **u64 最小单位**：
 * - `quantity` = base 最小单位（UI 内部按 10^baseDecimals 换算）
 * - `price`    = quote 最小单位 / base 最小单位（UI 内部按 10^(quoteDec-baseDec) 换算）
 *
 * 链上结算按 quote = price × quantity 计算。
 * 界面上全部展示人类单位，换算只在内部进行。
 */
export type Side = "Bid" | "Ask";

export interface DepthLevel {
  price: number;
  quantity: number;
  order_count: number;
}

export interface Trade {
  id: string;
  /** UUID 字符串 */
  taker_order_id: string;
  maker_order_id: string;
  price: number;
  quantity: number;
  /** ISO 时间戳（后端 chrono DateTime<Utc>） */
  timestamp: string;
  /** taker 的方向 */
  side: Side;
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
