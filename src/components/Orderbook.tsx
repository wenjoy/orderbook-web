import type { DepthLevel } from "../types";
import { formatPrice, formatQty } from "../lib/amount";

interface Props {
  bids: DepthLevel[];
  asks: DepthLevel[];
  baseDecimals: number | null;
  quoteDecimals: number | null;
  onPriceClick?: (price: number, side: "Bid" | "Ask") => void;
}

export function Orderbook({
  bids,
  asks,
  baseDecimals,
  quoteDecimals,
  onPriceClick,
}: Props) {
  // 同市场内所有档位单位一致，直接比较原始数量即可
  const maxQty = Math.max(
    1,
    ...bids.map((l) => l.quantity),
    ...asks.map((l) => l.quantity)
  );

  // asks: low→high in data; display high→low (top of book near mid)
  const asksDesc = [...asks].reverse();
  const bestBid = bids[0] ? Number(formatPrice(bids[0].price, baseDecimals, quoteDecimals)) : null;
  const bestAsk = asks[0] ? Number(formatPrice(asks[0].price, baseDecimals, quoteDecimals)) : null;
  const mid =
    bestBid != null && bestAsk != null
      ? ((bestBid + bestAsk) / 2).toFixed(2)
      : bestBid?.toFixed(2) ?? bestAsk?.toFixed(2) ?? "—";

  return (
    <div className="panel flex h-fit flex-col overflow-hidden">
      <div className="panel-title flex justify-between">
        <span>Order Book</span>
        <span className="font-mono normal-case text-gray-500">mid {mid}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-surface-3 px-3 py-1 text-[10px] uppercase text-gray-500">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Orders</span>
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {/* Asks (red) — higher prices on top */}
        <div className="min-h-[40%]">
          {asksDesc.length === 0 && (
            <p className="px-3 py-2 text-gray-600">No asks</p>
          )}
          {asksDesc.map((l) => (
            <Row
              key={`a-${l.price}`}
              level={l}
              side="Ask"
              maxQty={maxQty}
              baseDecimals={baseDecimals}
              quoteDecimals={quoteDecimals}
              onClick={() => onPriceClick?.(Number(formatPrice(l.price, baseDecimals, quoteDecimals)), "Ask")}
            />
          ))}
        </div>

        <div className="border-y border-surface-3 bg-surface px-3 py-1.5 text-center text-sm font-semibold text-gray-200">
          {mid}
        </div>

        {/* Bids (green) */}
        <div className="min-h-[40%]">
          {bids.length === 0 && (
            <p className="px-3 py-2 text-gray-600">No bids</p>
          )}
          {bids.map((l) => (
            <Row
              key={`b-${l.price}`}
              level={l}
              side="Bid"
              maxQty={maxQty}
              baseDecimals={baseDecimals}
              quoteDecimals={quoteDecimals}
              onClick={() => onPriceClick?.(Number(formatPrice(l.price, baseDecimals, quoteDecimals)), "Bid")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({
  level,
  side,
  maxQty,
  baseDecimals,
  quoteDecimals,
  onClick,
}: {
  level: DepthLevel;
  side: "Bid" | "Ask";
  maxQty: number;
  baseDecimals: number | null;
  quoteDecimals: number | null;
  onClick?: () => void;
}) {
  const pct = Math.min(100, (level.quantity / maxQty) * 100);
  const color = side === "Bid" ? "bg-bid/20" : "bg-ask/20";
  const text = side === "Bid" ? "text-bid" : "text-ask";

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative grid w-full grid-cols-3 gap-2 px-3 py-0.5 text-left hover:bg-surface-2"
    >
      <span
        className={`absolute inset-y-0 ${side === "Bid" ? "right-0" : "left-0"} ${color}`}
        style={{ width: `${pct}%` }}
      />
      <span className={`relative ${text}`}>
        {formatPrice(level.price, baseDecimals, quoteDecimals)}
      </span>
      <span className="relative text-right text-gray-300">
        {formatQty(level.quantity)}
      </span>
      <span className="relative text-right text-gray-500">{level.order_count}</span>
    </button>
  );
}
