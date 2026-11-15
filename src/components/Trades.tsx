import type { Trade } from "../types";
import { formatPrice, formatQty } from "../lib/amount";

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
      <div className="grid grid-cols-4 gap-1 border-b border-surface-3 px-3 py-1 text-[10px] uppercase text-gray-500">
        <span>Price</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Side</span>
        <span className="text-right">Taker</span>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {list.length === 0 && (
          <p className="px-3 py-4 text-center text-gray-600">No trades yet</p>
        )}
        {list.map((t, i) => {
          const buy = t.taker_side === "Bid";
          return (
            <div
              key={`${t.taker_order_id}-${t.maker_order_id}-${i}`}
              className="grid grid-cols-4 gap-1 px-3 py-0.5 hover:bg-surface-2"
            >
              <span className={buy ? "text-bid" : "text-ask"}>
                {formatPrice(t.price, baseDecimals, quoteDecimals)}
              </span>
              <span className="text-right text-gray-300">
                {formatQty(t.quantity)}
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
