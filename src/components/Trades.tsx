import type { Trade } from "../types";
import { formatPrice, formatQty } from "../lib/amount";
import { formatClock, formatDateTime } from "../lib/time";

interface Props {
  trades: Trade[];
  baseDecimals: number | null;
  quoteDecimals: number | null;
}

export function Trades({ trades, baseDecimals, quoteDecimals }: Props) {
  const list = [...trades].reverse().slice(0, 40);

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="panel-title">Recent Trades</div>
      <div className="grid grid-cols-5 gap-1 border-b border-surface-3 px-3 py-1 text-[10px] uppercase text-gray-500">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Side</span>
        <span className="text-right">Taker</span>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {list.length === 0 && (
          <p className="px-3 py-4 text-center text-gray-600">No trades yet</p>
        )}
        {list.map((t, i) => {
          const buy = t.side === "Bid";
          return (
            <div
              key={`${t.taker_order_id}-${t.maker_order_id}-${i}`}
              className="grid grid-cols-5 gap-1 px-3 py-0.5 hover:bg-surface-2"
            >
              <span
                className="truncate text-[10px] text-gray-500"
                title={formatDateTime(t.timestamp)}
              >
                {formatClock(t.timestamp)}
              </span>
              <span className={`text-right ${buy ? "text-bid" : "text-ask"}`}>
                {formatPrice(t.price, baseDecimals, quoteDecimals)}
              </span>
              <span className="truncate text-right text-gray-300">
                {formatQty(t.quantity, baseDecimals)}
              </span>
              <span className={`text-right ${buy ? "text-bid" : "text-ask"}`}>
                {buy ? "buy" : "sell"}
              </span>
              <span className="truncate text-right text-gray-500">
                {t.taker_user}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
